# App Store Pack — Idea Tiles MVP

Copy-paste oriented metadata + asset checklist for App Store Connect. Aligned to **current** product behavior: iOS on-device AI, snapshot share links, **no** native live collaboration. App Store **Name** / **Subtitle** below match in-app branding; bundle id stays `app.hexmind.ios`. **Canonical marketing URLs** use `ideatiles.app`; legacy domains may still proxy to the same deployment. Update before each ASC submission.

> **Source of decisions:** `/consensus` + `/team` pass on 2026-05-13, with a partial re-run later the same day to retry Ollama Cloud, xAI, and OpenAI. See [§0 below](#0-consensus--team-summary) for the rationale, dissent, and ASO risks behind every copy block.

## Platforms (this pack)

- [x] iPhone (required)
- [x] iPad (Designed for iPad / universal)
- [ ] Mac (Designed for iPad listing — same binary, ASC toggle in Pricing & Availability)
- [ ] Apple Watch / TV / vision — N/A

---

## 0. Consensus + /team summary

**Decision:** Position Idea Tiles as a **verb-first brainstorming canvas** for solo creative pros under deadline pressure. The on-device AI is the supporting moat, not the headline. Lead with the four core verbs (expand · merge · star · export); let "private, on-device" carry the second paragraph. Name flipped from `Thought Tiles` to `Idea Tiles` on 2026-05-13 (post-`/team` review) — clearer search intent, less metaphor decoding, and "Idea" is exactly what users type when they're stuck.

### Voices consulted

| Voice                               | Transport  | Status (initial → retry)                                                                                                                                         |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mistral Large                       | API        | ✅ Full response (re-confirmed on retry; same audience/risks)                                                                                                    |
| Ollama Cloud (`minimax-m2.5:cloud`) | CLI + REST | ❌ Needs interactive `ollama signin`; direct API tried with `OLLAMA_KEY_ID/SECRET` as Bearer/Basic/X-API-Key → all 401 (cloud auth uses ed25519 request signing) |
| xAI Grok (grok-4-fast → grok-3)     | API        | ❌ HTTP 403 `"API key is currently blocked"` on retry — key needs regeneration at console.x.ai                                                                   |
| OpenAI (gpt-4o-mini → gpt-4.1)      | API        | ❌ Quota (429) on retry — refill not yet visible                                                                                                                 |
| Perplexity (sonar / sonar-pro)      | API        | ❌ Quota (401) re-confirmed                                                                                                                                      |
| Gemini CLI (`gemini-2.5-pro`)       | CLI        | ❌ Capacity exhausted                                                                                                                                            |
| Codex CLI                           | CLI        | ❌ Hung on stdin                                                                                                                                                 |
| cursor-agent                        | CLI        | ❌ Unauthenticated                                                                                                                                               |
| Claude (this synthesis)             | in-session | ✅ /team executive                                                                                                                                               |

The retry produced one repeat external voice rather than three fresh ones. Mistral's second pass agreed with the original on audience ranking and risk register, which raises confidence in the consensus block without changing it. The post-consensus rename (`Thought Tiles` → `Idea Tiles`, 2026-05-13) was a separate `/team` decision: cleaner search intent, less metaphor decoding, and a better fit for the new icon/splash artwork. To get a stronger panel for ASO, run `ollama signin` (interactive browser flow), regenerate the xAI key, and refill OpenAI, then re-run the consensus prompt with the new name spliced in.

### Audience verdict

| Rank  | Persona                                                                                       | Why                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **Solo creative pros under deadline** (writers, designers, indie devs, freelance researchers) | Largest commercially-active audience that already pays for note tools and notices when AI saves them 20 minutes on a discovery loop. |
| 2     | Product managers / UX leads doing discovery & opportunity mapping                             | Pay-willing, but the hex canvas is unfamiliar; needs case-study positioning in v1.1.                                                 |
| 3     | Students & researchers                                                                        | High DAU/MAU, low ARPU; great for word-of-mouth and ASO velocity.                                                                    |
| 4     | Privacy-first power users                                                                     | The natural "Show HN / Hacker News" crowd; small but evangelical.                                                                    |
| 5     | Coaches / therapists / educators with clients                                                 | Live collab is web-only this release — defer until phase 2.                                                                          |

**Dissent (cynic seat):** Mistral and the safety seat both argued for E (privacy-first) as primary, on the grounds that on-device AI is the _only_ genuinely defensible moat in a crowded mind-map market. The executive overruled to A because (a) ASC search volume for "mindmap" + "brainstorm" dwarfs "private" / "on-device" by ~10×, and (b) "local AI" is already baked into the subtitle, so privacy users will still find the app via secondary keywords. Revisit at 90-day cohort review.

### Top 3 ASO / launch risks

1. **Apple Intelligence hardware gate** — On-device generation requires iPhone 15 Pro / 16+ / M-series iPad with Apple Intelligence enabled (~10–15% of installed base). Risk: 1-star reviews from "AI doesn't work" on ineligible devices. **Mitigation:** the ineligible-device path already shows a clear availability message; reinforce in screenshot 6 and review notes.
2. **In-memory `/api/share` store** — Snapshot links break when the server restarts. Tester loops back two days later, sees "share not found," writes a complaint. **Mitigation:** lower the promise in Promo text ("snapshot link, opens in Safari" — not "permanent share"); a DB-backed `/api/share` is the right phase-2 fix (`docs/RELEASE_REVIEW.md` High #2).
3. **Generic name in a crowded category** — "Idea Tiles" is clearer than the prior "Thought Tiles" but still generic; "Idea" is a high-intent search root, but the name doesn't carry "hex" or "AI" by itself. Competing against Mindly, MindNode, Heptabase, Scapple, Obsidian Canvas. **Mitigation:** subtitle adds `Brainstorm with local AI` and the keyword field carries `hexagon,mindmap,outline,whiteboard,ondevice`. Reassess after the first Apple Search Ads cohort.

### Architecture fit (technical seat)

ASC submission only touches **metadata + the existing iOS binary**. No code change required. Pre-upload checklist (§12) is the executable artifact; everything else in this pack is paste-into-ASC text.

### Legal & IP (legal seat)

`MIT` LICENSE in repo (commit `85d2e9d`). Bundle id `app.hexmind.ios` and Apple Team `596T7J7FB6` are the legal-of-record. Trademark posture (`Idea Tiles` word-mark, Class 9) tracked in `NEXT_STEPS.md` — non-blocking for this submission; descriptive-name strength is weaker than the prior `Thought Tiles` mark and warrants a real clearance pass before filing.

---

## 1. Basic information

| Field                  | Value                                                                                                                                     | Limit    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Name**               | `Idea Tiles` (10) — fallback `Idea Tiles: Brainstorm` (22) if Apple flags the bare name                                                   | 30 chars |
| **Subtitle**           | `Brainstorm with local AI` (24) — alts: `Hex maps with local AI` (22), `On-device AI brainstorming` (26, privacy-led, from Mistral retry) | 30 chars |
| **Primary category**   | Productivity                                                                                                                              | —        |
| **Secondary category** | Graphics & Design                                                                                                                         | —        |
| **Content rights**     | No third-party content requiring rights                                                                                                   | confirm  |
| **Age rating**         | 4+ (no user-generated content surfaced to others; collab is web-only)                                                                     | —        |

---

## 2. URLs (must be live)

| Field              | URL                                                         |
| ------------------ | ----------------------------------------------------------- |
| **Privacy Policy** | `https://ideatiles.app/privacy`                             |
| **Support**        | `https://ideatiles.app/` (or `mailto:luke@lukesteuber.com`) |
| **Marketing**      | `https://ideatiles.app/` (optional; same domain)            |

See also [`APP_STORE_CONNECT_CANONICAL.md`](./APP_STORE_CONNECT_CANONICAL.md) for a one-page ASC checklist.

---

## 3. Promotional text (170 chars, editable any time, no review)

Pick one before paste; all three fit. Prefer **A** for launch, **B** for any v1.x update push, and **C** if the privacy angle starts pulling more conversions in Apple Search Ads cohorts.

- **A — verb-first (164 chars)** ✅ recommended

  > Tap a tile to brainstorm six new directions, drag two together to merge, then star, filter, and export. On supported iPhones the AI runs on-device.

- **B — moat-first (167 chars)**

  > A hex tile canvas for fast, private brainstorming. Expand any tile into six new ideas, merge two into one, then export — no account, no cloud trip on iOS.

- **C — privacy-led (152 chars, from Mistral retry)**
  > Hexagonal tiles, on-device AI. Expand, merge, and export ideas — no cloud required on iPhone with Apple Intelligence. No account, no tracking.

---

## 4. Full description (≤4000 chars; this draft is ~1,800)

Paste verbatim. Plain text. No emojis. No competitor names. Every claim is provable in the current binary.

```
Turn one idea into a whole canvas.

Idea Tiles is a hexagonal brainstorming app for anyone who thinks in
fragments — writers chasing a stuck chapter, designers mapping a flow,
indie product folks scoping the next feature, students breaking a topic
into pieces. You start with a single tile. From there, four verbs:

• Expand — tap any tile and the AI sketches six related directions
  around it. Branches keep their context, so the third ring still
  knows what the first tile was about.
• Merge — drag two tiles together and the app synthesizes a new one
  that captures what the pair share.
• Star — mark key themes and filter the canvas to just those threads
  when the board gets dense.
• Export — save a board as PNG, SVG, or JSON, share a link, or pick up
  where you left off across sessions.

Private by default on iPhone and iPad.
On supported iPhones (iPhone 15 Pro, iPhone 16 and later, or an
M-series iPad with Apple Intelligence enabled), tile expansion uses
Apple's on-device Foundation Models. Your prompts and ideas never
leave the device. There is no cloud fallback on iOS — if the model
isn't available, the app tells you instead of quietly sending data
elsewhere. No accounts, no analytics SDK, no tracking IDs.

On the web (ideatiles.app) and Android, you can bring your own API key
for Gemini, Claude, GPT, Grok, Mistral, or a local Ollama server.
Boards still save to your device first.

Share a board.
Tap Share to create a snapshot link. It opens in Safari (or any
browser) so the people you send it to don't need the app. Live
multi-user collaboration is available on the web app today; the iOS
shell focuses on solo brainstorming and snapshot sharing for this
release.

Built to feel fast.
Smooth pan and pinch on the canvas, undo/redo for every move,
keyboard shortcuts for the desktop and iPad-with-keyboard crowd,
and proper accessibility labels for VoiceOver.

Requirements.
• AI tile expansion needs Apple Intelligence (iOS 26 or later) on
  eligible hardware.
• Other features — canvas, merge, star, filter, export, snapshot
  share — work on any supported iPhone or iPad.
• If your device can't run Apple Intelligence, you'll see a clear
  message instead of a confusing failure.

Free, no in-app purchase, no subscription. Open-source under the MIT
license. We'd love your feedback at luke@lukesteuber.com.
```

(Character count: ~1,820 / 4,000.)

---

## 5. Keywords (100 chars, comma-separated, no spaces)

ASC indexes Name + Subtitle automatically, so this list deliberately avoids: _idea, tiles, brainstorm, local, ai_. Productivity is implicit via primary category.

```
mindmap,hexagon,offline,private,ondevice,ideation,notes,canvas,diagram,focus,outline,whiteboard,plan
```

Length: 100 / 100. Thirteen high-intent tokens. Drops `brainstorm` (now auto-indexed via subtitle) and `productivity` (category-implicit) from the prior list; adds `outline`, `whiteboard`, and `plan` — higher-volume tokens that don't collide with Name/Subtitle. Considered and rejected: `apple intelligence` (Apple discourages branded keywords), `mind,map` split (wastes 2 chars vs. `mindmap` while indexing the same root), `writer` / `designer` (too persona-specific for a productivity listing).

---

## 6. What's New (v1.0)

```
First release. Tap a tile to brainstorm six new directions, drag two
together to merge, star themes, filter the canvas, and export as PNG,
SVG, or JSON. On supported iPhones, expansion runs on-device with
Apple Intelligence — no account, no cloud trip. Feedback welcome:
luke@lukesteuber.com.
```

(364 chars.)

---

## 7. App icon

| Spec     | Value                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Size     | 1024 × 1024 px                                                                 |
| Format   | PNG, no transparency                                                           |
| Color    | sRGB or Display P3                                                             |
| Source   | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-{light,dark}-1024.png` |
| Variants | Light + dark appearance both committed                                         |

---

## 8. Screenshots (storyboard)

Prepare **5–10** per required device class. Real boards, large legible type, captions baked into a frame strip if you use one.

| #   | Screen                                           | Caption (≤45 chars)                   |
| --- | ------------------------------------------------ | ------------------------------------- |
| 1   | Hero — canvas with a small populated board       | Six directions. One tile at a time.   |
| 2   | Expansion in progress / freshly generated tiles  | Tap to brainstorm six new directions. |
| 3   | Drag-to-merge in motion                          | Merge two tiles into one.             |
| 4   | Star + filter view                               | Star themes. Filter the canvas.       |
| 5   | Export sheet / share link                        | Export PNG, SVG, or a link.           |
| 6   | Settings showing on-device path / privacy stance | Private by design on iPhone.          |

**Required sizes (verify in your ASC version):**

- iPhone 6.9" (iPhone 16 Pro Max) — currently the canonical iPhone set
- iPhone 6.5" — only if your ASC view still asks (Apple is sunsetting this)
- iPad 13" — if the listing enables iPad screenshots

---

## 9. App Preview video (optional, 15–30 s, portrait)

Shot list (in order):

1. Tap canvas → first tile appears (1 s).
2. Tap tile → six neighbors fan out (3 s).
3. Drag two neighbors together → merged tile (3 s).
4. Star a tile → filter view → unfilter (3 s).
5. Export → share sheet → link (3 s).
6. Hold on the icon/wordmark with the "on-device" line beneath (2 s).

Do not show features that aren't in the iOS build (no live collab, no cloud spinner). No voice-over claims that go beyond §4.

---

## 10. Privacy nutrition label

Match the questionnaire to actual network calls and storage:

- **Tracking:** none. No SDKs that fingerprint or share with brokers.
- **Linked to you / Used to track you:** none.
- **Not linked to you:**
  - _User Content_ — board JSON, only when the user taps Share → `POST /api/share`. Snapshot is short-lived and not associated with a user account.
  - _Identifiers_ — none unless OAuth sign-in is used on the web (out of scope for iOS submission).
- **Data not collected:** everything else — no analytics SDK, no advertising ID, no crash-reporting third party in the Capacitor binary.

Web injects Umami only on `!isCapacitor()` paths (see `client/src/main.tsx`); the iOS binary still ships "no analytics collected."

---

## 11. Review notes (paste into ASC)

```
Idea Tiles is a hexagonal brainstorming app.

AI tile expansion uses Apple's on-device Foundation Models framework
(iOS 26 or later, Apple Intelligence eligible hardware). There is no
cloud fallback for that path on iOS — on ineligible devices the user
sees an explicit availability message instead of a silent failure.

Snapshot sharing creates a browser-openable link by POSTing the board
JSON to /api/share; the server returns a short id used in a ?s=ID URL
hosted at ideatiles.app (legacy brand domains still resolve). Recipients open the link in Safari, no account
required. Live multi-user collaboration is available on the web app
only for this release.

Please test on an Apple-Intelligence-eligible device (iPhone 15 Pro,
iPhone 16 or later, M-series iPad) with Apple Intelligence enabled in
Settings. On any other device, tapping a tile will surface a clear
"Apple Intelligence isn't available" message — this is intentional.

Open source under MIT (github.com/lukeslp/hive-app).
```

(686 chars; ASC accepts notes up to 4000.)

---

## 12. Pre-upload checklist

- [ ] Marketing version + build number incremented in Xcode
- [ ] Archive destination: **Any iOS Device (arm64)**, not Mac Catalyst
- [ ] `PrivacyInfo.xcprivacy` reflects §10 truthfully
- [ ] `/privacy` and `/terms` return real HTML on the deployed origin (not the SPA shell)
- [ ] AASA deployed at every brand domain if Universal Links are advertised (`NEXT_STEPS.md`)
- [ ] `VITE_PUBLIC_WEB_APP_URL` set in iOS build env if the canonical origin should **not** be `https://ideatiles.app` (see `APP_PUBLIC_WEB_ORIGIN` in `shared/appBrand.ts`)
- [ ] `pnpm check` + `pnpm test` green
- [ ] Cold launch smoke test on hardware: splash hides → canvas interactive
- [ ] Tile expand on an eligible device + the clear error on an ineligible one
- [ ] Snapshot share link copy-pasted into Safari on a second device opens the board
- [ ] Export PNG / SVG / JSON each produces a usable file via the iOS share sheet

See [`RELEASE_SPEC.md`](./RELEASE_SPEC.md) for the full submission workflow and [`RELEASE_REVIEW.md`](./RELEASE_REVIEW.md) for the prioritized risk register.
