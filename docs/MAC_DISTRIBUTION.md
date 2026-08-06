# Mac Distribution

Idea Tiles ships one universal native Mac target through two distribution lanes: Mac App Store and Developer ID. Release builds use Xcode's standard `arm64` and `x86_64` architectures. Both lanes use bundle identifier `app.hexmind.ios`, Apple marketing version `1.3.1`, build `4`, App Sandbox, and hardened runtime. Package and Android metadata use the same `1.3.1` version.

## Xcode Layout

Open the root workspace with:

```bash
pnpm workspace:open
```

`IdeaTiles.xcworkspace` contains the renamed iOS project and the generated Mac project. `ios/App/IdeaTiles.xcodeproj` is the iOS source project; the relative `ios/App/App.xcodeproj` symlink exists only because Capacitor expects that path. Keep both.

The root workspace is the normal Xcode entry point; do not open the repository folder as a project. It exposes exactly three shared schemes:

| Scheme | Builds | Use it for |
|---|---|---|
| `Idea Tiles (iOS)` | Capacitor `App` target → `hexmind.app` | iOS development, simulator/device runs, App Store archives |
| `Idea Tiles (macOS)` | Native `IdeaTiles` target + unit tests → `IdeaTiles.app` | Mac development, `pnpm mac:test`, both Mac release lanes |
| `Idea Tiles (All)` | Both apps in one invocation | Checking that a shared-web-client change still compiles on both platforms |

Both apps carry bundle identifier `app.hexmind.ios`, so they are one App Store product and one universal purchase. The two platform schemes are the only ones that archive.

`Idea Tiles (All)` deliberately has archiving disabled. A scheme spanning two platforms builds each target against its own SDK regardless of the `-destination` you pass, which is exactly what you want for a compile check and exactly what you do not want for a release — a submission archive must contain a single platform. Build it with:

```bash
pnpm apple:build
```

Adding a fourth scheme, or a second scheme pointing at a target that already has one, is what produced the earlier `Idea Tiles` / `IdeaTiles` / `Idea Tiles 1` / `Hexmind` / `App` pile-up. `pnpm versions:check` now fails if the scheme count or names drift.

After editing `macos/project.yml`, regenerate and validate:

```bash
pnpm mac:generate
pnpm versions:check
pnpm workspace:list
```

The version check rejects drift across package, iOS, Android, generated Mac metadata, bundle identifiers, workspace references, schemes, export compliance, and the Capacitor symlink.

### Export compliance

Both platforms declare `ITSAppUsesNonExemptEncryption = false` in their `Info.plist`. Idea Tiles uses only HTTPS and Keychain, which is exempt encryption, so App Store Connect stops asking the question at submission time. `pnpm versions:check` fails if either platform drops the key or changes the value — it was previously set on iOS only, which made every Mac submission stop for a manual answer.

The key reached macOS after build 4 was already uploaded, so the **1.3.1 Mac submission still asks once**; answer that the app uses exempt encryption. Build 5 onward carries the declaration.

### Submitting for review

`pnpm mac:archive:app-store` and the `asc_ship.py` staging subcommands (`state`, `metadata`, `screenshots`, `attach`) leave the version in `PREPARE_FOR_SUBMISSION`, where everything is still editable. Only `asc_ship.py submit` sends it to review.

`scripts/hooks/confirm-app-store-submit.sh` forces a confirmation prompt on any command that would submit for review — `asc_ship.py submit` or fastlane's `submit_for_review: true`. It asks rather than blocks: submission stays available, but never as a silent step inside a longer run. Run the script against a payload to check it still matches:

```bash
echo '{"tool_input":{"command":"asc_ship.py submit x"}}' | scripts/hooks/confirm-app-store-submit.sh
```

The repository ignores `.claude/`, so the wiring is per-checkout rather than shared. To enable it, put this in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/scripts/hooks/confirm-app-store-submit.sh",
            "if": "Bash(*submit*)",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

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
