import SwiftUI

@MainActor
@main
struct IdeaTilesApp: App {
    private let runtime: MacRuntime?
    private let startupError: String?

    init() {
        do {
            runtime = try MacRuntime()
            startupError = nil
        } catch {
            runtime = nil
            startupError = error.localizedDescription
        }
    }

    var body: some Scene {
        WindowGroup("Idea Tiles") {
            if let runtime {
                AppWebView(runtime: runtime)
                    .frame(minWidth: 900, minHeight: 640)
            } else {
                ContentUnavailableView(
                    "Idea Tiles could not start",
                    systemImage: "exclamationmark.triangle",
                    description: Text(startupError ?? "Unknown startup error")
                )
                .frame(minWidth: 900, minHeight: 640)
            }
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("Import Idea Tiles Package…") {
                    Task { await runtime?.importPackage() }
                }
                .keyboardShortcut("o", modifiers: [.command, .shift])
                .disabled(runtime == nil)
            }
        }
    }
}
