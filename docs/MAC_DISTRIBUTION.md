# Mac Distribution

Idea Tiles ships one native Mac target through two distribution lanes: Mac App Store and Developer ID. Both use bundle identifier `app.hexmind.ios`, Apple marketing version `1.1`, build `2`, App Sandbox, and hardened runtime. Package and Android metadata use the semantically equivalent version `1.1.0`.

## Xcode Layout

Open the root workspace with:

```bash
pnpm workspace:open
```

`IdeaTiles.xcworkspace` contains the renamed iOS project and the generated Mac project. Use the `Idea Tiles` scheme for iOS and `IdeaTiles` for macOS. `ios/App/IdeaTiles.xcodeproj` is the iOS source project; the relative `ios/App/App.xcodeproj` symlink exists only because Capacitor expects that path. Keep both.

After editing `macos/project.yml`, regenerate and validate:

```bash
pnpm mac:generate
pnpm versions:check
pnpm workspace:list
```

The version check rejects drift across package, iOS, Android, generated Mac metadata, bundle identifiers, workspace references, schemes, and the Capacitor symlink.

### Provider model review

Provider defaults last reviewed: 2026-07-21. Before each Mac release,
compare these IDs with the providers' official model and deprecation pages; do
not rely on a live network test in the release suite.

- Gemini: `gemini-3.6-flash`
- Anthropic: `claude-haiku-4-5-20251001`
- OpenAI: `gpt-5.6-luna`
- xAI: `grok-4.5`
- Mistral: `mistral-small-latest`

Update the native defaults and hosted proxy together when a provider replaces
or retires a model.

## Mac App Store Archive

A signed archive requires a clean working tree and configured Apple distribution signing:

```bash
pnpm mac:archive:app-store
```

This creates an `.xcarchive` under `build/release/app-store/` and verifies its bundle identifier and versions. It does not upload or submit anything. For a local build-only archive check:

```bash
pnpm mac:archive:app-store:unsigned
```

### Mac App Privacy answers

The Mac listing must disclose the optional account and cloud-sync path even
though local-only use requires no account. In App Store Connect, mark these as
linked to the user, not used for tracking, and collected for App Functionality:

- Contact Info: Name and Email Address
- Identifiers: User ID
- User Content: Other User Content (cloud boards and selected artifacts)

Do not select advertising, marketing, analytics, or tracking purposes. Keep
these answers aligned with `macos/IdeaTiles/PrivacyInfo.xcprivacy` and
`client/public/privacy.html` before every Mac submission.

## Developer ID and Notarization

Run the preflight first:

```bash
pnpm mac:release:direct:preflight
```

It checks the clean tree, workspace scheme, versions, hardened runtime, sandbox entitlement, required tools, and the installed `Developer ID Application` identity for team `596T7J7FB6`. It performs no notarization or upload submission, although Xcode package resolution may use the network.

To exercise archive, automatic Developer ID export, signature validation, hardened-runtime validation, ZIP creation, and checksum generation without a notarization or upload submission:

```bash
pnpm mac:release:direct:archive-only
```

Archive-only output is not notarized and must not be distributed.

For a real release, first store notarization credentials in Keychain using `xcrun notarytool store-credentials`, then explicitly name that profile:

```bash
export IDEATILES_NOTARY_KEYCHAIN_PROFILE="IdeaTiles-Notary"
pnpm mac:release:direct
```

The full command refuses to start without that environment variable. It archives, exports with Developer ID, submits the ZIP, waits for acceptance, staples and validates the ticket, runs Gatekeeper assessment, recreates the ZIP, and writes a SHA-256 checksum. No credential values belong in this repository.

After automated verification, perform first-launch testing only in a disposable macOS user account or clean virtual machine. Copying the app to a temporary directory does not isolate Application Support, defaults, or Keychain data for its bundle identity.

Set `IDEATILES_ALLOW_PROVISIONING_UPDATES=1` only when Xcode must refresh signing assets. To select a non-default installed identity, set `IDEATILES_DEVELOPER_IDENTITY` to its full Keychain name.

## iOS Compatibility Check

Capacitor updates the renamed project through the tracked symlink. The simulator build syncs first, then suppresses recursive syncing inside Xcode:

```bash
pnpm ios:build:simulator
```
