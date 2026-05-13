# App Store Pack — Thought Tiles MVP

Copy-paste oriented metadata and asset checklist aligned to **current** product behavior (iOS on-device AI, snapshot share links, **no** native live collaboration). App Store **Name** / **Subtitle** below match in-app branding; bundle id and URLs may still reference `hexmind.app`. Update before each ASC submission.

## Platforms (this pack)

- [x] iPhone (required)
- [x] iPad (if binary supports it — Designed for iPad / universal)
- [ ] Mac (Designed for iPad listing — same binary, ASC toggle)
- [ ] Apple Watch / TV / vision — N/A

---

## 1. Basic information

| Field | Value (draft) | Limit |
|-------|----------------|-------|
| **Name** | `Thought Tiles` (14) — or `Thought Tiles: Brainstorm` (25) if bare name conflicts | 30 chars |
| **Subtitle** | `Expand ideas with local AI` (28) | 30 chars |
| **Primary category** | Productivity | — |
| **Secondary** | (optional) Graphics & Design / Business | — |
| **Content rights** | No third-party content requiring rights | confirm |
| **Age rating** | Complete questionnaire — expect **4+** for this app | — |

---

## 2. URLs (must be live)

| Field | URL |
|-------|-----|
| **Privacy Policy** | `https://hexmind.app/privacy` |
| **Support** | `https://hexmind.app/` or support email in ASC |
| **Marketing** | (optional) primary brand domain |

---

## 3. Promotional text (170 chars, editable without review)

> Friendly hex tile maps on your device. Tap to expand six ideas per tile, merge by drag, export PNG — private on-device AI on supported iPhones; bring your own keys on web.

(Tweak to fit 170 characters exactly before paste.)

---

## 4. Full description (4000 max) — structure

1. **Opening** — who it’s for (solo brainstormers, students, PMs).
2. **Core verbs** — expand tile, merge tiles, star key themes, export.
3. **Privacy** — iOS tile generation on-device; no cloud fallback for that path; web uses your keys / server as configured.
4. **Sharing** — snapshot link opens in browser; live collaboration is **web** for this release (do not promise iOS real-time collab).
5. **Requirements** — Apple Intelligence–eligible hardware for on-device generation; otherwise clear errors.
6. **CTA** — rate, feedback email.

---

## 5. Keywords (100 chars, comma, no spaces after comma)

Draft (trim to ≤100):

`mindmap,hexmap,brainstorm,offline,ideas,productivity,diagram,map,notes,creative`

Do not repeat words from Name/Subtitle that ASC indexes automatically.

---

## 6. What’s New (example v1.0)

> Initial TestFlight / App Store release: hex canvas, on-device expansion on supported iPhones, merge & export, snapshot sharing via link. We’d love your feedback.

---

## 7. App icon

| Spec | Value |
|------|--------|
| Size | 1024 × 1024 px |
| Format | PNG |
| Transparency | None |
| Color | sRGB or Display P3 |
| Source | `ios/App/App/Assets.xcassets/AppIcon.appiconset` |

---

## 8. Screenshots (storyboard)

Prepare **5–10** per required device class. Use real data, large legible type.

| # | Screen | Caption idea |
|---|--------|----------------|
| 1 | Hero — canvas with several tiles | “Six directions. One idea.” |
| 2 | Expand / generation result | “Brainstorm on-device (supported devices)” |
| 3 | Merge / drag | “Merge two tiles into one” |
| 4 | Key themes / filter | “Star themes; filter the map” |
| 5 | Export / share | “Export PNG — snapshot share link opens in Safari” |
| 6 | Settings / privacy stance | “Private by design on iOS” |

**Sizes (verify in ASC):**

- iPhone 6.7" — required set for modern phones
- iPhone 6.5" — if still required for your ASC version
- iPad 12.9" — if iPad screenshots enabled

---

## 9. App Preview (optional)

- 15–30 s portrait, show tap-to-expand + merge + export.
- Avoid claiming features not in iOS build.

---

## 10. Privacy nutrition label (align to truth)

- If **no** analytics SDK in Capacitor build: declare **Data Not Collected** for tracking categories that apply.
- If **web** injects Umami only on non-Capacitor: iOS app binary may still be “no collection” — confirm no native SDK.
- Board snapshot `POST /api/share` sends board JSON to your server — disclose **User Content** or **Other Data** if ASC categories require it for “uploaded content.” When in doubt, match questionnaire to actual network calls.

---

## 11. Review notes (paste into ASC)

Suggested short form:

> Thought Tiles is a hexagonal mind-mapping app. On supported iPhone hardware with Apple Intelligence enabled, tile expansion uses on-device generation; there is no cloud fallback for that path on iOS. Snapshot sharing creates a browser-openable link; live multi-user collaboration is available on the **website**, not in the native shell for this version. Test with an eligible device; on ineligible devices users will see an explicit availability message.

---

## 12. Pre-upload checklist

- [ ] Version + build number incremented
- [ ] Archive: **Any iOS Device (arm64)** — not Mac Catalyst
- [ ] `PrivacyInfo.xcprivacy` present and accurate
- [ ] Legal URLs load (not SPA catchall)
- [ ] AASA deployed if using Universal Links (see `NEXT_STEPS.md`)
- [ ] `VITE_PUBLIC_WEB_APP_URL` set in iOS build env if canonical origin is not `https://hexmind.app`

See also [`RELEASE_SPEC.md`](./RELEASE_SPEC.md) for full workflow.
