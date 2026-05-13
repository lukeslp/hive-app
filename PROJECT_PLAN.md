# PROJECT_PLAN

Last updated: 2026-05-13

## Objectives

1. Ship **Idea Tiles** as a stable cross-platform brainstorming tool (web + iOS first, Android next).
2. Preserve user trust with privacy-first AI behavior and transparent platform differences.
3. Keep launch and maintenance work focused: proof-of-concept MVP defers **native** live collaboration; snapshot sharing + web collab remain the split (see [`docs/RELEASE_SPEC.md`](docs/RELEASE_SPEC.md)).

## Current State

- **Public TestFlight** is live; ongoing work is App Store polish, accurate metadata, and operational hardening—not “getting to TF.”
- Core app is functional across web and Capacitor shells.
- Collaboration, session persistence, merge workflows, and export flows are implemented **on web**; iOS ships snapshot share + local sessions for this MVP ([`docs/SHARING_MVP_POLICY.md`](docs/SHARING_MVP_POLICY.md)).
- Display name **Idea Tiles** is wired through UI, legal pages, and native `appName` / `CFBundleDisplayName`; legacy storage keys remain intentionally unchanged.

## Active Workstreams

### 1) Release Readiness (highest priority)

- Use [`docs/RELEASE_SPEC.md`](docs/RELEASE_SPEC.md) + [`docs/APP_STORE_PACK.md`](docs/APP_STORE_PACK.md) for ASC submission and beta copy.
- Resolve **High** items in [`docs/RELEASE_REVIEW.md`](docs/RELEASE_REVIEW.md) before App Store (share URL origin fixed in code; optional `VITE_PUBLIC_WEB_APP_URL` overrides `APP_PUBLIC_WEB_ORIGIN` / default `https://ideatiles.app`).
- Complete **edge** verification for AASA + legal URLs on public hostnames (`pnpm verify:canonical` after Caddy/DNS); **localhost** checks alone are insufficient ([`NEXT_STEPS.md`](NEXT_STEPS.md) production Node section).

### 2) iOS Lifecycle and Stability

- Complete UIScene lifecycle migration (`MIGRATION_PLAN.md`).
- Verify splash behavior, deep-link handling, and plugin registration remain stable.
- Keep iOS AI behavior aligned with privacy commitments (on-device only).

### 3) AI UX Reliability

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

1. App Store submission using `docs/APP_STORE_PACK.md` + `docs/RELEASE_SPEC.md`.
2. Land UIScene migration with verification pass (`MIGRATION_PLAN.md`).
3. Optional: persist `/api/share` payloads beyond in-memory (if 404s after deploy hurt users).
4. Phase 2: native live collab only as a deliberate project (WS host, UX, ASC copy).

## Risks

- Delayed server deploy keeps Universal Links validation blocked.
- iOS lifecycle warnings can become future hard failures if migration slips.
- Overusing strategic council workflows can create noise and slow execution.

## Definition of “Ready for Broader Launch”

- AASA/deep links validated across owned domains.
- TestFlight external testing active with clear beta instructions.
- Core generate/merge/export/session flows pass hardware smoke tests.
- Docs reflect current platform behavior and launch checklist without stale instructions.
