import AppKit
import Foundation
import ImagePlayground

enum ImagePlaygroundServiceError: Error, Equatable, LocalizedError, Sendable {
    case unavailable
    case cancelled
    case presentationUnavailable
    case invalidImage

    var errorDescription: String? {
        switch self {
        case .unavailable: "Image Playground is unavailable on this Mac."
        case .cancelled: "Image creation was cancelled."
        case .presentationUnavailable: "Image Playground could not be presented."
        case .invalidImage: "Image Playground returned an invalid image."
        }
    }
}

@MainActor
protocol ImagePlaygroundPresenting: AnyObject, Sendable {
    var isAvailable: Bool { get }
    func createImage(concept: String) async throws -> Data
}

@MainActor
final class ImagePlaygroundRequestLifecycle {
    private var activeID: UUID?

    var isActive: Bool { activeID != nil }

    func begin() throws -> UUID {
        guard activeID == nil else { throw GenerationServiceError.concurrentRequest }
        let id = UUID()
        activeID = id
        return id
    }

    func finish(id: UUID, result: Result<Data, Error>) -> Result<Data, Error>? {
        guard activeID == id else { return nil }
        activeID = nil
        return result
    }
}

@MainActor
final class AppKitImagePlaygroundPresenter: NSObject, ImagePlaygroundPresenting, ImagePlaygroundViewController.Delegate {
    private let lifecycle = ImagePlaygroundRequestLifecycle()
    private var continuation: CheckedContinuation<Data, Error>?
    private var requestID: UUID?
    private weak var presentingController: NSViewController?
    private var playgroundController: ImagePlaygroundViewController?

    var isAvailable: Bool { ImagePlaygroundViewController.isAvailable }

    func createImage(concept: String) async throws -> Data {
        guard isAvailable else { throw ImagePlaygroundServiceError.unavailable }
        guard let controller = NSApp.keyWindow?.contentViewController
                ?? NSApp.windows.first(where: { $0.isVisible })?.contentViewController
        else { throw ImagePlaygroundServiceError.presentationUnavailable }
        let id = try lifecycle.begin()

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let playground = ImagePlaygroundViewController()
                playground.concepts = [.text(String(concept.prefix(2_000)))]
                playground.delegate = self
                self.continuation = continuation
                requestID = id
                presentingController = controller
                playgroundController = playground
                if Task.isCancelled {
                    complete(id: id, result: .failure(ImagePlaygroundServiceError.cancelled))
                } else {
                    controller.presentAsSheet(playground)
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.complete(id: id, result: .failure(ImagePlaygroundServiceError.cancelled))
            }
        }
    }

    func imagePlaygroundViewController(
        _ imagePlaygroundViewController: ImagePlaygroundViewController,
        didCreateImageAt imageURL: URL
    ) {
        guard imagePlaygroundViewController === playgroundController,
              let requestID
        else { return }
        let result: Result<Data, Error>
        do {
            let temporaryData = try Data(contentsOf: imageURL, options: [.mappedIfSafe])
            guard !temporaryData.isEmpty,
                  let bitmap = NSBitmapImageRep(data: temporaryData),
                  let pngData = bitmap.representation(using: .png, properties: [:]),
                  !pngData.isEmpty
            else { throw ImagePlaygroundServiceError.invalidImage }
            result = .success(pngData)
        } catch {
            result = .failure(error is ImagePlaygroundServiceError ? error : ImagePlaygroundServiceError.invalidImage)
        }
        complete(id: requestID, result: result)
    }

    func imagePlaygroundViewControllerDidCancel(_ imagePlaygroundViewController: ImagePlaygroundViewController) {
        guard imagePlaygroundViewController === playgroundController,
              let requestID
        else { return }
        complete(id: requestID, result: .failure(ImagePlaygroundServiceError.cancelled))
    }

    private func complete(id: UUID, result: Result<Data, Error>) {
        guard let continuation,
              let completed = lifecycle.finish(id: id, result: result)
        else { return }
        let presenter = presentingController
        let playground = playgroundController
        self.continuation = nil
        requestID = nil
        presentingController = nil
        playgroundController = nil
        if let playground { presenter?.dismiss(playground) }
        continuation.resume(with: completed)
    }
}

struct ImageArtifactGenerator: ImageArtifactGenerating, Sendable {
    let presenter: any ImagePlaygroundPresenting
    let repository: ArtifactRepository
    private let factory = ArtifactManifestFactory()

    func generate(_ request: ArtifactGenerationRequest) async throws -> ArtifactManifest {
        guard await presenter.isAvailable else { throw ImagePlaygroundServiceError.unavailable }
        let concept = ImagePlaygroundConcept.compose(request)
        let pngData = try await presenter.createImage(concept: concept)
        try Task.checkCancellation()
        guard !pngData.isEmpty,
              let bitmap = NSBitmapImageRep(data: pngData),
              let normalizedPNG = bitmap.representation(using: .png, properties: [:]),
              !normalizedPNG.isEmpty
        else { throw ImagePlaygroundServiceError.invalidImage }
        let manifest = try factory.imageManifest(request: request, data: normalizedPNG)
        do {
            try Task.checkCancellation()
            let saved = try await repository.saveArtifact(manifest)
            try Task.checkCancellation()
            return saved
        } catch is CancellationError {
            try await repository.deleteArtifactIfPresent(
                id: manifest.id,
                boardID: manifest.provenance.sourceBoardId
            )
            throw CancellationError()
        }
    }
}

enum ImagePlaygroundConcept {
    static let maximumUTF16Units = 2_000
    private static let maximumInstructionUnits = 700
    private static let maximumContextUnits = 1_000

    static func compose(_ request: ArtifactGenerationRequest) -> String {
        var sections = [
            "[RECIPE INTENT]\nCreate one original image that visually communicates the selected Idea Tiles board material.",
        ]
        if let instructions = request.instructions?.trimmingCharacters(in: .whitespacesAndNewlines),
           !instructions.isEmpty {
            sections.append("[USER INSTRUCTIONS]\n\(boundedPrefix(instructions, maximumUnits: maximumInstructionUnits))")
        }
        sections.append("[BOARD CONTEXT]\n\(boundedPrefix(NativeContextReducer.reduce(request.context), maximumUnits: maximumContextUnits))")
        let concept = sections.joined(separator: "\n\n")
        return boundedPrefix(concept, maximumUnits: maximumUTF16Units)
    }

    private static func boundedPrefix(_ value: String, maximumUnits: Int) -> String {
        var result = ""
        var count = 0
        for character in value {
            let units = String(character).utf16.count
            guard count + units <= maximumUnits else { break }
            result.append(character)
            count += units
        }
        return result
    }
}
