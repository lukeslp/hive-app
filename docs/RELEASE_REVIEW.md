# Release review — Idea Tiles

**Review date:** 2026-08-08

**Source version:** 1.3.1, Apple build 5

**Public Apple version:** 1.3.1

## Verdict

Repository checks can make build 5 release-ready, but repository work alone
cannot make the next submission complete. App Store privacy answers, current
production deployment, signed upload state, and real-device behavior are
external evidence gates.

## Open release risks

| Priority | Risk | Required action |
|---|---|---|
| High | The public listing says Data Not Collected while native Mac supports optional account and cloud artifact/session data. | Correct Mac App Privacy answers before the next submission. |
| High | Uploaded build 4 predates the bundled export-compliance declaration. | Upload build 5 or later and verify the archive's `ITSAppUsesNonExemptEncryption = false`. |
| Medium | Source may be ahead of `ideatiles.app`. | Deploy deliberately, then run canonical endpoint and product smoke tests. |
| Medium | UIScene migration remains partial. | Finish the migration and verify cold-start Universal Links on hardware. |
| Medium | Snapshot links are stored in process memory. | Keep the limitation explicit or add durable TTL storage before promising persistence. |
| Medium | Android has no recorded signed public release. | Complete signing, device tests, metadata review, and publish as a separate release action. |

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
- Canonical server routes reject unknown API requests with JSON instead of
  falling through to the SPA.

## Release owner sign-off

Use [`../NEXT_STEPS.md`](../NEXT_STEPS.md),
[`DEVICE_RELEASE_GATES.md`](./DEVICE_RELEASE_GATES.md), and
[`APP_STORE_PACK.md`](./APP_STORE_PACK.md). Upload, submit, deploy, publish, and
App Store Connect mutations require explicit authorization.
