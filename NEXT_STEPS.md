# Idea Tiles — next steps

Updated 2026-08-10. This is the active operational checklist; historical release
notes belong in Git history, not in this pickup document.

## Current release state

- Public App Store version: **1.3.1** for iPhone/iPad and **1.3** for native Mac.
- Staged Apple update: **1.3.2 build 8** for both iOS and native Mac. Both builds
  are attached to complete App Store Connect listings and have not been submitted
  for review.
- Public direct Mac release: **1.3.1 (5)**, signed, notarized, and linked from
  `https://dr.eamer.dev/downloads/apps/idea-tiles/`.
- Native Mac build 8 includes Rind spatial mode. The public direct ZIP remains
  the signed/notarized 1.3.1 (5) artifact.
- Android package: `app.ideatiles.android`; signed version **1.3.0** is available
  as a direct download. Source reports **1.3.2** and needs a new signed artifact.
- Canonical web origin: `https://ideatiles.app`.
- Canonical production service: `ideatiles`, port **5065**, running from
  `~/servers/ideatiles`. The `hexmind` service on 5057 is the separate HiveMind
  community canvas and must not receive this app's bundle.

## Repository release gate

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm check && pnpm test && pnpm build`
- [x] `pnpm versions:check && pnpm release:tools:test`
- [x] `pnpm store:validate && pnpm workspace:list`
- [x] `pnpm ios:build:simulator`
- [x] `pnpm android:test`
- [x] `pnpm mac:test`
- [x] `pnpm mac:archive:app-store:unsigned`

## External actions requiring an explicit release pass

- [ ] In App Store Connect, correct Mac App Privacy answers to include linked
      Name, Email Address, User ID, and Other User Content for App Functionality.
- [x] Upload and attach iOS and native Mac 1.3.2 build 8. Review submission
      remains separate.
- [x] Publish the signed/notarized universal Mac build 5 ZIP, checksum, catalog
      record, and downloads-page link.
- [ ] Run [`docs/DEVICE_RELEASE_GATES.md`](docs/DEVICE_RELEASE_GATES.md) on real
      iPhone/iPad hardware and cold-launch the App Store/TestFlight build.
- [ ] Deliberately deploy the current web bundle to the `ideatiles` service, then
      run `pnpm verify:canonical` and smoke the canvas, legal pages, AASA, sharing,
      and collaboration.
- [ ] Produce, sign, and publish Android only after the release owner approves
      the artifact and Play metadata.
- [x] Archive and upload the Rind-enabled native Mac build as 1.3.2 (8).

## Current 1.3.2 source contract to preserve

Public channels are intentionally staggered: iPhone/iPad App Store is 1.3.1,
Mac App Store is 1.3, the staged Apple updates are 1.3.2 (8), the direct Mac ZIP
is 1.3.1 (5), and Android direct is 1.3.0. The matrix below describes current
source; Rind is included in staged Mac build 8 but not the public direct ZIP.

| Capability                              |    Web |            iOS |            Android |            Native Mac |
| --------------------------------------- | -----: | -------------: | -----------------: | --------------------: |
| Core canvas and file exports            |    Yes |            Yes |                Yes |                   Yes |
| Open received snapshot link             |    Yes |            Yes |                Yes |                   Yes |
| Create hosted snapshot link             |    Yes |             No |                 No |                   Yes |
| Start live collaboration                |    Yes |             No |                 No |                   Yes |
| Artifact Studio text recipes            |    Yes |             No |                Yes |                   Yes |
| Artifact Studio Image Playground recipe |     No |             No |                 No |                   Yes |
| Rind spatial workspace                  |     No |             No |                 No |                   Yes |
| Tile generation fallback                | Hosted | On-device only | Local, then hosted | Local/direct provider |

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
