import Foundation
import Testing
@testable import IdeaTiles

@Suite("Private app resource resolver")
struct BundleResourceResolverTests {
    @Test("serves normalized bundle paths with correct MIME types")
    func servesResource() throws {
        let root = try TestDirectory.make()
        try Data("body {}".utf8).write(to: root.appending(path: "styles.css"))
        let resolver = BundleResourceResolver(root: root)

        let resource = try resolver.resource(
            for: URLRequest(url: #require(URL(string: "ideatiles://app/styles.css")))
        )

        #expect(resource.mimeType == "text/css")
        #expect(resource.data == Data("body {}".utf8))
    }

    @Test("maps the app root to index.html")
    func mapsRootToIndex() throws {
        let root = try TestDirectory.make()
        try Data("home".utf8).write(to: root.appending(path: "index.html"))
        let resolver = BundleResourceResolver(root: root)

        let resource = try resolver.resource(
            for: URLRequest(url: #require(URL(string: "ideatiles://app/")))
        )

        #expect(resource.mimeType == "text/html")
        #expect(resource.data == Data("home".utf8))
    }

    @Test(arguments: [
        "ideatiles://other/index.html",
        "ideatiles://app/../secret",
        "ideatiles://app/%2e%2e/secret",
        "https://app/index.html",
    ])
    func rejectsEscapes(_ rawURL: String) throws {
        let root = try TestDirectory.make()
        let resolver = BundleResourceResolver(root: root)
        let request = try URLRequest(url: #require(URL(string: rawURL)))

        #expect(throws: ResourceServingError.self) {
            try resolver.resource(for: request)
        }
    }

    @Test("rejects non-GET requests")
    func rejectsWrites() throws {
        let root = try TestDirectory.make()
        let resolver = BundleResourceResolver(root: root)
        var request = try URLRequest(url: #require(URL(string: "ideatiles://app/index.html")))
        request.httpMethod = "POST"

        #expect(throws: ResourceServingError.self) {
            try resolver.resource(for: request)
        }
    }
}

enum TestDirectory {
    static func make() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appending(path: "IdeaTilesTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
