# PROJECT_PLAN

Last updated: 2026-08-10

## Objectives

1. Maintain **Idea Tiles** as a stable cross-platform brainstorming tool across web, iOS, Android, and native Mac.
2. Preserve user trust with privacy-first generation behavior and explicit platform differences.
3. Keep launch and maintenance work focused: proof-of-concept MVP defers live collaboration in the Capacitor mobile shells; web and native Mac retain snapshot sharing and collaboration (see [`docs/RELEASE_SPEC.md`](docs/RELEASE_SPEC.md)).

## Current State

- App Store version 1.3.1 is public for iPhone/iPad; native Mac remains on 1.3 in the App Store. iOS and native Mac 1.3.2 build 8 are attached to complete listings and have not been submitted for review. The signed/notarized 1.3.1 (5) universal build remains the public direct download.
- Core app is functional across web and Capacitor shells.
- Web and native Mac can create snapshot links and start collaboration. iOS and Android remain local-first: they export files and open received links but do not create hosted links or start collaboration ([`docs/SHARING_MVP_POLICY.md`](docs/SHARING_MVP_POLICY.md)).
- Display name **Idea Tiles** is wired through UI, legal pages, and native `appName` / `CFBundleDisplayName`; legacy storage keys remain intentionally unchanged.
- The native hosted API fallback resolves to canonical `${APP_PUBLIC_WEB_ORIGIN}/api`; iOS still rejects hosted generation.
- **Concurrent model expansion:** `useHistory` now uses atomic `{ entries, index }` state with functional `push` updaters; `HexmindApp` neighbor commits merge via `(prev) => …` plus `flushSync` where post-commit UI reads keys from the same turn—fixes tiles vanishing when two generations overlap (web + iOS).
- Cross-platform handoff UX: share modal now exposes a dedicated “Bring to iOS” action using canonical universal-link URLs for easier web→iOS board continuation.
- Settings UX compaction + accessibility controls: removed non-essential heading copy, added one-row quick controls, persisted accessibility fonts and manual high-contrast mode, and added explicit board deletion from settings.
- Mobile readability pass: improved in-hex label wrapping behavior (balanced wrap, non-forced uppercase, reduced hard word-splitting) to avoid fragmented words in constrained tile geometry.
- Hosted builds lock app-level provider selection to OpenAI and suppress provider-management UI in Settings.
- Settings visual cohesion pass: shifted modal styling away from dense "admin panel" controls toward cleaner card/glass presentation aligned with the main canvas tone.
- Android local generation now dispatches in order: ML Kit Prompt API through
  AICore Gemini Nano, checksum-verified LiteRT-LM Gemma, then the existing
  managed cloud fallback. The app-managed `.litertlm` artifact retains its
  verified download, private no-backup storage, and atomic activation lifecycle;
  AICore status and user-initiated model download are exposed through the
  Capacitor bridge and Settings.
- Production restoration: Node now binds a fixed loopback port, unknown API
  routes return JSON 404 responses, and client-supplied Ollama routing and
  credentials are ignored to close the public SSRF boundary.

## Active Workstreams

### 1) Release Readiness (highest priority)

- Use [`docs/RELEASE_SPEC.md`](docs/RELEASE_SPEC.md) + [`docs/APP_STORE_PACK.md`](docs/APP_STORE_PACK.md) for ASC submission and beta copy.
- Resolve the external privacy-metadata and hardware-validation items in [`docs/RELEASE_REVIEW.md`](docs/RELEASE_REVIEW.md) before the next App Store submission.
- Complete **edge** verification for AASA + legal URLs on public hostnames (`pnpm verify:canonical` after Caddy/DNS); **localhost** checks alone are insufficient ([`NEXT_STEPS.md`](NEXT_STEPS.md) production Node section).

### 2) iOS Lifecycle and Stability

- Finish the partially landed UIScene lifecycle migration (see status snapshot at the top of `MIGRATION_PLAN.md`): remove `UIMainStoryboardFile` once duplicate-ownership risk is mitigated, trim `AppDelegate`, implement `scene(_:willConnectTo:options:)` with deferred cold-start URL forwarding.
- Verify splash behavior, deep-link handling, and plugin registration remain stable after the UIScene cleanup.
- Keep iOS generation behavior aligned with privacy commitments (on-device only).

### 3) Generation UX Reliability

- Continue hardening JSON/schema-constrained generation paths.
- Avoid misleading placeholder outputs on failure paths.
- Keep visible user feedback aligned with actual model behavior (tile-level feedback over redundant toasts).

### 4) Documentation Hygiene

- Maintain clear separation:
  - `docs/RELEASE_SPEC.md` — submission, sharing MVP, post-launch
  - `docs/RELEASE_REVIEW.md` — risk register
  - `NEXT_STEPS.md` — immediate operational checklist
  - `PROJECT_PLAN.md` — strategy and priorities
  - `todo.md` — historical context

## `/team` Cleanup Policy

Use council runs intentionally:

- Use `/team --full` only for major product or launch-direction decisions.
- Use `/team:technical` for architectural risk checks and rollout safety.
- Use `/team:research` when you only need facts and references.
- Do not use `/team` for routine bugfixes, small refactors, or already-decided implementation details.

## Near-Term Execution Queue

1. Complete the build-8 real-hardware smoke and verify Mac App Privacy answers before deliberately submitting the staged iOS and Mac 1.3.2 versions using `docs/APP_STORE_PACK.md` + `docs/RELEASE_SPEC.md`.
2. Land UIScene migration with verification pass (`MIGRATION_PLAN.md`).
3. Optional: persist `/api/share` payloads beyond in-memory (if 404s after deploy hurt users).
4. Phase 2: native live collab only as a deliberate project (WS host, UX, ASC copy).
5. Add persistent storage for public shares before promising durable links.

## Risks

- Source and production can diverge until the current web bundle is deliberately deployed and smoke-tested.
- iOS lifecycle warnings can become future hard failures if migration slips.
- Overusing strategic council workflows can create noise and slow execution.

## Definition of “Ready for Broader Launch”

- AASA/deep links validated across owned domains.
- TestFlight external testing active with clear beta instructions.
- Core generate/merge/export/session flows pass hardware smoke tests.
- Docs reflect current platform behavior and launch checklist without stale instructions.
