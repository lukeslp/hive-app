import Foundation
import Testing
@testable import IdeaTiles

@Suite("Mac host bootstrap")
struct MacHostBootstrapTests {
    @Test("injects capabilities and services at document start")
    func bootstrapScript() {
        let source = MacBridgeBootstrap.javaScript

        #expect(source.contains("Object.defineProperty(window, 'ideaTilesMac'"))
        #expect(source.contains("artifactStudioServices"))
        #expect(source.contains("artifact.generate"))
        #expect(source.contains("artifact.cancel"))
        #expect(source.contains("artifact.save"))
        #expect(source.contains("artifact.export"))
        #expect(source.contains("artifact.attachImage"))
        #expect(source.contains("bridgeVersion: 1"))
    }

    @Test("main navigation stays on the private app origin")
    func navigationPolicy() {
        let policy = AppNavigationPolicy()

        #expect(policy.allows(URL(string: "ideatiles://app/index.html")!))
        #expect(!policy.allows(URL(string: "ideatiles://other/index.html")!))
        #expect(!policy.allows(URL(string: "https://ideatiles.app")!))
        #expect(!policy.allows(URL(filePath: "/tmp/index.html")))
    }
}

@Suite("Native bridge routing")
struct NativeBridgeRouterTests {
    @Test("reports the Task 2 capability surface")
    func capabilities() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let router = NativeBridgeRouter(repository: repository, exporter: { _ in true })

        let result = try await router.execute(ValidatedRPCRequest(
            id: "rpc:capabilities", method: .getCapabilities, params: [:]
        ))
        let object = try #require(result.objectValue)
        let features = try #require(object["features"]?.objectValue)

        #expect(object["bridgeVersion"] == .number(1))
        #expect(features["artifactPersistence"] == .bool(true))
        #expect(features["staticPreview"] == .bool(true))
        #expect(features["keychain"] == .bool(false))
    }

    @Test("returns a typed not-configured generation error")
    func generationBoundary() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let router = NativeBridgeRouter(repository: repository, exporter: { _ in true })

        await #expect(throws: NativeRPCError.self) {
            try await router.execute(ValidatedRPCRequest(
                id: "rpc:generate", method: .generateArtifact, params: [:]
            ))
        }
    }

    @Test("saves and exports validated manifests through native services")
    func saveAndExport() async throws {
        let repository = try ArtifactRepository(root: TestDirectory.make(), inMemory: true)
        let exportProbe = ExportProbe()
        let router = NativeBridgeRouter(repository: repository) { manifest in
            await exportProbe.record(manifest.id)
            return true
        }
        let manifest = try ArtifactFixture.manifest(content: "native")
        let manifestValue = try JSONDecoder().decode(JSONValue.self, from: manifest.encoded())
        let params: [String: JSONValue] = ["manifest": manifestValue]

        _ = try await router.execute(ValidatedRPCRequest(id: "rpc:save", method: .saveArtifact, params: params))
        let export = try await router.execute(ValidatedRPCRequest(id: "rpc:export", method: .exportArtifact, params: params))

        #expect(try await repository.loadArtifact(id: manifest.id) == manifest)
        #expect(export.objectValue?["exported"] == .bool(true))
        #expect(await exportProbe.artifactID == manifest.id)
    }
}

private actor ExportProbe {
    private(set) var artifactID: String?
    func record(_ id: String) { artifactID = id }
}
