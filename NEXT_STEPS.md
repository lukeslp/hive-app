# Idea Tiles — next steps

Updated 2026-08-08. This is the active operational checklist; historical release
notes belong in Git history, not in this pickup document.

## Current release state

- Public Apple version: **1.3.1** for iPhone, iPad, and native Mac.
- Next aligned Apple build: **5** for both iOS and macOS.
- Android package: `app.ideatiles.android`; no signed public release is recorded.
- Canonical web origin: `https://ideatiles.app`.
- Canonical production service: `ideatiles`, port **5065**, running from
  `~/servers/ideatiles`. The `hexmind` service on 5057 is the separate HiveMind
  community canvas and must not receive this app's bundle.

## Repository release gate

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm check && pnpm test && pnpm build`
- [ ] `pnpm versions:check && pnpm release:tools:test`
- [ ] `pnpm store:validate && pnpm workspace:list`
- [ ] `pnpm ios:build:simulator`
- [ ] `pnpm android:test`
- [ ] `pnpm mac:test`
- [ ] `pnpm mac:archive:app-store:unsigned`

## External actions requiring an explicit release pass

- [ ] In App Store Connect, correct Mac App Privacy answers to include linked
  Name, Email Address, User ID, and Other User Content for App Functionality.
- [ ] Upload Apple build 5 and verify the export-compliance answer. Do not reuse
  uploaded build 4; it predates the bundled declaration.
- [ ] Run [`docs/DEVICE_RELEASE_GATES.md`](docs/DEVICE_RELEASE_GATES.md) on real
  iPhone/iPad hardware and cold-launch the App Store/TestFlight build.
- [ ] Deliberately deploy the current web bundle to the `ideatiles` service, then
  run `pnpm verify:canonical` and smoke the canvas, legal pages, AASA, sharing,
  and collaboration.
- [ ] Produce, sign, and publish Android only after the release owner approves
  the artifact and Play metadata.

## Platform contract to preserve

| Capability | Web | iOS | Android | Native Mac |
|---|---:|---:|---:|---:|
| Core canvas and file exports | Yes | Yes | Yes | Yes |
| Open received snapshot link | Yes | Yes | Yes | Yes |
| Create hosted snapshot link | Yes | No | No | Yes |
| Start live collaboration | Yes | No | No | Yes |
| Artifact Studio text recipes | Yes | No | Yes | Yes |
| Artifact Studio Image Playground recipe | No | No | No | Yes |
| Tile generation fallback | Hosted | On-device only | Local, then hosted | Local/direct provider |

Do not re-enable iOS hosted generation, native share-link creation, or native
collaboration by changing a JSX conditional alone. Update the centralized
capability policy, transport guard, tests, privacy copy, and store metadata as
one product decision.

## Next engineering decisions

1. Finish and hardware-test the UIScene lifecycle migration.
2. Decide whether hosted snapshot links merit durable storage and an explicit
   retention policy; today they are process-memory snapshots.
3. Measure an on-device iOS Artifact Studio prototype before promising parity.
4. Reconcile and retire legacy Hexmind/HiveMind domains only after confirming
   they are no longer needed for installed-app links.
