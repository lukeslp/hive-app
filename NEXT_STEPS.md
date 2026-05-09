# Next steps — Hexmind

> Pickup point as of 2026-05-09. The rename from "Hexpand" to "Hexmind"
> shipped in `85d2e9d`; macOS support via "Designed for iPad" enabled in
> `f13f8c9`. Both pushed to `origin/main`. Apple Developer App ID
> `app.hexmind.ios` is registered with capabilities; App Store Connect
> "App" record exists. Tag `ios-on-device-firing` records the milestone
> where Apple Foundation Models actually generated on-device for the
> first time (verified iOS 26.4 simulator).

## Right now — server redeploy is the only blocker for TestFlight

The AASA file source was edited (`server/_core/index.ts` lines 52, 63
now point at `596T7J7FB6.app.hexmind.ios` instead of the old hexpand
identifier). **The deployed copy at dr.eamer.dev is still serving the
old AASA**, so Universal Links from any of the 6 brand domains will
fail signature validation against the new App ID until this redeploys.

```sh
ssh dr.eamer.dev "cd ~/projects/hexpand && git pull && pnpm build && \
  cp -r dist/* ~/servers/hexpand/dist/ && sm restart hexpand"
```

(Substitute the actual deploy command if the repo path or sm service
name differs. Per CLAUDE.md the pattern is `~/projects/<name>` source
+ `~/servers/<name>` deploy + `sm restart <name>`.)

Verify after deploy:
```sh
curl -s https://hexmind.app/.well-known/apple-app-site-association | \
  python3 -c "import json,sys; d=json.load(sys.stdin); \
  print(d['applinks']['details'][0]['appIDs'])"
# Expect: ['596T7J7FB6.app.hexmind.ios']
```

## Then — TestFlight upload (~10 min)

In Xcode (project should already be loaded):

1. Toolbar destination → **Any iOS Device (arm64)** (NOT a simulator,
   NOT "My Mac (Designed for iPad)" — the Mac availability ships via
   metadata flip in App Store Connect, not as a separate build target)
2. **Product → Archive**
3. Wait. Organizer pops when done.
4. **Distribute App** (NOT "Export") → App Store Connect → Upload →
   accept defaults → Automatically manage signing → Upload
5. Wait 5-30 min for TestFlight processing
6. App Store Connect → My Apps → Hexmind → **TestFlight** tab → add
   internal testers (yourself first)
7. Install via TestFlight app on real iPhone

