import Foundation
import Testing
@testable import IdeaTiles

@Suite("Task 1 artifact contract parity")
struct ArtifactContractParityTests {
    @Test(arguments: ["id", "path"])
    func rejectsDuplicateFileIdentity(_ key: String) throws {
        var raw = try rawManifest()
        var files = try #require(raw["files"] as? [[String: Any]])
        var duplicate = files[0]
        duplicate["id"] = key == "id" ? files[0]["id"] : "file:duplicate"
        duplicate["path"] = key == "path" ? files[0]["path"] : "duplicate.md"
        files.append(duplicate)
        raw["files"] = files

        #expect(throws: ArtifactContractError.self) {
            try ArtifactManifest.decode(data: JSONSerialization.data(withJSONObject: raw))
        }
    }

    @Test(arguments: ["encoding", "content"])
    func rejectsNullFileOptionals(_ key: String) throws {
        var raw = try rawManifest()
        var files = try #require(raw["files"] as? [[String: Any]])
        files[0][key] = NSNull()
        raw["files"] = files
        #expect(throws: ArtifactContractError.self) {
            try ArtifactManifest.decode(data: JSONSerialization.data(withJSONObject: raw))
        }
    }

    @Test(arguments: ["remoteId", "error"])
    func rejectsNullSyncOptionals(_ key: String) throws {
        var raw = try rawManifest()
        var sync = try #require(raw["sync"] as? [String: Any])
        sync[key] = NSNull()
        raw["sync"] = sync
        #expect(throws: ArtifactContractError.self) {
            try ArtifactManifest.decode(data: JSONSerialization.data(withJSONObject: raw))
        }
    }

    @Test(arguments: ["", String(repeating: "m", count: 129)])
    func rejectsInvalidGeneratorModel(_ model: String) throws {
        var raw = try rawManifest()
        var provenance = try #require(raw["provenance"] as? [String: Any])
        var generator = try #require(provenance["generator"] as? [String: Any])
        generator["model"] = model
        provenance["generator"] = generator
        raw["provenance"] = provenance
        #expect(throws: ArtifactContractError.self) {
            try ArtifactManifest.decode(data: JSONSerialization.data(withJSONObject: raw))
        }
    }

    @Test(arguments: [9_007_199_254_740_992.0, 1.5, -1.0])
    func rejectsUnsafeFileSizes(_ size: Double) throws {
        var raw = try rawManifest()
        var files = try #require(raw["files"] as? [[String: Any]])
        files[0]["sizeBytes"] = size
        raw["files"] = files
        #expect(throws: ArtifactContractError.self) {
            try ArtifactManifest.decode(data: JSONSerialization.data(withJSONObject: raw))
        }
    }

    private func rawManifest() throws -> [String: Any] {
        let manifest = try ArtifactFixture.manifest(content: "parity")
        return try #require(try JSONSerialization.jsonObject(with: manifest.encoded()) as? [String: Any])
    }
}
