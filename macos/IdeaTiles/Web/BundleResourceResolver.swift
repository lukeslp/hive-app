import Foundation
@preconcurrency import WebKit

enum ResourceServingError: Error, Equatable {
    case invalidMethod
    case invalidOrigin
    case invalidPath
    case missingResource
}

struct ServedResource: Sendable, Equatable {
    let data: Data
    let mimeType: String
}

struct BundleResourceResolver: Sendable {
    private let root: URL

    init(root: URL) {
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
    }

    func resource(for request: URLRequest) throws -> ServedResource {
        guard request.httpMethod == nil || request.httpMethod == "GET" else {
            throw ResourceServingError.invalidMethod
        }
        guard let url = request.url,
              url.scheme == "ideatiles",
              url.host == "app",
              url.user == nil,
              url.password == nil,
              url.port == nil
        else {
            throw ResourceServingError.invalidOrigin
        }

        let encodedPath = url.path(percentEncoded: true)
        guard let decodedPath = encodedPath.removingPercentEncoding,
              !decodedPath.contains("\\"),
              !decodedPath.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
        else {
            throw ResourceServingError.invalidPath
        }

        let path = decodedPath == "/" || decodedPath.isEmpty
            ? "index.html"
            : String(decodedPath.drop(while: { $0 == "/" }))
        let segments = path.split(separator: "/", omittingEmptySubsequences: false)
        guard !segments.isEmpty,
              segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." })
        else {
            throw ResourceServingError.invalidPath
        }

        let candidate = root.appending(path: path).standardizedFileURL.resolvingSymlinksInPath()
        let rootPath = root.path.hasSuffix("/") ? root.path : root.path + "/"
        guard candidate.path.hasPrefix(rootPath) else {
            throw ResourceServingError.invalidPath
        }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory),
              !isDirectory.boolValue
        else {
            throw ResourceServingError.missingResource
        }

        return ServedResource(
            data: try Data(contentsOf: candidate, options: .mappedIfSafe),
            mimeType: Self.mimeType(for: candidate.pathExtension)
        )
    }

    static func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html", "htm": "text/html"
        case "css": "text/css"
        case "js", "mjs": "text/javascript"
        case "json", "map", "webmanifest": "application/json"
        case "svg": "image/svg+xml"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "gif": "image/gif"
        case "webp": "image/webp"
        case "ico": "image/x-icon"
        case "woff": "font/woff"
        case "woff2": "font/woff2"
        case "txt": "text/plain"
        default: "application/octet-stream"
        }
    }
}

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let resolver: BundleResourceResolver

    init(root: URL) {
        resolver = BundleResourceResolver(root: root)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        do {
            let resource = try resolver.resource(for: urlSchemeTask.request)
            guard let url = urlSchemeTask.request.url else {
                throw ResourceServingError.invalidOrigin
            }
            let response = URLResponse(
                url: url,
                mimeType: resource.mimeType,
                expectedContentLength: resource.data.count,
                textEncodingName: resource.mimeType.hasPrefix("text/") || resource.mimeType.contains("json")
                    ? "utf-8"
                    : nil
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(resource.data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}
}