If you hit the Xcode "support macOS?" prompt during archive: answer
**no Mac Catalyst** (Capacitor 8.3.1's `Capacitor.xcframework` only
ships iOS slices, no Catalyst slice — verified by direct inspection of
the framework's Info.plist). The Designed-for-iPad route is what's
already enabled and works for free on Apple Silicon Macs without code
changes.

## Then — flip Mac availability in App Store Connect (~1 min)

App Store Connect → My Apps → Hexmind → **Pricing and Availability**
→ tick **"Make this app available on Mac"**. Same iPad binary lists as
a Mac app for Apple Silicon Macs. Zero rebuild, zero code change.

## Then — App Store name + subtitle confirmation

Locked in (or to lock in) at App Store Connect → My Apps → Hexmind →
**App Information**:

- **Name** (30 chars): `Hexmind: Mind Maps Offline` (25) — or
  `Hexmind — Brainstorm Maps` (24) if the longer string was rejected
  for the same Apple-name-uniqueness reason "Hexmind" alone was. Apple
  enforces uniqueness on the full Name string, not the brand root.
- **Subtitle** (30 chars): `Private hex maps, on-device` (27)
- **Primary Category**: Productivity
- **Privacy Policy URL**: `hexmind.app/privacy` (the route should
  redirect to your existing privacy.md / privacy.html)

## Hardware verification of Apple Intelligence

The on-device path is verified on the **iOS 26.4 simulator** but not
yet on real hardware. Codex's /consensus call flagged simulator
behavior as "more fragile than hardware" — `.available == true` on
simulator does not guarantee the same path executes on a Pro device.

After TestFlight install:

- [ ] On an Apple-Intelligence-eligible iPhone (15 Pro / 16+ / iPad
  with M-series), with Apple Intelligence enabled in Settings, tap a
  tile with empty neighbors
- [ ] Watch for the "✦ Apple Intelligence — Generated on-device" toast
- [ ] If you see "On-device threw: …" or fall through silently to
  cloud, the in-app diagnostic toasts surface the exact failure mode
  (added in commit `858607b`, kept after `f945be6` switched logging
  to production)
- [ ] 10 consecutive tile expansions on real device should fire the
  success toast with no cloud fallback (cloud fallback is still desired
  on parse failure / timeout; should not fire on a healthy Pro device
  with a healthy prompt)

## Then — Class 9 trademark filing this week (~1h, $250)

Hexmind Games (the video game studio at hexmind.com, English/Français
site) is the senior user of "Hexmind" in Class 41 (entertainment
software). They likely also reserved the bare "Hexmind" name in App
Store Connect, which is why your full-string Name field is needed.
Filing Class 9 priority FAST locks productivity-software namespace
before they expand.

- [ ] **(Optional, recommended)** $300-500 counsel knockout search on
  USPTO TESS for "Hexmind" Class 9 — surfaces unpublished ITUs not
  visible in public TESS search
- [ ] **TEAS Plus filing, Class 9** ($250) for "downloadable
  mind-mapping software" at uspto.gov. Specimen: TestFlight screenshot
  once the build processes. Applicant: Bridge City Lab LLC.
- [ ] Skip Class 41 — invites Office Action arguing overlap with
  Hexmind Games. One-class filing is cleaner.

## Pre-TestFlight cleanup (single commit, recommended but not blocking)

Flagged in Xcode console traces; cosmetic but ships clean:

- [ ] **`UIScene` lifecycle adoption** — Apple deprecation, "will
  assert in a future release." Add `UIApplicationSceneManifest` to
  `ios/App/App/Info.plist`, adopt `SceneDelegate`. Capacitor 8 should
  have a template; check their docs.
- [ ] **NSLayoutConstraint width=0 conflicts on `_UIModernBarButton`**
  — three nav/toolbar buttons with no intrinsic content. 3× per launch
  in console. Fix: give the offending `UIBarButtonItem`s an SF Symbol
  image at init.
- [ ] **WKWebView pull-to-refresh / overscroll bounce** — gemini
  flagged during the random UX consensus. One-line fix in
  `AppViewController.swift`:
  ```swift
  webView?.scrollView.bounces = false
  ```
  inside `capacitorDidLoad()` after `super.capacitorDidLoad()`.
  Prevents accidental drag-down-to-refresh during expand-cascade
  animations.

## Phase 3 polish (separate plan, post-TestFlight)

The basic generate path is verified; these are quality-of-life
upgrades:

- [ ] **Streaming via `streamResponse(to:)`** — instead of waiting
  1-3s for the full FM response, stream partial branches as they
  generate. Big perceived-latency win. Apple's API:
  `session.streamResponse(to:)` returns an `AsyncSequence` of
  partials. Need a new `streamGenerate` method on the Swift plugin +
  `notifyListeners` plumbing back to JS. See
  `~/.swarm/snippets/2026-05-08-foundationmodels-bridge-bisect.md`
  for the API surface.
- [ ] **`@Generable` Swift struct for branches** — replaces JSON-text
  round-trip + `parseBranches` regex fallback with structured output.
  Eliminates a class of failure modes ("FM ran but output didn't
  parse"). Requires defining the schema in Swift; minor refactor.
- [ ] **`prewarm(promptPrefix:)` on app boot** — pre-loads the model
  so the first generation is instant instead of cold-start latent.
  Apple's framework has `LanguageModelSession.prewarm`; call it in
  `AppViewController.capacitorDidLoad`.
- [ ] **Provider-aware dispatcher** —
  `client/src/hooks/useProviderSettings.ts` exposes a
  user-selectable provider; the dispatcher in
  `client/src/hooks/useAIGeneration.ts` doesn't consult it (always
  tries FM first). If user explicitly picks a cloud provider, should
  skip FM. One-day refactor.

## Portfolio post (separate work, after TestFlight verified on hardware)

Per scout's HN data: drop "Apple Intelligence" from the headline.
Top-ranked Foundation Models Show HN posts use "on-device" + "private"
as the load-bearing phrases.

Hook: **"Show HN: Hexmind — offline hex mind-maps, no servers, no
accounts"**

Body leads with the two core verbs (expand a tile, merge two tiles),
names Foundation Models in paragraph 3 as implementation detail.
Demo video before code excerpts. TestFlight link as primary CTA.
Audience: indie iOS devs + Capacitor/Ionic hybrid devs (the
underserved intersection).

Cross-post: r/iOSProgramming, Capacitor Discord, iOS Dev Weekly tip
line. Headline metric: TestFlight installs in 72 hours after Show HN.

License posture for the post: `LICENSE` file added in `85d2e9d` (was
declared MIT with no LICENSE file before); excerpting the dual-layer
timeout pattern from `FoundationModelsPlugin.swift` and
`foundationModelsPlugin.ts` is now safe.

## Optional — Hexmind Games courtesy contact (~10 min)

Send a one-paragraph email via hexmind.com contact form. Frame:
"Heads-up, shipping a productivity app under the same word-mark in
Class 9; always shipping as 'Hexmind: Mind Maps' to disambiguate.
Happy to coordinate." Pre-empts a future weak cease-and-desist.
Optional but cheap goodwill.

## Optional — GitHub org migration

The clean `hexmind` GitHub username is taken. If you want a
portfolio-friendly home:

- [ ] Create `bridgecitylab` GitHub org
- [ ] Push current `lukeslp/hive-app` repo to `bridgecitylab/hexmind`
- [ ] Optionally archive `lukeslp/hive-app` with a README pointing to
  the new home

Not blocking; can chain in any time.

## Hygiene — remote stale branch

`feat/round-0-1-ports` is at `ec642e0` on origin, fully merged into
main weeks ago. Local copy already deleted. Remote delete is
destructive so requires explicit go:

```sh
git push origin --delete feat/round-0-1-ports
```

## App Store review notes (already drafted)

When submitting after TestFlight, paste this in the Review Notes
field:

> Hexmind is a hexagonal mind-mapping tool. The core canvas, gesture
> handling, native settings, share extension, and on-device LLM
> integration are implemented natively in Swift / Capacitor. Apple
> Foundation Models handles brainstorm generation on supported
> hardware (iPhone 15 Pro+ / iPad M-series with Apple Intelligence
> enabled), with cloud fallback for older devices. Universal Links
> from hivemind.cx and 5 sister domains open the app via the
> committed AASA file. Build supports iPad and runs natively on
> Apple Silicon Macs via Designed-for-iPad.

Adjust to match current state once verified on hardware.

## Decisions still open (from RENAME_PLAN.md)

Three of the five plan-level open decisions are not yet locked:

- [ ] Counsel knockout search on USPTO TESS before filing — yes vs.
  self-search (recommended: yes, $300-500)
- [ ] Send the courtesy email to Hexmind Games — yes vs. skip
  (recommended: yes)
- [ ] Asset rework timing — wordmark-swap mockups in same window as
  rename vs. defer to v1.1 (recommend: defer; current AppIcon works
  for v1)

Other two are now locked:
- ✅ Bundle id: `app.hexmind.ios`
- ✅ License: MIT (LICENSE file added in `85d2e9d`)

## Reference

- `RENAME_PLAN.md` — the 10-phase rename execution plan (Phase 1
  shipped in `85d2e9d`, Phase 5/Mac availability scaffold in `f13f8c9`,
  Phases 2-4 + 6-10 are user-side or follow-up work)
- `~/.swarm/snippets/2026-05-08-foundationmodels-bridge-bisect.md` —
  six reusable patterns including the dual-layer timeout,
  shadowing-dispatcher diagnosis, /team:technical right-sizing
- `~/.swarm/snippets/2026-05-08-capacitor-ios-gotchas.md` — earlier
  session's harvest with 9 patterns (plugin registration, safe-area,
  visualViewport keyboard, etc.)
- `~/.swarm/snippets/2026-05-08-xcode-testflight-upload-gotchas.md` —
  Apple's silent-failure traps for TestFlight upload
- `~/.swarm/snippets/2026-05-08-minimum-viable-change-discipline.md`
  — when NOT to invoke the council on a small change
- `~/.swarm/reports/2026-05-08-session-report.md` — full prior session
  outcome summary

## Parallel work in another session

A separate session is reconciling the **whatcolor** repo's
server↔local divergence (34 server commits + 12 local commits +
unresolved Contents.json merge conflicts). That work is independent
of Hexmind and lives in `~/.claude/plans/yeah-let-s-doublecheck-…md`.
Mentioned only so context doesn't bleed if both sessions touch
shared concepts (LICENSE, AppIcon, Bridge City Lab LLC entity).
