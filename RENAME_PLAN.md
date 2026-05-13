# Hexpand → Hexmind rename plan

> **2026-05-13:** The **user-facing** product name is now **Idea Tiles** (*Brainstorm with local AI*). The prior **Thought Tiles** working title (2026-05-12) was retired in favor of the clearer, less metaphor-loaded "Idea Tiles" after a `/team` review. Bundle id `app.hexmind.ios`, Universal Link domains (`hexmind.app`, etc.), and `hexpand_*` storage keys stay as-is for continuity. The body below records the earlier **Hexmind** working-title rename from Hexpand and is kept for history.

Decided 2026-05-08 after a council pass with corrected facts. This plan
supersedes the prior NEXT_STEPS sequencing — block all App Store Connect
work until this rename completes; the cost asymmetry is roughly 5h now
vs. 25h+ post-launch.

## Why now

- Existing `Hexpand!` puzzle game on the App Store (Nebih Basaran, 2025) creates a name collision. Mild on its own, but combined with Luke's expressed dislike of "Hexpand," tilts the call.
- "Hexmind" has the cleanest verified collision profile: zero direct App Store hits in any category, npm namespace empty.
- One real risk to flag: **hexmind.com is an active independent video game company** ("Hexmind — An independent video game company," English/Français, at IP 167.172.128.202). Different USPTO class (Class 41 entertainment vs. Class 9 productivity software) — coexistence plausible, but priority filing matters.
- Visual identity (hex + lightning bolt) is brand-name-independent — only the wordmark "HEXPAND" → "HEXMIND" needs swapping in the 7 mockups (1 dark splash + 6 light variants + the 12-option icon set narrows to 1 pick).

## What's been verified (and what's NOT)

Verified by direct curl/dig/WHOIS this session:

- **hexmind.app** (yours): WHOIS created 2015-06-25, serving your React app at 65.181.112.75
- **hexmind.io** (yours): same IP, same content
- **hexpand.app, hexpander.app, hivemind.cx, hive-mind.pro** (all yours per entitlements + serving the same backend)
- **hexmind.com** (NOT yours): Hexmind video game studio at 167.172.128.202, GoDaddy, English/Français site
- **hexmindsolutions.com**: connection refused (offline)
- App Store search "hexmind": 0 direct hits
- npm `hexmind`: 0 packages
- GitHub `hexmind` username: TAKEN (individual). `HexmindGames`: TAKEN. Solution: use a different org.
- USPTO TESS: NOT verified from this shell. Counsel-confirm before filing.

## Bundle id decision

Two defensible options, pick one before any Apple Developer portal work:

| Bundle id | Pros | Cons |
|---|---|---|
| `app.hexmind.ios` | Reads like the brand. Matches owned `hexmind.app` domain (you own it; legal mis-flagged this earlier). Brand-on-name. | If Hexmind Games ever buys hexmind.app from you / contests, the bundle id reads awkwardly. Tied to specific domain. |
| `pro.bridgecitylab.hexmind` | Tied to the LLC namespace you provably own forever via the Apple team id. Survives any brand pivot. | Less brand-on-name. Verbose. |

**Recommendation: `app.hexmind.ios`** — you own hexmind.app since 2015, the domain risk is minimal, and the brand-on-name reads cleaner to App Review. If you'd rather have the more defensive `pro.bridgecitylab.hexmind`, swap before any of the Apple Developer portal work below.

## Sequencing — block ASC creation until this completes

The window-closure asymmetry: rename today is ~5 hours; rename after ASC record is created adds tester orphaning + record recreation; rename after App Store submission requires a full re-review cycle. **Do this BEFORE the App ID capabilities + ASC record steps in NEXT_STEPS.md.**

### Phase 1 — Code changes (~4.25h active)

Order matters; later steps depend on earlier.

