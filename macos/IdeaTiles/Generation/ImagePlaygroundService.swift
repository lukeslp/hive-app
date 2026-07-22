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
    func createImage(concept: String) async throws -> URL
}

@MainActor
final class AppKitImagePlaygroundPresenter: NSObject, ImagePlaygroundPresenting, ImagePlaygroundViewController.Delegate {
    private var continuation: CheckedContinuation<URL, Error>?
    private weak var presentingController: NSViewController?
    private var playgroundController: ImagePlaygroundViewController?

    var isAvailable: Bool { ImagePlaygroundViewController.isAvailable }

    func createImage(concept: String) async throws -> URL {
        guard isAvailable else { throw ImagePlaygroundServiceError.unavailable }
        guard continuation == nil else { throw GenerationServiceError.invalidConfiguration }
        guard let controller = NSApp.keyWindow?.contentViewController
                ?? NSApp.windows.first(where: { $0.isVisible })?.contentViewController
        else { throw ImagePlaygroundServiceError.presentationUnavailable }

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let playground = ImagePlaygroundViewController()
                playground.concepts = [.text(String(concept.prefix(2_000)))]
                playground.delegate = self
                self.continuation = continuation
                presentingController = controller
                playgroundController = playground
                controller.presentAsSheet(playground)
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.finish(.failure(ImagePlaygroundServiceError.cancelled)) }
        }
    }

    func imagePlaygroundViewController(
        _ imagePlaygroundViewController: ImagePlaygroundViewController,
        didCreateImageAt imageURL: URL
    ) {
        finish(.success(imageURL))
    }

    func imagePlaygroundViewControllerDidCancel(_ imagePlaygroundViewController: ImagePlaygroundViewController) {
        finish(.failure(ImagePlaygroundServiceError.cancelled))
    }

    private func finish(_ result: Result<URL, Error>) {
        guard let continuation else { return }
        if let playgroundController { presentingController?.dismiss(playgroundController) }
        self.continuation = nil
        presentingController = nil
        playgroundController = nil
        continuation.resume(with: result)
    }
}

struct ImageArtifactGenerator: ImageArtifactGenerating, Sendable {
    let presenter: any ImagePlaygroundPresenting
    let repository: ArtifactRepository
    private let factory = ArtifactManifestFactory()

    func generate(_ request: ArtifactGenerationRequest) async throws -> ArtifactManifest {
        guard await presenter.isAvailable else { throw ImagePlaygroundServiceError.unavailable }
        let concept = NativeContextReducer.reduce(request.context)
        let imageURL = try await presenter.createImage(concept: concept)
        try Task.checkCancellation()
        let sourceData = try Data(contentsOf: imageURL, options: [.mappedIfSafe])
        guard !sourceData.isEmpty,
              let bitmap = NSBitmapImageRep(data: sourceData),
              let pngData = bitmap.representation(using: .png, properties: [:]),
              !pngData.isEmpty
        else { throw ImagePlaygroundServiceError.invalidImage }
        try Task.checkCancellation()
        let manifest = try factory.imageManifest(request: request, data: pngData)
        return try await repository.saveArtifact(manifest)
    }
}
