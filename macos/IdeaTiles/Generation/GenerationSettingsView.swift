import AppKit
import SwiftUI

@MainActor
final class GenerationSettingsViewModel: ObservableObject {
    @Published var provider: GenerationProvider = .apple
    @Published var model = GenerationProvider.apple.defaultModel
    @Published var ollamaBaseURL = "http://127.0.0.1:11434"
    @Published var credentialEntry = ""
    @Published private(set) var credentialConfigured = false
    @Published private(set) var statusMessage: String?
    @Published var dreamerInvite = ""
    @Published private(set) var dreamerProfile: DreamerProfile?
    @Published private(set) var isRedeemingDreamer = false

    private let preferences: any GenerationPreferencesStoring
    private let credentials: any CredentialStoring
    private let dreamer: (any DreamerAccessProviding)?

    init(
        preferences: any GenerationPreferencesStoring,
        credentials: any CredentialStoring,
        dreamer: (any DreamerAccessProviding)? = nil
    ) {
        self.preferences = preferences
        self.credentials = credentials
        self.dreamer = dreamer
    }

    func load() async {
        let settings = await preferences.load()
        provider = settings.provider
        model = settings.model
        if let value = settings.ollamaBaseURL { ollamaBaseURL = value }
        credentialConfigured = (try? await credentials.containsCredential(for: provider)) ?? false
        if provider == .dreamer { await refreshDreamerProfile() }
    }

    func selectProvider(_ newProvider: GenerationProvider) async {
        provider = newProvider
        model = newProvider.defaultModel
        credentialEntry = ""
        credentialConfigured = (try? await credentials.containsCredential(for: newProvider)) ?? false
        if newProvider == .dreamer { await refreshDreamerProfile() }
        statusMessage = nil
    }

    func save() async throws {
        let settings = try GenerationSettings(
            provider: provider,
            model: model,
            ollamaBaseURL: provider == .ollama ? ollamaBaseURL : nil
        ).validated()
        if provider.requiresCredential, provider != .dreamer,
           !credentialEntry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            try await credentials.set(credentialEntry, for: provider)
            credentialEntry = ""
        }
        try await preferences.save(settings)
        credentialConfigured = (try? await credentials.containsCredential(for: provider)) ?? false
        statusMessage = "Generation settings saved."
    }

    func removeCredential() async throws {
        if provider == .dreamer {
            guard let dreamer else { throw DreamerAccessError.failure(.notConfigured) }
            try await dreamer.remove()
            dreamerProfile = nil
        } else {
            try await credentials.removeCredential(for: provider)
        }
        credentialEntry = ""
        credentialConfigured = false
        statusMessage = "Credential removed from Keychain."
    }

    func redeemDreamerInvite() async throws {
        guard let dreamer else { throw DreamerAccessError.failure(.notConfigured) }
        guard !isRedeemingDreamer else {
            throw DreamerAccessError.failure(.redemptionInProgress)
        }
        isRedeemingDreamer = true
        defer { isRedeemingDreamer = false }
        let invite = dreamerInvite
        let profile = try await dreamer.redeem(inviteCode: invite)
        dreamerInvite = ""
        dreamerProfile = profile
        credentialConfigured = true
        provider = .dreamer
        model = GenerationProvider.dreamer.defaultModel
        try await preferences.save(GenerationSettings(
            provider: .dreamer,
            model: GenerationProvider.dreamer.defaultModel,
            ollamaBaseURL: nil
        ))
        statusMessage = "Dreamer access is ready."
    }

    func refreshDreamerProfile() async {
        guard let dreamer else {
            dreamerProfile = nil
            credentialConfigured = false
            return
        }
        do {
            let status = try await dreamer.status(refreshProfile: true)
            credentialConfigured = status.configured
            dreamerProfile = status.profile
        } catch {
            dreamerProfile = nil
            statusMessage = error.localizedDescription
        }
    }
}

struct GenerationSettingsView: View {
    @StateObject private var model: GenerationSettingsViewModel
    @State private var errorMessage: String?

    init(
        preferences: any GenerationPreferencesStoring,
        credentials: any CredentialStoring,
        dreamer: any DreamerAccessProviding
    ) {
        _model = StateObject(wrappedValue: GenerationSettingsViewModel(
            preferences: preferences,
            credentials: credentials,
            dreamer: dreamer
        ))
    }

    var body: some View {
        Form {
            Section("Artifact generation") {
                Picker("Provider", selection: Binding(
                    get: { model.provider },
                    set: { provider in Task { await model.selectProvider(provider) } }
                )) {
                    ForEach(GenerationProvider.allCases, id: \.self) { provider in
                        Text(provider.displayName).tag(provider)
                    }
                }

                TextField("Model", text: $model.model)
                    .disabled(model.provider == .apple || model.provider == .dreamer)

                if model.provider == .apple {
                    let availability = FoundationModelsTextGenerator().availability
                    LabeledContent("Availability", value: availability == .available ? "Available" : "Unavailable")
                }

                if model.provider == .ollama {
                    TextField("Loopback URL", text: $model.ollamaBaseURL)
                    Text("Only localhost, 127.0.0.0/8, and ::1 are accepted. Redirects are revalidated.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if model.provider == .dreamer {
                    Text("Dreamer chooses a curated provider and model for your access profile. It never falls back to another target.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if model.provider == .dreamer {
                Section("Dreamer access") {
                    if let profile = model.dreamerProfile {
                        LabeledContent("Profile", value: profile.label)
                        LabeledContent("Model", value: "\(profile.defaultTarget.provider) · \(profile.defaultTarget.model)")
                        LabeledContent("Today", value: "\(profile.quota.dailyRemaining) of \(profile.quota.dailyLimit) remaining")
                        Text("Resets \(profile.quota.resetAt)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        SecureField("Invite code", text: $model.dreamerInvite)
                            .disabled(model.isRedeemingDreamer)
                        HStack {
                            Button(model.isRedeemingDreamer ? "Redeeming…" : "Enter Invite Code") {
                                Task { await perform { try await model.redeemDreamerInvite() } }
                            }
                            .disabled(
                                model.isRedeemingDreamer
                                    || model.dreamerInvite.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            )
                            Button("Request Dreamer Access") {
                                NSWorkspace.shared.open(DreamerEndpoints.requestAccess)
                            }
                        }
                    }
                    if model.credentialConfigured {
                        Button("Remove Dreamer Access", role: .destructive) {
                            Task { await perform { try await model.removeCredential() } }
                        }
                    }
                }
            } else if model.provider.requiresCredential {
                Section("Credential") {
                    SecureField(model.credentialConfigured ? "Replace Keychain credential" : "API key", text: $model.credentialEntry)
                    LabeledContent("Keychain", value: model.credentialConfigured ? "Stored" : "Not stored")
                    if model.credentialConfigured {
                        Button("Remove Credential", role: .destructive) {
                            Task { await perform { try await model.removeCredential() } }
                        }
                    }
                }
            }

            if let message = errorMessage ?? model.statusMessage {
                Text(message)
                    .foregroundStyle(errorMessage == nil ? Color.secondary : Color.red)
            }

            HStack {
                Spacer()
                Button("Save") {
                    Task { await perform { try await model.save() } }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(model.provider == .dreamer && !model.credentialConfigured)
            }
        }
        .formStyle(.grouped)
        .frame(width: 520, height: 440)
        .task { await model.load() }
    }

    private func perform(_ operation: () async throws -> Void) async {
        do {
            try await operation()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
