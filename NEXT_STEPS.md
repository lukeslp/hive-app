# Next steps — Idea Tiles

_Product name **Idea Tiles** (live on the App Store). **Canonical web / marketing origin:** `https://ideatiles.app` (Porkbun). Bundle id stays `app.hexmind.ios`; legacy brand domains (`hexmind.app`, `hivemind.cx`, …) still route to the same deployment until retired._

**Canonical rollout (repo):** [`docs/infra/IDEATILES_DOMAIN.md`](docs/infra/IDEATILES_DOMAIN.md) · verify: `pnpm verify:canonical` · device gates: [`docs/DEVICE_RELEASE_GATES.md`](docs/DEVICE_RELEASE_GATES.md) · ASC URLs: [`docs/APP_STORE_CONNECT_CANONICAL.md`](docs/APP_STORE_CONNECT_CANONICAL.md).

## 2026-05-12 — MVP release alignment (docs + sharing)

- **Release docs** (canonical): [`docs/RELEASE_SPEC.md`](docs/RELEASE_SPEC.md), [`docs/RELEASE_REVIEW.md`](docs/RELEASE_REVIEW.md), [`docs/APP_STORE_PACK.md`](docs/APP_STORE_PACK.md), [`docs/SHARING_MVP_POLICY.md`](docs/SHARING_MVP_POLICY.md).
- **Sharing policy:** iOS = snapshot `?s=` links only (public https origin via `getPublicWebAppOrigin()` / optional `VITE_PUBLIC_WEB_APP_URL`). Live **Collaborate** remains **web-only** this release (`HexmindApp.tsx` gates toolbar + modal).
- **Code:** `useSessionManagement.generateShareUrl` no longer uses `capacitor://` for shared links; `ShareModal` copy matches server-backed snapshots.

Public TestFlight is already live — treat remaining items as **App Store submission** and **accuracy** (metadata, privacy questionnaire, AASA if using Universal Links), not “ship TF for the first time.”

## 2026-05-12 doc sync + `/team` cleanup

- Added `README.md` to provide an up-to-date project overview, architecture map, and run commands.
- Added `PROJECT_PLAN.md` as the canonical priorities/workstreams snapshot.
- Clarified council usage so `/team` is reserved for strategic decisions rather than routine implementation.
- Planning docs are now split by purpose:
  - `PROJECT_PLAN.md` = strategy and priorities
  - `NEXT_STEPS.md` = immediate operational checklist
  - `todo.md` = historical implementation log

### `/team` usage rule of thumb

- Use `/team --full` only for major go/no-go or positioning decisions.
- Use `/team:technical` for architecture and rollout-risk checks.
- Use `/team:research` when you need facts only.
- Avoid council runs for small code changes where direct implementation + verification is faster and clearer.

> Pickup point as of 2026-05-10 EOD. Today's session landed `prewarm`,
> the WKWebView bounce fix, the AASA smoke-test script, the one-shot
> onboarding modal + passive canvas hint, Capacitor-native PNG/SVG/JSON
> exports, mobile-overflow declutter with three labeled sections, the
> tile-flash UX that replaces on-device success toasts, and the static
> Privacy Policy + Terms of Use pages at ideatiles.app/privacy and
> /terms (also at legacy brand domains) with Express routes that beat
> the SPA catchall.
>
> See `~/.claude/plans/get-context-doubt-and-partitioned-pascal.md`
> for the doubt-pass that reframed the council's "starter tile" as
> wrong-problem in favor of fixing the modal-trap and adding a
> passive empty-canvas affordance.

## What landed today (this session, on top of `c490190`)

- **`25afbb5` iOS boot:** `prewarm()` warms Apple Intelligence on
  app launch; `scrollView.bounces = false` kills accidental
  pull-to-refresh during expand-cascade
- **`08c1bcb` ops:** `scripts/check-aasa.sh` smoke-tests all brand
  domains; currently fails 6/6 because the deployed server still
  serves SPA HTML at `/.well-known/...` (redeploy still pending)
- **`a79b5fc` ux:** one-shot onboarding modal (`dismissedOnboardingRef`)
  + passive "Tap anywhere to start a brainstorm" hint, `prefers-reduced-motion`
  shortens the 600ms timer to 100ms
- **`6e0cce3` fix:** PNG/SVG/JSON exports now go through `saveBlob()`
  helper — `@capacitor/filesystem` + `@capacitor/share` on iOS,
  `<a download>` on web. Plus Info.plist keys for Files.app visibility
  and Photos save permission
- **`3566329` ux:** mobile overflow dropped Search + Key Themes
  (duplicate affordances) and grouped remaining 6 items into
  Image / Sessions / Share labeled sections
- **`573775d` legal:** static `privacy.html` + `terms.html` in
  `client/public/`, served by Express `/privacy` and `/terms` routes
  *before* the SPA catchall. Required for App Store Connect's
  Privacy Policy URL field

## What's still on you (in order)

### Path to public TestFlight

1. **Verify `@Generable` compiles** — Open Xcode → "Any iOS Device
   (arm64)" → Cmd-B. If it fails, fix is an explicit
   `init(from decoder:)` on `GeneratedBranch` in
   `ios/App/App/FoundationModelsPlugin.swift`.
2. **Server redeploy** — command in the "Right now" section below.
   After redeploy, run `./scripts/check-aasa.sh` (expect 7/7 ✓) and
   `curl -s https://ideatiles.app/privacy | head -5` (expect HTML
   starting `<!doctype html>` with title "Idea Tiles — Privacy Policy",
   NOT the SPA). Same check on `https://hexmind.app/privacy` if that
   domain still proxies to this build.
3. **Hardware run** — plug iPhone in, Cmd-R. Watch console for
   `prewarm` path. Tap a tile — first-tap cold-start should be 1-2s
   (kill criterion: >5s).