- [ ] **Pick bundle id** (decision above): `app.hexmind.ios` recommended
- [ ] **`capacitor.config.ts`**: change `appId` to chosen bundle id, `appName: 'Hexmind'`
- [ ] **`ios/App/App.xcodeproj/project.pbxproj` lines 347 + 370**: `PRODUCT_BUNDLE_IDENTIFIER = <new bundle id>` (both Debug + Release configs)
- [ ] **`ios/App/App/Info.plist`**: `CFBundleDisplayName` → `Hexmind`, `CFBundleName` → `Hexmind`
- [ ] **`pnpm cap sync ios`** — regenerates `ios/App/App/capacitor.config.json`
- [ ] **AASA file**: `server/_core/index.ts` lines 52 + 63 — change `596T7J7FB6.dev.dreamer.hexpand` → `596T7J7FB6.<new bundle id>`
- [ ] **Deploy server** — single Node deploy serves all 6 brand domains via Caddy reverse proxy (verified by recon seat). Run the existing deploy command (`cp -r dist/* ~/servers/hexpand/dist/ && sm restart hexpand` or equivalent — verify in ~/CLAUDE.md key paths).
- [ ] **Page rename**: `client/src/pages/HexpandApp.tsx` → `HexmindApp.tsx`. Update imports across the project. Internal class/component name `HexpandApp` → `HexmindApp`. (Repository file rename is a real grep-and-replace; ~12 import sites.)
- [ ] **User-visible UI strings** (35 grep hits found by manager seat across these files):
  - `client/src/components/Toolbar.tsx:127` — header brand chip
  - `client/src/components/CollabModal.tsx:124` — share text "Join my Hexpand board"
  - `client/src/components/KeyboardShortcutsModal.tsx:111`
  - `client/src/components/SettingsModal.tsx:109, 279`
  - `client/src/components/OnboardingTour.tsx`
  - `client/src/hooks/useOGImage.ts:26` — dynamic OG title
  - `client/src/lib/canvasSnapshot.ts:307` — `ctx.fillText("Hexpand", ...)` watermark on snapshots
  - `server/ogRoute.ts:60-70` — server-rendered OG meta (4 references)
  - `client/index.html` — `<title>` + `og:title` + `twitter:title` (3 references)
