import CryptoKit
import Foundation

private struct NativeRecipe: Sendable {
    let title: String
    let kind: String
    let path: String
    let mimeType: String
    let instructions: String

    static func resolve(_ id: String) -> NativeRecipe? {
        switch id {
        case "brief": .init(title: "Brief", kind: "markdown", path: "brief.md", mimeType: "text/markdown", instructions: "Write a compact Markdown brief.")
        case "report": .init(title: "Report", kind: "markdown", path: "report.md", mimeType: "text/markdown", instructions: "Write a structured Markdown report with findings and open questions.")
        case "action-plan": .init(title: "Action Plan", kind: "markdown", path: "action-plan.md", mimeType: "text/markdown", instructions: "Write an ordered Markdown action plan with outcomes and dependencies.")
        case "narrative": .init(title: "Narrative", kind: "markdown", path: "narrative.md", mimeType: "text/markdown", instructions: "Write a coherent Markdown narrative without unsupported details.")
        case "custom-markdown": .init(title: "Custom Markdown", kind: "markdown", path: "document.md", mimeType: "text/markdown", instructions: "Return well-structured Markdown following the supplied instructions.")
        case "deep-dive": .init(title: "Deep Dive", kind: "markdown", path: "deep-dive.md", mimeType: "text/markdown", instructions: "Explore the context in depth, including risks and unresolved questions.")
        case "implementation-plan": .init(title: "Implementation Plan", kind: "markdown", path: "implementation-plan.md", mimeType: "text/markdown", instructions: "Write a technical plan with interfaces, phases, risks, and verification. Do not claim anything was built or run.")
        case "code-scaffold": .init(title: "Code Scaffold", kind: "codeBundle", path: "scaffold.md", mimeType: "text/markdown", instructions: "Return a source-file scaffold only. Do not install, build, or execute it.")
        case "mermaid-diagram": .init(title: "Mermaid Diagram", kind: "mermaid", path: "diagram.mmd", mimeType: "text/plain", instructions: "Return valid Mermaid source only.")
        case "svg-asset": .init(title: "SVG Asset", kind: "svg", path: "asset.svg", mimeType: "image/svg+xml", instructions: "Return a standalone SVG with no scripts, links, or remote assets.")
        case "static-web-prototype": .init(title: "Static Web Prototype", kind: "staticWeb", path: "index.html", mimeType: "text/html", instructions: "Return one self-contained static HTML file with no forms, navigation, storage, scripts, or network use.")
        case "image-playground-artwork": .init(title: "Image Playground Artwork", kind: "image", path: "artwork.png", mimeType: "image/png", instructions: "Create a concise visual concept from the supplied context.")
        default: nil
        }
    }
}

struct ArtifactManifestFactory: Sendable {
    func textManifest(request: ArtifactGenerationRequest, text: GeneratedText) throws -> ArtifactManifest {
        guard let recipe = NativeRecipe.resolve(request.recipeID), recipe.kind != "image" else {
            throw GenerationServiceError.invalidConfiguration
        }
        let data = Data(stripOuterFence(text.content).utf8)
        guard !data.isEmpty else { throw GenerationServiceError.invalidResponse }
        return try manifest(
            request: request,
            recipe: recipe,
            data: data,
            encoding: "utf8",
            generator: ArtifactGeneratorDescriptor(
                kind: text.provider == .apple ? "onDevice" : "directProvider",
                name: text.provider.displayName,
                model: text.model
            )
        )
    }

    func imageManifest(request: ArtifactGenerationRequest, data: Data) throws -> ArtifactManifest {
        guard let recipe = NativeRecipe.resolve(request.recipeID), recipe.kind == "image", !data.isEmpty else {
            throw GenerationServiceError.invalidConfiguration
        }
        return try manifest(
            request: request,
            recipe: recipe,
            data: data,
            encoding: "base64",
            generator: ArtifactGeneratorDescriptor(kind: "imagePlayground", name: "Apple Image Playground", model: nil)
        )
    }

