# Release review — Idea Tiles

**Review date:** 2026-09-02

**Source version:** 1.3.3, Apple build 11

**Public App Store version:** iPhone/iPad and native Mac 1.3.2

## Verdict

iOS Cloud build 115 and native Mac build 11 are valid and attached to the 1.3.3
App Store versions with complete metadata. Nothing has been submitted for review. The
public direct Mac download remains signed/notarized 1.3.1 (5). App Store privacy
answers, current production deployment, and real-device behavior remain
external evidence gates before review submission.

## Open release risks

| Priority | Risk | Required action |
|---|---|---|
| High | The public listing says Data Not Collected while native Mac supports optional account and cloud artifact/session data. | Correct Mac App Privacy answers before the next submission. |
| Medium | Source may be ahead of `ideatiles.app`. | Deploy deliberately, then run canonical endpoint and product smoke tests. |
| Medium | UIScene migration remains partial. | Finish the migration and verify cold-start Universal Links on hardware. |
| Medium | Snapshot links are stored in process memory. | Keep the limitation explicit or add durable TTL storage before promising persistence. |
| Medium | The public direct Android build is 1.3.0 while signed 1.3.3 artifacts are staged; no store release is recorded. | Complete device tests and metadata review, then publish the staged Android release as a separate action. |

## Enforced product boundaries

- iOS tile generation is on-device only; hosted transport rejects iOS calls.
- Artifact Studio is unavailable on iOS, available for text-shaped recipes on
  web and Android, and fully available in native Mac including Image Playground.
- iOS and Android open received snapshot links and export PNG/JPG/SVG/JSON, but
  do not create hosted snapshot links or start live collaboration.
- Web and native Mac retain hosted snapshot creation and collaboration.
- Native Mac provider credentials remain in Keychain; its privacy manifest and
  public privacy policy describe optional linked cloud data.

## Strengths

- Platform capabilities are centralized and backed by transport-level privacy
  enforcement rather than relying only on hidden buttons.
- iOS, Android, and Mac have distinct generation ladders with visible failure
  behavior instead of synthetic placeholder content.
- Release scripts align Apple versions and validate privacy/export-compliance
  metadata in produced artifacts.
- iOS Cloud build 115 and native Mac build 11 passed App Store validation,
  processing, and attachment to their 1.3.3 versions. The direct 1.3.1 (5) universal build
  previously passed Developer ID signing, notarization, stapling, Gatekeeper,
  hosted-byte, and checksum verification.
- Canonical server routes reject unknown API requests with JSON instead of
  falling through to the SPA.

## Release owner sign-off

Use [`../NEXT_STEPS.md`](../NEXT_STEPS.md),
[`DEVICE_RELEASE_GATES.md`](./DEVICE_RELEASE_GATES.md), and
[`APP_STORE_PACK.md`](./APP_STORE_PACK.md). Upload, submit, deploy, publish, and
App Store Connect mutations require explicit authorization.
