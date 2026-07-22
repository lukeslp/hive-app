# Mac Distribution

Idea Tiles ships one native Mac target through two distribution lanes: Mac App Store and Developer ID. Both use bundle identifier `app.hexmind.ios`, marketing version `1.1.0`, build `2`, App Sandbox, and hardened runtime.

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

## Mac App Store Archive

A signed archive requires a clean working tree and configured Apple distribution signing:

```bash
pnpm mac:archive:app-store
```

This creates an `.xcarchive` under `build/release/app-store/` and verifies its bundle identifier and versions. It does not upload or submit anything. For a local build-only archive check:

```bash
pnpm mac:archive:app-store:unsigned
```

## Developer ID and Notarization

Run the network-free preflight first:

```bash
pnpm mac:release:direct:preflight
```

It checks the clean tree, workspace scheme, versions, hardened runtime, sandbox entitlement, required tools, and the installed `Developer ID Application` identity for team `596T7J7FB6`.

To exercise archive, automatic Developer ID export, signature validation, hardened-runtime validation, ZIP creation, and checksum generation without contacting Apple:

```bash
pnpm mac:release:direct:archive-only
```

Archive-only output is not notarized and must not be distributed.

For a real release, first store notarization credentials in Keychain using `xcrun notarytool store-credentials`, then explicitly name that profile:

```bash
export IDEATILES_NOTARY_KEYCHAIN_PROFILE="IdeaTiles-Notary"
pnpm mac:release:direct
```

The full command refuses to start without that environment variable. It archives, exports with Developer ID, submits the ZIP, waits for acceptance, staples and validates the ticket, runs Gatekeeper assessment, launches a staged copy as a smoke test, recreates the ZIP, and writes a SHA-256 checksum. No credential values belong in this repository.

Set `IDEATILES_ALLOW_PROVISIONING_UPDATES=1` only when Xcode must refresh signing assets. To select a non-default installed identity, set `IDEATILES_DEVELOPER_IDENTITY` to its full Keychain name.

## iOS Compatibility Check

Capacitor updates the renamed project through the tracked symlink. Sync once before an iOS build; the build command suppresses recursive syncing inside Xcode:

```bash
pnpm cap:sync:ios
pnpm ios:build:simulator
```
