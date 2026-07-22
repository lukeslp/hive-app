# App Store Pack — Idea Tiles 1.3

Release-ready metadata and screenshot inventory for the iOS/iPadOS and native macOS listings. The files in `ios/fastlane` and `macos/fastlane` are canonical; this document is the human review sheet.

## Release identity

| Platform        | Version | Bundle ID         | Listing focus                                 |
| --------------- | ------- | ----------------- | --------------------------------------------- |
| iPhone and iPad | 1.3     | `app.hexmind.ios` | Private, on-device visual brainstorming       |
| Native Mac      | 1.3     | `app.hexmind.ios` | Turning mapped thinking into useful artifacts |

Both apps are free, have no in-app purchase, and use Productivity as the primary category. The iOS app requires Apple Intelligence for model-assisted generation. The native Mac app can use Apple Foundation Models, configured cloud providers, or local Ollama models; its selected provider and privacy disclosure must remain visible before generation.

## Canonical URLs

| Field     | Value                           |
| --------- | ------------------------------- |
| Marketing | `https://ideatiles.app`         |
| Support   | `https://ideatiles.app`         |
| Privacy   | `https://ideatiles.app/privacy` |

## iPhone and iPad copy

- Name: `Idea Tiles`
- Subtitle: `Private on-device idea maps`
- Keywords: `mindmap,hexagon,offline,private,ondevice,ideation,notes,canvas,diagram,focus,outline,whiteboard,plan`
- Promotional text: `Shape one thought into a visual map. Expand on-device, merge ideas, focus key themes, and export your board privately—without creating an account.`

The complete description and version notes are in:

- `ios/fastlane/metadata/en-US/description.txt`
- `ios/fastlane/metadata/en-US/release_notes.txt`

The description accurately limits assisted generation to supported iPhone and iPad hardware with Apple Intelligence enabled. It promises no cloud fallback for iOS generation and identifies PNG, JPG, SVG, and JSON as the supported export formats.

### iOS 1.3 version notes

- Adds JPG export alongside PNG, SVG, and JSON.
- Adds template customization using Apple on-device models.
- Improves readiness and availability messages.
- Refreshes the app icon and visual details.

## Native Mac copy

- Name: `Idea Tiles`
- Subtitle: `Turn idea maps into reports`
- Keywords: `mindmap,ideation,canvas,report,outline,diagram,prototype,brief,planning,writing,private,local`
- Promotional text: `Explore ideas on a spatial canvas, then turn a board, branch, or selection into a report, brief, plan, diagram, prototype, or exportable file.`

The complete description and version notes are in:

- `macos/fastlane/metadata/en-US/description.txt`
- `macos/fastlane/metadata/en-US/release_notes.txt`

The Mac description centers Artifact Studio: select the whole board, a branch, or chosen tiles; choose a recipe; review context and provider disclosure; generate; then preview, save, attach, or export. It does not imply that cloud generation is private or on-device.

### macOS 1.3 version notes

- Introduces the native Mac app and Artifact Studio.
- Generates briefs, reports, plans, diagrams, images, code scaffolds, and static prototypes.
- Supports board, branch, and selection scopes.
- Adds provider disclosure, progress, cancellation, preview, local save, attachment, and export.
- Ships as a universal Apple Silicon and Intel app.

## Screenshot storyboard

Captions are benefit-led, short, and baked into the images. Every screen is captured from the real development UI using deterministic showcase data; the showcase query is disabled in production builds.

### iPhone 6.9-inch — 1320 × 2868

1. Map your thinking — populated board
2. Turn detail into direction — tile inspection
3. Focus on what matters — key-theme view
4. Start with a useful structure — template picker
5. Make it work your way — settings

### iPad 13-inch — 2064 × 2752

The iPad set uses the same five-screen story at the native iPad aspect ratio and a layout adapted to the wider canvas.

### Native Mac — 1440 × 900

1. See the whole idea — populated desktop canvas
2. Turn detail into direction — tile inspection
3. Focus the signal — key-theme view
4. Build a finished artifact — Artifact Studio recipe picker
5. Choose your working style — settings

Canonical files:

- `ios/fastlane/screenshots/en-US/`
- `macos/fastlane/screenshots/en-US/`

Regenerate from a running Vite development server on port 5010:

```bash
pnpm exec vite --host 127.0.0.1 --port 5010
pnpm store:screenshots
pnpm store:validate
```

## Review notes

### iPhone and iPad

Idea Tiles uses Apple's on-device Foundation Models framework for tile expansion on iOS 26 or later. Test assisted generation on Apple Intelligence-eligible hardware with Apple Intelligence enabled. On other hardware the app displays an explicit availability message. The iOS generation path has no cloud fallback. Boards export locally through the standard share sheet as PNG, JPG, SVG, or JSON.

### Native Mac

Idea Tiles for Mac includes Artifact Studio. Apple Foundation Models and Ollama can run locally; configured remote providers send the displayed board context and instructions to that provider. The app shows the selected provider and disclosure before generation. Credentials are stored in Keychain. Reviewers can exercise the canvas and local file workflows without a provider account; artifact generation requires an available local model or a configured provider.

## Submission checklist

- [ ] `pnpm versions:check`
- [ ] `pnpm store:validate`
- [ ] iOS simulator build succeeds
- [ ] native Mac tests succeed
- [ ] unsigned Mac App Store archive succeeds for both `arm64` and `x86_64`
- [ ] signing team and provisioning profiles are selected in Xcode
- [ ] App Privacy answers match the submitted binaries
- [ ] export-compliance answers match actual encryption use
- [ ] screenshots are assigned to the correct device classes
- [ ] copy is reviewed in App Store Connect preview before submission

Uploading or submitting remains a separate, explicit release action.