- [ ] **Docs**: `package.json` `"name"` field, `README.md`, `CLAUDE.md`, `NEXT_STEPS.md`, `todo.md`. Just the user-facing references; comments referencing "hexpand" historically can stay.
- [ ] **DO NOT rename localStorage keys** (`hexpand_sessions`, `hexpand_autosave`, `hexpand_api_keys`, `hexpand_provider`, `hexpand_tour_completed`, `hexpand_font_size`, `hexpand_animations`, `hexpand_key_themes`) or the `Dexie("HexpandDB")` name. TestFlight tester data depends on them. Document this asymmetry in `CLAUDE.md`. Renaming would force a one-time migration shim (~1.5h work) for zero user benefit at this stage.
- [ ] **Type-check + tests** — `pnpm check && pnpm test` (68/68 should still pass; the rename doesn't touch test surface)
- [ ] **Commit on a branch** — `chore(brand): Hexpand → Hexmind` with a single bundle id + name + UI string sweep

### Phase 2 — Apple Developer portal (~0.4h)

- [ ] **Register App ID** for new bundle id at developer.apple.com → Identifiers → +
  - Capabilities: tick **Associated Domains** (no App Group needed — entitlements claim none)
  - Description: `Hexmind`
- [ ] **Old App ID `dev.dreamer.hexpand`**: leave registered for now; don't deprecate until App Store launch settled
- [ ] **No App Group registration** needed (Hexmind, like Hexpand, doesn't use one)

### Phase 3 — Asset rework (~2.4h, can defer to v1.1 if blocking)

- [ ] **Pick 1 icon** from the 12-option set Luke shared. Recommendation per the dark splash aesthetic: top-row 2nd-from-left (dark background with the yellow glow ring). Defer the other 11.
- [ ] **Wordmark swap "HEXPAND" → "HEXMIND"** in:
  - 1 dark splash mockup (Image #6 from session)
  - 6 light variants (Image #7 from session)
- [ ] **Export AppIcon.appiconset** at 1024×1024 source; Xcode auto-derives variants (verified by the whatcolor flow earlier this session — `sips -z 1024 1024 source.png --out AppIcon-1024.png` works fine for clean geometric icons)
- [ ] **Export Splash imageset** (1x/2x/3x) for `ios/App/App/Assets.xcassets/Splash.imageset/`
- [ ] **Tagline candidate**: "Map one idea. Merge two. Stay offline." (App Store-ready, names the core verbs + privacy stance). Or keep current "Expand ideas. Connect insight." which still parses for Hexmind despite the verb mismatch.
- [ ] **If asset rework blocks**: ship rename with placeholder splash (text-only "HEXMIND" on `#0a0a0a`) and swap assets in next TestFlight build. Asset slip does NOT block bundle id rename.

### Phase 4 — App Store Connect (~0.4h after phases 1-2 complete)

- [ ] appstoreconnect.apple.com → My Apps → **+** → New App
- [ ] Platform: iOS · Name: `Hexmind` · Primary language: English · Bundle ID: pick from dropdown (will appear once registered) · SKU: `hexmind-ios`
- [ ] App Store name (30 char limit): **`Hexmind: Mind Maps Offline`** (25 chars)
- [ ] Subtitle (30 char limit): **`Private hex maps, on-device`** (27 chars)

### Phase 5 — TestFlight rebuild + tester re-invite (~0.4h active + 15-30 min processing)

- [ ] Xcode toolbar destination → **Any iOS Device (arm64)**
- [ ] **Product → Archive**
- [ ] Organizer → **Distribute App** → App Store Connect → Upload → defaults → Automatically manage signing → Upload
- [ ] Wait for processing
- [ ] **Re-invite testers** to new app (old TestFlight build orphans automatically when bundle id changes — testers see new app appear, old greys out). DM internal testers a heads-up before they panic.

### Phase 6 — Trademark filing (~1h Luke time, $250-350)

- [ ] **Optional but recommended first**: $300-500 counsel knockout search on USPTO TESS for "Hexmind" Class 9 — surfaces unpublished ITUs and state registrations not visible in public search. Worth the spend before the filing fee.
- [ ] **TEAS Plus filing, Class 9** ($250) for "downloadable mind-mapping software" — establishes constructive use date nationwide. Specimen: TestFlight screenshot once Phase 5 ships. Bridge City Lab LLC as applicant.
- [ ] **Skip Class 41** for now — invites Office Action arguing overlap with Hexmind Games. One-class filing is cleaner.

### Phase 7 — License cleanup (~0.5h, before any portfolio post)

`package.json` declares `"license": "MIT"` but no `LICENSE` file exists. Pick one:

- [ ] **(a) Add real MIT** — write `LICENSE` with standard MIT text + `Copyright (c) 2026 Luke Steuber / Bridge City Lab LLC`
- [ ] **(b) Switch to proprietary** — `package.json` `"license": "UNLICENSED"`, add a short proprietary `NOTICE.md`. Capacitor (MIT), Radix (MIT), drizzle-orm (Apache-2.0) all permit closed-source apps with attribution. Ship third-party-notices in app Settings.
- [ ] **(c) Source-available** — add LICENSE that allows reading + non-commercial redistribution but reserves commercial rights to BCL LLC. Custom; needs counsel review.

Recommended: (a) for fastest path to portfolio post. Switch to (b) at App Store launch if commercialization story changes.

### Phase 8 — Hexmind Games courtesy contact (~10 min)

- [ ] Send one-paragraph email via hexmind.com contact form. Frame: "Heads-up, shipping a productivity app under the same word-mark in a different USPTO class. Always shipping as 'Hexmind: Mind Maps' to disambiguate. Happy to coordinate." Costs nothing, pre-empts a future weak cease-and-desist.

### Phase 9 — Portfolio post (~8.5h if `dr.eamer.dev` infra reused for blog, ~11.5h if standing up new blog)

- [ ] Hook (corrected per scout's HN data — DROP "Apple Intelligence" from headline): **"Show HN: Hexmind — offline hex mind-maps, no servers, no accounts"**
- [ ] Body leads with the two core verbs (expand a tile / merge two tiles), names Foundation Models in paragraph 3 as implementation detail
- [ ] Excerpt the dual-layer timeout pattern (Swift `withThrowingTaskGroup` + JS `Promise.race`) — your code, MIT after Phase 7
- [ ] Demo video before code excerpts
- [ ] TestFlight link as primary CTA
- [ ] Cross-post: r/iOSProgramming, Capacitor Discord, iOS Dev Weekly tip line (Natasha the Robot covers FoundationModels actively)
- [ ] Headline metric: TestFlight installs in the 72 hours after Show HN — not GitHub stars, not interview requests
- [ ] **Audience: indie iOS devs + Capacitor/Ionic hybrid devs** (the underserved intersection per scout's comparable-products read)

### Phase 10 — GitHub org setup (~30 min, can happen any time after Phase 1)

- [ ] Create `bridgecitylab` GitHub org (clean `hexmind` username is taken; `bridgecitylab/hexmind` is more portfolio-friendly anyway — future apps live there too)
- [ ] Push the renamed repo to `bridgecitylab/hexmind`
- [ ] Optionally archive `lukeslp/hive-app` with a README pointing to the new home, OR keep as a fork/mirror

## Total time estimate

| Phase | Time | Cost |
|---|---|---|
| 1. Code changes | 4.25h active | $0 |
| 2. Apple portal | 0.4h | $0 |
| 3. Asset rework | 2.4h | $0 (Luke time) |
| 4. ASC record | 0.4h | $0 |
| 5. TestFlight rebuild | 0.4h + processing | $0 |
| 6. Trademark | 1.0h + counsel | $250 + ~$300-500 counsel |
| 7. License cleanup | 0.5h | $0 |
| 8. Courtesy email | 0.2h | $0 |
| 9. Portfolio post | 8.5h | $0 (existing infra) |
| 10. GitHub org | 0.5h | $0 |
| **Total** | **~18.5h Luke** | **$550-750** |

Roughly 2-3 working days for the full sequence. Phases 1-5 are the
critical path that unblocks App Store launch (~8h, fits in one focused
day). Phases 6-10 can chain in over the following week.

## Verification gates

After each phase:

- **Phase 1:** `pnpm check && pnpm test` green; simulator build succeeds; tap a tile → on-device toast still fires (the rename doesn't touch the FM dispatch path)
- **Phase 2:** Apple Developer portal shows new App ID with Associated Domains capability
- **Phase 5:** Build appears in App Store Connect TestFlight tab within 30 min; install via TestFlight app on real device; verify Universal Link from at least 2 of 6 brand domains opens the app
- **Phase 6:** USPTO TEAS confirmation email with serial number
- **Phase 9:** Show HN goes live; track upvotes + TestFlight install metric in real time

## Rollback plan

If Apple App Review rejects the Hexmind name (low probability — Hexmind Games is in different category, no App Store name collision, but possible if reviewer cites brand confusion):

- **Bundle id is locked at submission** — can't revert to `dev.dreamer.hexpand`
- **App Store name is changeable** — submit a 1.0.1 with a different name (e.g. "Hexmind: Brainstorm Maps" / "Hexmind Maps") and re-submit
- **Worst case**: ~3-day delay vs. losing the name claim entirely

If Hexmind Games sends a cease-and-desist post-launch (low probability given different USPTO class, but non-zero):

- Coexistence agreement is the standard outcome — costs $1-3k legal time
- Pre-emptive courtesy email (Phase 8) reduces this risk substantially

## What this plan deliberately does NOT do

- Does not rename localStorage / Dexie keys — preserves TestFlight tester data, documented in CLAUDE.md
- Does not rename historical comments mentioning "hexpand" or git commit messages — those are immutable history
- Does not deprecate the old `dev.dreamer.hexpand` App ID — leave registered until App Store launch settled
- Does not touch hivemind.cx / hive-mind.pro deployment — those continue serving the same web app under their own branding
- Does not file Class 41 trademark — invites Office Action with Hexmind Games
- Does not bundle the asset rework into the bundle id rename — assets can ship in next TestFlight if blocked

## Open decisions for Luke

1. **Bundle id**: `app.hexmind.ios` (recommended) vs. `pro.bridgecitylab.hexmind` (defensive)
2. **License**: MIT (open) vs. UNLICENSED (proprietary) vs. source-available
3. **Courtesy email to Hexmind Games**: send (recommended) vs. skip
4. **Counsel knockout search**: $300-500 paid (recommended) vs. self-search via TESS
5. **Asset rework timing**: same window as rename (clean) vs. defer to v1.1 (faster ship)

## References

- Council outputs from 2026-05-08 second-pass (this session): /Users/luke/.swarm/* — see `next-steps/`, `recommendations/`, `reports/`
- Snippet on dual-layer timeout pattern (the portfolio post's primary technical content): `~/.swarm/snippets/2026-05-08-foundationmodels-bridge-bisect.md`
- TestFlight upload silent-failure traps: `~/.swarm/snippets/2026-05-08-xcode-testflight-upload-gotchas.md`
- Verified files this rename touches: `capacitor.config.ts`, `ios/App/App.xcodeproj/project.pbxproj` (lines 347, 370), `ios/App/App/Info.plist`, `ios/App/App/App.entitlements` (no change — domains stay), `ios/App/App/Base.lproj/LaunchScreen.storyboard` (no change — wordmark-free), `ios/App/App/Assets.xcassets/{AppIcon,Splash}.{appiconset,imageset}`, `server/_core/index.ts` (AASA), `server/ogRoute.ts`, `client/index.html`, `client/src/pages/HexpandApp.tsx` → `HexmindApp.tsx`, `client/src/components/{Toolbar,CollabModal,KeyboardShortcutsModal,SettingsModal,OnboardingTour}.tsx`, `client/src/hooks/useOGImage.ts`, `client/src/lib/canvasSnapshot.ts`, `package.json`, `README.md`, `CLAUDE.md`, `NEXT_STEPS.md`, `todo.md`
