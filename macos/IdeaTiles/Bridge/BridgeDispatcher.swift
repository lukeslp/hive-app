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

private enum DispatchOutcome: Sendable {
    case success(JSONValue)
    case nativeError(NativeRPCError)
    case cancelled
    case failure
    case timeout
}

private final class OneShotDispatchReply: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<DispatchOutcome, Never>?
    private var operationTask: Task<Void, Never>?
    private var timeoutTask: Task<Void, Never>?
    private var outcome: DispatchOutcome?

    func wait() async -> DispatchOutcome {
        await withCheckedContinuation { continuation in
            lock.withLock {
                if let outcome { continuation.resume(returning: outcome) }
                else { self.continuation = continuation }
            }
        }
    }

    func install(operationTask: Task<Void, Never>, timeoutTask: Task<Void, Never>) {
        lock.withLock {
            if outcome == nil {
                self.operationTask = operationTask
                self.timeoutTask = timeoutTask
            } else {
                operationTask.cancel()
                timeoutTask.cancel()
            }
        }
    }

    func resolve(_ outcome: DispatchOutcome, fromTimeout: Bool = false) {
        let continuation: CheckedContinuation<DispatchOutcome, Never>? = lock.withLock {
            guard self.outcome == nil else { return nil }
            self.outcome = outcome
            let continuation = self.continuation
            self.continuation = nil
            if fromTimeout { operationTask?.cancel() } else { timeoutTask?.cancel() }
            operationTask = nil
            timeoutTask = nil
            return continuation
        }
        continuation?.resume(returning: outcome)
    }
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

        let outcome = request.method == .exportArtifact
            ? await runWithoutComputationTimeout(request)
            : await runWithComputationTimeout(request)
        await registry.end(request.id)
        switch outcome {
        case .success(let result):
            return responseData(id: request.id, method: request.method, result: result)
        case .nativeError(let error):
            return responseData(id: request.id, error: error)
        case .cancelled:
            return responseData(id: request.id, error: NativeRPCError(
                code: "cancelled", message: "The native request was cancelled.", retryable: true
            ))
        case .timeout:
            return responseData(id: request.id, error: NativeRPCError(
                code: "timeout", message: "The native request timed out.", retryable: true
            ))
        case .failure:
            return responseData(id: request.id, error: NativeRPCError(
                code: "nativeError", message: "The native request failed.", retryable: false
            ))
        }
    }

    private func runWithoutComputationTimeout(_ request: ValidatedRPCRequest) async -> DispatchOutcome {
        do { return .success(try await operation(request)) }
        catch let error as NativeRPCError { return .nativeError(error) }
        catch is CancellationError { return .cancelled }
        catch { return .failure }
    }

    private func runWithComputationTimeout(_ request: ValidatedRPCRequest) async -> DispatchOutcome {
        let reply = OneShotDispatchReply()
        let operationTask = Task {
            do { reply.resolve(.success(try await self.operation(request))) }
            catch let error as NativeRPCError { reply.resolve(.nativeError(error)) }
            catch is CancellationError { reply.resolve(.cancelled) }
            catch { reply.resolve(.failure) }
        }
        let timeoutTask = Task {
            do {
                try await Task.sleep(for: self.timeout)
                reply.resolve(.timeout, fromTimeout: true)
            } catch {}
        }
        reply.install(operationTask: operationTask, timeoutTask: timeoutTask)
        return await reply.wait()
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
