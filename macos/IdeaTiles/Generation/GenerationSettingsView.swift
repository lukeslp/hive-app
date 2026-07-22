import SwiftUI

@MainActor
final class GenerationSettingsViewModel: ObservableObject {
    @Published var provider: GenerationProvider = .apple
    @Published var model = GenerationProvider.apple.defaultModel
    @Published var ollamaBaseURL = "http://127.0.0.1:11434"
    @Published var credentialEntry = ""
    @Published private(set) var credentialConfigured = false
    @Published private(set) var statusMessage: String?

    private let preferences: any GenerationPreferencesStoring
    private let credentials: any CredentialStoring

    init(preferences: any GenerationPreferencesStoring, credentials: any CredentialStoring) {
        self.preferences = preferences
        self.credentials = credentials
    }

    func load() async {
        let settings = await preferences.load()
        provider = settings.provider
        model = settings.model
        if let value = settings.ollamaBaseURL { ollamaBaseURL = value }
        credentialConfigured = (try? await credentials.containsCredential(for: provider)) ?? false
    }

    func selectProvider(_ newProvider: GenerationProvider) async {
        provider = newProvider
        model = newProvider.defaultModel
        credentialEntry = ""
        credentialConfigured = (try? await credentials.containsCredential(for: newProvider)) ?? false
        statusMessage = nil
    }

    func save() async throws {
        let settings = try GenerationSettings(
            provider: provider,
            model: model,
            ollamaBaseURL: provider == .ollama ? ollamaBaseURL : nil
        ).validated()
        if provider.requiresCredential, !credentialEntry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            try await credentials.set(credentialEntry, for: provider)
            credentialEntry = ""
        }
        try await preferences.save(settings)
        credentialConfigured = (try? await credentials.containsCredential(for: provider)) ?? false
        statusMessage = "Generation settings saved."
    }

    func removeCredential() async throws {
        try await credentials.removeCredential(for: provider)
        credentialEntry = ""
        credentialConfigured = false
        statusMessage = "Credential removed from Keychain."
    }
}

struct GenerationSettingsView: View {
    @StateObject private var model: GenerationSettingsViewModel
    @State private var errorMessage: String?

    init(preferences: any GenerationPreferencesStoring, credentials: any CredentialStoring) {
        _model = StateObject(wrappedValue: GenerationSettingsViewModel(
            preferences: preferences,
            credentials: credentials
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
                    .disabled(model.provider == .apple)

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
            }

            if model.provider.requiresCredential {
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
