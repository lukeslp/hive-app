# Release Review: Thought Tiles (iOS / Capacitor)

**Platform**: iOS (Capacitor WebView), web companion  
**Distribution**: TestFlight (public beta) → App Store  
**Review date**: 2026-05-12  
**Scope**: Proof-of-concept MVP; live collaboration on native is **deferred** (see `docs/RELEASE_SPEC.md` — Sharing MVP policy).

## Summary

| Priority | Count | Notes |
|----------|-------|--------|
| Critical | 0 | None identified that block TestFlight if snapshot sharing uses public URLs |
| High | 2 | Share link origin on Capacitor; in-memory share store |
| Medium | 4 | UIScene deprecation, Share modal copy accuracy, cloud session disabled on native, share TTL |
| Low | 3 | Analytics web-only, OG/session polish, Android package name legacy |

---

## Critical (must fix before App Store if applicable)

None for TestFlight-only, assuming testers are informed. Before **App Store** review, resolve High items and align privacy copy with actual data flows.

---

## High

### Distribution: Share URLs must not use `capacitor://` origin

**Files**: `client/src/hooks/useSessionManagement.ts` (generateShareUrl), `client/src/lib/platform.ts`  
**Impact**: Recipients cannot open `capacitor://localhost/...` in Safari; snapshot sharing appears broken from iOS.

**Mitigation**: Use a configurable public web origin (`VITE_PUBLIC_WEB_APP_URL`, default `https://hexmind.app`) when building `?s=` links in native builds. Implemented in this repo pass.

### Privacy / operations: `/api/share` is in-memory only

**File**: `server/llmProxy.ts`  
**Impact**: Share IDs vanish on process restart; testers may see “share not found” after deploy/restart.

**Mitigation**: Document in release spec and App Review notes; optional follow-up — persist shares in DB or S3 with TTL.

---

## Medium

### iOS: UIScene lifecycle not adopted

**Evidence**: `MIGRATION_PLAN.md`, Xcode warnings.  
**Impact**: Future iOS SDK may assert; not an immediate TestFlight crash.

### UX: Share modal claimed “no server storage”

**File**: `client/src/components/ShareModal.tsx`  
**Impact**: Mismatch with `POST /api/share` behavior; App Review / trust risk.

**Mitigation**: Copy updated to describe short-lived server snapshot.

### Capacitor: `auth.me` and `sessions.list` disabled

**Files**: `client/src/_core/hooks/useAuth.ts`, `client/src/hooks/useSessionManagement.ts`  
**Impact**: iOS is local-first for cloud session list; intentional for PoC — document in ASC / review notes if “account” UI exists but cloud empty.

### Collaboration WebSocket uses `window.location.host`

**File**: `client/src/hooks/useCollaboration.ts`  
**Impact**: Wrong host in native shell if collab were enabled; **out of scope for MVP** because collab UI is web-only (`HexmindApp.tsx`).

---

## Low

- **Analytics**: Injected only when not Capacitor (`main.tsx`) — align privacy label “Data Not Collected” if no SDK in app build.
- **Android**: Package still `dev.dreamer.hexpand` per rename policy — fine for PoC; document for Play later.
- **Universal Links**: AASA must match deployed bundle id — operational checklist in `NEXT_STEPS.md`.

---

## Strengths

- Clear iOS on-device-only AI path with documented privacy stance.
- `PrivacyInfo.xcprivacy` declares no tracking and minimal required-reason APIs.
- CapacitorHttp + splash handling are explicitly configured for production reliability.
- Static `/privacy` and `/terms` routes for ASC URLs.

---

## Recommended action order

1. Ship public-origin snapshot share links on iOS (platform helper + env).
2. Fix Share modal disclosure text.
3. Keep live collab off iOS until WS URL + UX are product-complete.
4. Before App Store: decide on share persistence (memory vs DB) and UIScene migration timeline.
