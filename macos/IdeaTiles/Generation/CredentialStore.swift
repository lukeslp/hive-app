import Foundation
import Security

protocol CredentialStoring: Sendable {
    func set(_ value: String, for provider: GenerationProvider) async throws
    func credential(for provider: GenerationProvider) async throws -> String?
    func containsCredential(for provider: GenerationProvider) async throws -> Bool
    func removeCredential(for provider: GenerationProvider) async throws
}

protocol KeychainAccessing: Sendable {
    func set(_ data: Data, service: String, account: String) -> OSStatus
    func read(service: String, account: String, returnData: Bool) -> (OSStatus, Data?)
    func remove(service: String, account: String) -> OSStatus
}

struct SystemKeychainAccess: KeychainAccessing, Sendable {
    func set(_ data: Data, service: String, account: String) -> OSStatus {
        let query = baseQuery(service: service, account: account)
        let attributes: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        guard status == errSecItemNotFound else { return status }
        var insertion = query
        attributes.forEach { insertion[$0.key] = $0.value }
        return SecItemAdd(insertion as CFDictionary, nil)
    }

    func read(service: String, account: String, returnData: Bool) -> (OSStatus, Data?) {
        var query = baseQuery(service: service, account: account)
        query[kSecReturnData] = returnData
        query[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status: OSStatus
        if returnData {
            status = SecItemCopyMatching(query as CFDictionary, &result)
        } else {
            status = SecItemCopyMatching(query as CFDictionary, nil)
        }
        return (status, result as? Data)
    }

    func remove(service: String, account: String) -> OSStatus {
        SecItemDelete(baseQuery(service: service, account: account) as CFDictionary)
    }

    private func baseQuery(service: String, account: String) -> [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
    }
}

enum CredentialStoreError: Error, LocalizedError, Sendable {
    case invalidValue
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .invalidValue: "The credential is empty or invalid."
        case .keychain(let status):
            SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error \(status)."
        }
    }
}

actor KeychainCredentialStore: CredentialStoring {
    private let service: String
    private let access: any KeychainAccessing

    init(
        service: String = "app.ideatiles.macos.provider-credentials",
        access: any KeychainAccessing = SystemKeychainAccess()
    ) {
        self.service = service
        self.access = access
    }

    func set(_ value: String, for provider: GenerationProvider) throws {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard provider.requiresCredential, !trimmed.isEmpty, trimmed.utf8.count <= 16_384 else {
            throw CredentialStoreError.invalidValue
        }
        let status = access.set(Data(trimmed.utf8), service: service, account: provider.rawValue)
        guard status == errSecSuccess else { throw CredentialStoreError.keychain(status) }
    }

    func credential(for provider: GenerationProvider) throws -> String? {
        guard provider.requiresCredential else { return nil }
        let (status, data) = access.read(service: service, account: provider.rawValue, returnData: true)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data,
              let value = String(data: data, encoding: .utf8)
        else { throw CredentialStoreError.keychain(status) }
        return value
    }

    func containsCredential(for provider: GenerationProvider) throws -> Bool {
        guard provider.requiresCredential else { return false }
        let (status, _) = access.read(service: service, account: provider.rawValue, returnData: false)
        if status == errSecItemNotFound { return false }
        guard status == errSecSuccess else { throw CredentialStoreError.keychain(status) }
        return true
    }

    func removeCredential(for provider: GenerationProvider) throws {
        let status = access.remove(service: service, account: provider.rawValue)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CredentialStoreError.keychain(status)
        }
    }

}

struct CredentialStatusService: Sendable {
    let store: any CredentialStoring

    func statuses() async throws -> [GenerationProvider: Bool] {
        var result: [GenerationProvider: Bool] = [:]
        for provider in GenerationProvider.allCases where provider.requiresCredential {
            result[provider] = try await store.containsCredential(for: provider)
        }
        return result
    }
}