    func prompt(for request: ArtifactGenerationRequest) throws -> String {
        guard let recipe = NativeRecipe.resolve(request.recipeID), recipe.kind != "image" else {
            throw GenerationServiceError.invalidConfiguration
        }
        var prompt = "Artifact: \(recipe.title)\n\nRequirements:\n\(recipe.instructions)"
        if let instructions = request.instructions, !instructions.isEmpty {
            prompt += "\n\nAdditional instructions:\n\(instructions)"
        }
        prompt += "\n\nIdea Tiles context:\n\(request.context)"
        return NativeContextReducer.reduce(prompt)
    }

    private func manifest(
        request: ArtifactGenerationRequest,
        recipe: NativeRecipe,
        data: Data,
        encoding: String,
        generator: ArtifactGeneratorDescriptor
    ) throws -> ArtifactManifest {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let artifactID = "artifact:\(UUID().uuidString.lowercased())"
        let fileID = "file:\(UUID().uuidString.lowercased())"
        let content = encoding == "base64" ? data.base64EncodedString() : String(decoding: data, as: UTF8.self)
        let file = ArtifactFile(
            id: fileID,
            path: recipe.path,
            mimeType: recipe.mimeType,
            sizeBytes: data.count,
            checksum: ArtifactChecksum(algorithm: "sha256", value: SHA256.hash(data: data).hexString),
            createdAt: timestamp,
            updatedAt: timestamp,
            encoding: encoding,
            content: content
        )
        let manifest = ArtifactManifest(
            schemaVersion: 1,
            id: artifactID,
            title: recipe.title,
            kind: recipe.kind,
            recipeId: request.recipeID,
            scope: request.scope,
            files: [file],
            provenance: ArtifactProvenance(
                sourceBoardId: request.sourceBoardID,
                sourceNodeIds: request.sourceNodeIDs,
                recipeId: request.recipeID,
                generatedAt: timestamp,
                generator: generator
            ),
            sync: .object([
                "status": .string("localOnly"),
                "includeImages": .bool(false),
                "updatedAt": .string(timestamp),
            ]),
            createdAt: timestamp,
            updatedAt: timestamp
        )
        try manifest.validate()
        return manifest
    }

    private func stripOuterFence(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("```"), let firstNewline = trimmed.firstIndex(of: "\n"),
              trimmed.hasSuffix("```")
        else { return value }
        return String(trimmed[trimmed.index(after: firstNewline)..<trimmed.index(trimmed.endIndex, offsetBy: -3)])
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

protocol ImageArtifactGenerating: Sendable {
    func generate(_ request: ArtifactGenerationRequest) async throws -> ArtifactManifest
}

actor ArtifactGenerationCoordinator {
    private let engine: any ArtifactTextGenerating
    private let imageGenerator: (any ImageArtifactGenerating)?
    private let factory: ArtifactManifestFactory
    private var active: [String: Task<ArtifactManifest, Error>] = [:]

    init(
        engine: any ArtifactTextGenerating,
        imageGenerator: (any ImageArtifactGenerating)? = nil,
        factory: ArtifactManifestFactory = ArtifactManifestFactory()
    ) {
        self.engine = engine
        self.imageGenerator = imageGenerator
        self.factory = factory
    }

    func generate(_ request: ArtifactGenerationRequest) async throws -> ArtifactManifest {
        guard active[request.requestID] == nil else {
            throw NativeRPCError(code: "duplicateRequest", message: "This generation request is already running.", retryable: false)
        }
        let task: Task<ArtifactManifest, Error>
        if request.recipeID == "image-playground-artwork" {
            guard let imageGenerator else { throw ImagePlaygroundServiceError.unavailable }
            task = Task { try await imageGenerator.generate(request) }
        } else {
            task = Task {
                let prompt = try factory.prompt(for: request)
                let generated = try await engine.generate(prompt: prompt)
                try Task.checkCancellation()
                return try factory.textManifest(request: request, text: generated)
            }
        }
        active[request.requestID] = task
        defer { active.removeValue(forKey: request.requestID) }
        return try await withTaskCancellationHandler {
            try await task.value
        } onCancel: {
            task.cancel()
        }
    }

    @discardableResult
    func cancel(requestID: String) -> Bool {
        guard let task = active[requestID] else { return false }
        task.cancel()
        return true
    }
}

private extension SHA256.Digest {
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}