4. **Test exports on hardware** — tap Export PNG → iOS share sheet
   appears → AirDrop to another device → file arrives. Also: open
   Files.app → "On My iPhone → Idea Tiles" → exported PNG present at
   2000×2000.
5. **App Store Connect — App Information** (one-time):
   - Privacy Policy URL: `https://ideatiles.app/privacy`
   - Support URL: `https://ideatiles.app/` (or mailto link)
   - App Category: Productivity
6. **App Store Connect — Privacy nutrition label** (one-time):
   answer "Data Not Collected" for every category. Matches reality
   (no analytics, no Sentry, no tracking SDKs).
7. **Archive in Xcode** — Product → Archive (target: Any iOS Device).
   No Mac Catalyst.
8. **Distribute App** in Organizer → App Store Connect → Upload.
   ~5–30 min processing.
9. **App Store Connect — TestFlight tab**:
   - Internal testers: add yourself, install via TestFlight app,
     run the test plan in step 4 above on real hardware.
   - **For public TestFlight**: external-test group → invite via
     link → "Submit build for beta review" (faster than full App
     Store review, usually ~24h). After approval, generate the
     public link.
10. **Beta App Description** in TestFlight tab — required for
    external testing. Suggested copy:
    > Idea Tiles is a hexagonal mind-mapping tool with on-device AI
    > brainstorming via Apple Intelligence. Tap any hex to generate
    > six related ideas; long-press and drag to merge two into one.
    > Boards save locally — no account required.

11. **What to Test** field — what testers should exercise:
    > • Tap a tile to expand (first tap may take 1–2s)
    > • Long-press + drag to merge two tiles
    > • Export PNG/SVG → check Files.app or share to another device
    > • Open a board on a Mac via Designed-for-iPad

12. **Test Information** — email `luke@lukesteuber.com`.

13. **Beta App Review Information** — flag that the app requires
    Apple Intelligence; if reviewers are on older devices, the
    tile-tap will surface a clear "Apple Intelligence isn't available
    on this device" error rather than crash, but the core flow
    needs an eligible device. Provide a test board JSON if asked.

### Lower priority (defer to v1.0.1 per council)

- UIScene lifecycle migration (warning has been live since iOS 13
  without firing — engineer comfort, not user value)
- iOS 18 icon variants (light/dark/tinted)
- Cold-start streaming (`streamResponse(to:)`) — only after telemetry
  confirms cold-start p50 is acceptable on real hardware
- Class 9 trademark filing — defer 30 days post-launch (TEAS Plus
  needs real product-page specimens, not TestFlight ones)

### Bookkeeping

- Build number must increment for every TestFlight upload.
  Xcode → project settings → "Build" field, or use the auto-increment
  trick in Build Settings (CURRENT_PROJECT_VERSION).
- The duplicate-toast commits in the git history (`aac02be`,
  `7b310ef`, both with the same message as `c3cb9cd`) are the
  artifact of two parallel sessions auto-committing `LAST.mjd`
  and the Capacitor SPM Package.swift. Harmless but ugly.

---

> Original 2026-05-09 doc continues below for the operational details
> (server redeploy command, Xcode upload steps, App Store fields, etc.)
> that haven't changed.

---

## Right now — server redeploy is the only blocker for TestFlight

The AASA file source was edited (`server/_core/index.ts` lines 52, 63
now point at `596T7J7FB6.app.hexmind.ios` instead of the old hexpand
identifier). **The deployed copy at dr.eamer.dev is still serving the
old AASA**, so Universal Links from any brand domain will
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
curl -s https://ideatiles.app/.well-known/apple-app-site-association | \
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
6. App Store Connect → My Apps → Idea Tiles → **TestFlight** tab → add
   internal testers (yourself first)
7. Install via TestFlight app on real iPhone

If you hit the Xcode "support macOS?" prompt during archive: answer
**no Mac Catalyst** (Capacitor 8.3.1's `Capacitor.xcframework` only
ships iOS slices, no Catalyst slice — verified by direct inspection of
the framework's Info.plist). The Designed-for-iPad route is what's
already enabled and works for free on Apple Silicon Macs without code
changes.

## Then — flip Mac availability in App Store Connect (~1 min)

App Store Connect → My Apps → Idea Tiles → **Pricing and Availability**
→ tick **"Make this app available on Mac"**. Same iPad binary lists as
a Mac app for Apple Silicon Macs. Zero rebuild, zero code change.

## Then — App Store name + subtitle confirmation

Locked in (or to lock in) at App Store Connect → My Apps → Idea Tiles →
**App Information**:

- **Name** (30 chars): `Idea Tiles` (10) — or
  `Idea Tiles: Brainstorm` (22) if Apple rejects the bare name.
  Apple
  enforces uniqueness on the full Name string, not the brand root.
- **Subtitle** (30 chars): `Brainstorm with local AI` (24)
- **Primary Category**: Productivity
- **Privacy Policy URL**: `ideatiles.app/privacy` (the route should
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

Ship name is now **Idea Tiles**; adjust TEAS wording and specimens accordingly. The collision notes below still apply to the **hexmind.com** game studio and any legacy “Hexmind” App Store Connect reservations, not the Idea Tiles string.

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

Hook: **"Show HN: Idea Tiles — offline hex mind-maps, no servers, no
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
Class 9; always shipping as **Idea Tiles** to disambiguate.
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

> Idea Tiles is a hexagonal mind-mapping tool. The core canvas, gesture
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
of Idea Tiles and lives in `~/.claude/plans/yeah-let-s-doublecheck-…md`.
Mentioned only so context doesn't bleed if both sessions touch
shared concepts (LICENSE, AppIcon, Bridge City Lab LLC entity).
