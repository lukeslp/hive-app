# Idea Tiles — next steps

Updated 2026-10-16. This is the active operational checklist; historical release
notes belong in Git history, not in this pickup document.

## Current release state

- Public App Store version: **1.3.3** for iPhone/iPad (Xcode Cloud build
  **115**) and native Mac (build **11**), live since 2026-09-02. iOS build 116
  was uploaded the same day as a documentation-only rebuild; 115 is the live
  binary.
- Direct Mac ZIPs: the signed/notarized 1.3.1 builds 5 and 7 are still served
  under `https://dr.eamer.dev/downloads/idea-tiles/`, but the downloads page now
  sends Mac users to the Mac App Store and no longer links them.
- Native Mac builds from 1.3.2 (8) onward include Rind spatial mode; the direct
  1.3.1 ZIPs do not.
- Android package: `app.ideatiles.android`; signed **1.3.3** (11003) has been the
  direct download since 2026-09-04. Its APK and AAB were staged under
  `artifacts/google-play/app.ideatiles.android/1.3.3-11003/`. Idea Tiles has no
  row in the shared `updates-v1.json` feed and no in-app update check.
- Canonical web origin: `https://ideatiles.app`.
- Canonical production service: `ideatiles`, loopback port **5065**, running
  from `~/apps/ideatiles` on the production host. The `hexmind` service on 5057 is the
  separate HiveMind community canvas and must not receive this app's bundle.
- Production lags this source. As checked on 2026-10-16, the deployed server
  bundle (2026-08-20) has no `/api/oauth/native-start` route, so the sign-in
  window in the shipped Mac app opens a 404; the hosted web client's main
  script dates from 2026-07-11; and the live `privacy.html` is the 10 May 2026
  text rather than the current file in `client/public/`.

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
- [x] Attach valid Xcode Cloud iOS build 115 to 1.3.3 with current release notes.
- [x] Archive, validate, upload, and attach native Mac 1.3.3 build 11.
- [x] Publish the signed/notarized universal Mac build 5 ZIP, checksum, catalog
      record, and downloads-page link.
- [ ] Run [`docs/DEVICE_RELEASE_GATES.md`](docs/DEVICE_RELEASE_GATES.md) on real
      iPhone/iPad hardware and cold-launch the App Store/TestFlight build.
- [ ] Deliberately deploy the current web bundle to the `ideatiles` service, then
      run `pnpm verify:canonical` and smoke the canvas, legal pages, AASA, sharing,
      and collaboration. Native Mac sign-in and cloud sync depend on this deploy.
- [x] Produce, sign, verify, and checksum Android 1.3.3 (11003).
- [x] Publish Android 1.3.3 (11003) as the direct download (2026-09-04).
- [ ] Device-test Android and prepare Play metadata before any Play release.
- [x] Archive and upload the Rind-enabled native Mac build as 1.3.2 (8).

## Current 1.3.3 source contract to preserve

Public channels as of 2026-10-16: both Apple storefronts are 1.3.3 (iOS Cloud
115, native Mac 11), Android direct is 1.3.3 (11003), the unlinked direct Mac
ZIPs are 1.3.1, and the hosted web app runs an older bundle than this source.
The matrix below describes current source; Rind is included in the Mac app but
not the public direct ZIP.

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
