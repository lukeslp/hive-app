# Release Specification: Idea Tiles

**Version**: 1.3.1, current Apple build 6

**Last updated**: 2026-08-08

**Platforms**: web, iOS 26+ (Capacitor), Android, native macOS 26+

**Related docs**: [`RELEASE_REVIEW.md`](./RELEASE_REVIEW.md), [`APP_STORE_PACK.md`](./APP_STORE_PACK.md)

---

## 0. Quick start checklist

### Before archive

- [ ] `pnpm check` and `pnpm test` green
- [ ] Cold launch: splash hides, canvas interactive
- [ ] Tile expand on **eligible** hardware; clear error on ineligible
- [ ] iOS and Android have no Share Link creation entry point
- [ ] A received `https://ideatiles.app/?s=…` link opens and loads on both mobile platforms
- [ ] Export PNG/JPG/SVG/JSON on device
- [ ] Privacy + Terms URLs return real HTML (`/privacy`, `/terms`)

### App Store Connect

- [ ] Metadata from [`APP_STORE_PACK.md`](./APP_STORE_PACK.md) pasted and character-limited verified
- [ ] Screenshots uploaded per required device classes
- [ ] Privacy questionnaire matches **actual** collection (iOS no longer uploads boards via `/api/share`; share-link creation is web-only)
- [ ] Review notes describe Apple Intelligence requirement + snapshot vs live collab scope

### After upload

- [x] Processing completes for native Mac build 6
- [ ] Internal TestFlight install smoke test on real hardware
- [ ] External testing text matches “What to Test”

---

## 1. Sharing MVP policy (product / engineering)

**Locked for this proof-of-concept release:**

| Capability | Web | iOS | Android | Native Mac |
|---|---:|---:|---:|---:|
| **Snapshot share — create** (`POST /api/share` → `?s=` link) | Yes | No | No | Yes |
| **Snapshot share — open** (`?s=` link received) | Yes | Yes | Yes | Yes |
| **Live collaboration** (WebSocket `/ws/collab`, `?collab=`) | Yes | No | No | Yes |

**Rationale:** Live collab requires a production-safe WebSocket URL strategy and full UX parity; partial implementation would confuse testers and reviewers. Share-link *creation* is web-only because links route recipients to the web app, where cloud generation is billed to the operator's API keys, and the share store is in-memory (links expire on every deploy) — exports are the reliable native sharing path.

**Phase 2 (non-MVP) prerequisites for iOS live collab:**

1. WebSocket URL must not rely on `window.location.host` alone in native (use API host + `wss` path aligned with deployment).
2. Reconnection, backgrounding, and host migration rules documented.
3. Invite links must open app via Universal Link or custom scheme with tested routing.
4. Optional: persist rooms or auth for abuse control.

---

## 2. Versioning and build

- **Marketing version**: semantic `MAJOR.MINOR.PATCH` in Xcode.
- **Build** (`CURRENT_PROJECT_VERSION`): increment every upload.
- **Archive destination**: **Any iOS Device (arm64)** — not Mac Catalyst (see `CLAUDE.md` / Capacitor framework slices).

---

## 3. Environment / build-time config

| Variable                      | Purpose                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_CAPACITOR_API_BASE_URL` | Hosted API root for native HTTP. Defaults to `${APP_PUBLIC_WEB_ORIGIN}/api` (currently `https://ideatiles.app/api`); set explicitly only when shipping a build that points off-canonical. |
| `VITE_PUBLIC_WEB_APP_URL`     | Public web origin surfaced by native builds (default `https://ideatiles.app` via `APP_PUBLIC_WEB_ORIGIN` if unset). Mostly legacy now that share-link creation is web-only.                |

Document chosen values in internal release notes (not committed secrets).

---

## 4. Submission workflow (Xcode → ASC)

1. **Product → Archive** from release configuration.
2. **Organizer → Validate App** — fix validation errors.
3. **Distribute → App Store Connect → Upload**.
4. Wait for processing (typically 5–30 minutes).
5. In ASC → **TestFlight**: select build, add groups, fill **What to Test** / **Beta App Description**.
6. For App Store: **App Store** tab → version → attach build → complete compliance → **Submit for Review**.

---

## 5. TestFlight copy (suggested)

**Beta description (short):**

> Idea Tiles is a hexagonal mind map. On supported devices, expansions use Apple Intelligence on-device. Merge tiles, then export and share boards as images (PNG/JPG/SVG) or JSON files. Snapshot share links and real-time “Collaborate” sessions are on the website in this build, not inside the iOS shell.

**What to test on iOS:**

> • Create a board, tap to expand  
> • Merge two tiles  
> • Export PNG, JPG, SVG, and JSON
>
> • Open a snapshot link created on the website
>
> • Confirm Artifact Studio and hosted Share Link creation are absent

---

## 6. Common rejection / confusion mitigations

| Risk                                      | Mitigation                                       |
| ----------------------------------------- | ------------------------------------------------ |
| Apple Intelligence unavailable            | Review notes + in-app error string; do not crash |
| Metadata claims “real-time collab” on iOS | Remove; ASC copy matches §1                      |
| Privacy label vs `/api/share`             | iOS app no longer uploads via `/api/share` (web-only); verify label reflects this |
| Broken legal URLs                         | Ensure Express routes precede SPA catchall       |

---

## 7. Post-launch (first 2 weeks)

- Monitor **Crashes** in Xcode Organizer.
- Respond to **TestFlight feedback** and ASC reviews within 48h.
- Track share-ID 404 rate — if high, prioritize persisted share storage.

---

## 8. Document map

| File                                       | Role                                       |
| ------------------------------------------ | ------------------------------------------ |
| [`RELEASE_REVIEW.md`](./RELEASE_REVIEW.md) | Prioritized risks and mitigations          |
| [`APP_STORE_PACK.md`](./APP_STORE_PACK.md) | ASC copy + asset checklist                 |
| [`NEXT_STEPS.md`](../NEXT_STEPS.md)        | Operational deploy / AASA / hardware steps |
| [`PROJECT_PLAN.md`](../PROJECT_PLAN.md)    | Strategy and workstreams                   |

---

## Document history

| Version | Date       | Notes                                     |
| ------- | ---------- | ----------------------------------------- |
| 1.0     | 2026-05-12 | Initial MVP release spec + sharing policy |
| 1.3.1   | 2026-08-08 | Cross-platform capability and build-6 Rind release contract |
