import Foundation
import Security

protocol CredentialStoring: Sendable {
    func set(_ value: String, for provider: GenerationProvider) async throws
    func credential(for provider: GenerationProvider) async throws -> String?
    func containsCredential(for provider: GenerationProvider) async throws -> Bool
    func removeCredential(for provider: GenerationProvider) async throws
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

    init(service: String = "app.ideatiles.macos.provider-credentials") {
        self.service = service
    }

    func set(_ value: String, for provider: GenerationProvider) throws {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard provider.requiresCredential, !trimmed.isEmpty, trimmed.utf8.count <= 16_384 else {
            throw CredentialStoreError.invalidValue
        }
        let data = Data(trimmed.utf8)
        let query = baseQuery(provider)
        let attributes: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            attributes.forEach { insert[$0.key] = $0.value }
            let insertStatus = SecItemAdd(insert as CFDictionary, nil)
            guard insertStatus == errSecSuccess else { throw CredentialStoreError.keychain(insertStatus) }
        } else if status != errSecSuccess {
            throw CredentialStoreError.keychain(status)
        }
    }

    func credential(for provider: GenerationProvider) throws -> String? {
        guard provider.requiresCredential else { return nil }
        var query = baseQuery(provider)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8)
        else { throw CredentialStoreError.keychain(status) }
        return value
    }

    func containsCredential(for provider: GenerationProvider) throws -> Bool {
        guard provider.requiresCredential else { return false }
        var query = baseQuery(provider)
        query[kSecReturnData] = false
        query[kSecMatchLimit] = kSecMatchLimitOne
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        if status == errSecItemNotFound { return false }
        guard status == errSecSuccess else { throw CredentialStoreError.keychain(status) }
        return true
    }

    func removeCredential(for provider: GenerationProvider) throws {
        let status = SecItemDelete(baseQuery(provider) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CredentialStoreError.keychain(status)
        }
    }

    private func baseQuery(_ provider: GenerationProvider) -> [CFString: Any] {
        [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: provider.rawValue,
        ]
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
