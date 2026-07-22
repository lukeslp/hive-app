import Foundation

struct NativeRPCError: Error, Sendable {
    let code: String
    let message: String
    let retryable: Bool

    static let notConfigured = NativeRPCError(
        code: "notConfigured",
        message: "Artifact generation is not configured yet.",
        retryable: false
    )
}

private actor InFlightRequestRegistry {
    private var identifiers: Set<String> = []

    func begin(_ id: String) -> Bool { identifiers.insert(id).inserted }
    func end(_ id: String) { identifiers.remove(id) }
}

final class BridgeDispatcher: Sendable {
    typealias Operation = @Sendable (ValidatedRPCRequest) async throws -> JSONValue

    private let validator: RPCRequestValidator
    private let timeout: Duration
    private let operation: Operation
    private let registry = InFlightRequestRegistry()

    init(
        validator: RPCRequestValidator = RPCRequestValidator(),
        timeout: Duration = .seconds(30),
        operation: @escaping Operation
    ) {
        self.validator = validator
        self.timeout = timeout
        self.operation = operation
    }

    func dispatch(_ data: Data) async -> Data {
        let request: ValidatedRPCRequest
        do {
            request = try validator.parse(data)
        } catch let error as RPCValidationError {
            return responseData(id: bestEffortID(in: data), error: validationError(error))
        } catch {
            return responseData(id: "rpc:invalid", error: NativeRPCError(
                code: "invalidRequest", message: "The native request is invalid.", retryable: false
            ))
        }

        guard await registry.begin(request.id) else {
            return responseData(id: request.id, error: NativeRPCError(
                code: "duplicateRequest", message: "A request with this ID is already running.", retryable: false
            ))
        }

        do {
            let result = try await withThrowingTaskGroup(of: JSONValue.self) { group in
                group.addTask { try await self.operation(request) }
                group.addTask {
                    try await Task.sleep(for: self.timeout)
                    throw NativeRPCError(code: "timeout", message: "The native request timed out.", retryable: true)
                }
                defer { group.cancelAll() }
                return try await group.next() ?? .null
            }
            await registry.end(request.id)
            return responseData(id: request.id, method: request.method, result: result)
        } catch let error as NativeRPCError {
            await registry.end(request.id)
            return responseData(id: request.id, error: error)
        } catch is CancellationError {
            await registry.end(request.id)
            return responseData(id: request.id, error: NativeRPCError(
                code: "cancelled", message: "The native request was cancelled.", retryable: true
            ))
        } catch {
            await registry.end(request.id)
            return responseData(id: request.id, error: NativeRPCError(
                code: "nativeError", message: "The native request failed.", retryable: false
            ))
        }
    }

    private func validationError(_ error: RPCValidationError) -> NativeRPCError {
        let code = error == .messageTooLarge ? "messageTooLarge" : "invalidRequest"
        return NativeRPCError(code: code, message: "The native request is invalid.", retryable: false)
    }

    private func bestEffortID(in data: Data) -> String {
        guard data.count <= validator.maximumBytes,
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = object["id"] as? String,
              RPCRequestValidator.isStableID(id)
        else { return "rpc:invalid" }
        return id
    }

    private func responseData(id: String, method: RPCMethod, result: JSONValue) -> Data {
        encode(.object([
            "id": .string(id), "ok": .bool(true), "method": .string(method.rawValue), "result": result,
        ]))
    }

    private func responseData(id: String, error: NativeRPCError) -> Data {
        encode(.object([
            "id": .string(id),
            "ok": .bool(false),
            "error": .object([
                "code": .string(error.code),
                "message": .string(String(error.message.prefix(1_000))),
                "retryable": .bool(error.retryable),
            ]),
        ]))
    }

    private func encode(_ value: JSONValue) -> Data {
        (try? JSONEncoder().encode(value)) ?? Data(#"{"id":"rpc:invalid","ok":false,"error":{"code":"encodingError","message":"The native response could not be encoded.","retryable":false}}"#.utf8)
    }
}
