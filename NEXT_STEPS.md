# Next steps — hexmind

> **Note 2026-05-08:** App renamed from "Hexpand" to "Hexmind." See
> `RENAME_PLAN.md` for the canonical execution plan; that supersedes
> the steps below for the immediate cycle. The body of this doc stays
> as historical context for the App-Store-prep work that wasn't
> rename-related.



Picked up here next session. `main` is at `f945be6`, in sync with origin.
Tag `ios-on-device-firing` records the milestone where Apple Foundation
Models actually generated on-device for the first time (verified in iOS
26.4 simulator trace, 2026-05-08).

## Blocking — Apple Developer portal (~5 min)

Build is failing at signing because Xcode auto-created the App ID but
left it with zero capabilities. At [developer.apple.com/account/resources/identifiers/list](https://developer.apple.com/account/resources/identifiers/list):

1. **`dev.dreamer.hexpand`** — click the row → enable:
   - [ ] Associated Domains (covers all 6 brand domains)

(No App Group needed — the entitlements file claims none.)

## Blocking — App Store Connect record (~3 min)

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps
→ blue **+** → New App.
- Platform: iOS
- Name: `Hexpand`
- Primary language: English (U.S.)
- Bundle ID: select `dev.dreamer.hexpand`
- SKU: `hexpand-ios`
- User Access: Full

> Heads-up: `dev.dreamer.*` is an unconventional bundle prefix. Apple
> doesn't enforce that the prefix maps to a domain you own, so it'll
> register fine — but if you want this on the App Store under Bridge
> City Lab LLC, a prefix matching a domain you control reads better.
> Switching is one diff (`appId` in `capacitor.config.ts` +
> `PRODUCT_BUNDLE_IDENTIFIER` in `ios/App/App.xcodeproj/project.pbxproj`)
> + a new App ID registration. Cheap if done before TestFlight, painful
> after.

## Hardware verification of Apple Intelligence

The on-device path is verified on the **iOS 26.4 simulator** but not yet
on real hardware. Codex's /consensus call flagged simulator behavior as
"more fragile than hardware" — `.available == true` on simulator does
not guarantee the same path executes on a Pro device.

After TestFlight install:

- [ ] On an Apple-Intelligence-eligible iPhone (15 Pro / 16+ / iPad with
  M-series), with Apple Intelligence enabled in Settings, tap a tile
  with empty neighbors
- [ ] Watch for the green "✦ Apple Intelligence — Generated on-device"
  toast (`useAIGeneration.ts:443` and `HexpandApp.tsx:540` paths both
  set this)
- [ ] In Xcode console, confirm `⚡️ To Native -> FoundationModels generate`
  fires on tap (the bridge event that was missing pre-fix)
- [ ] 10 consecutive tile expansions on real device should fire the
  success toast with no cloud fallback (cloud fallback is still desired
  on parse failure / timeout; should not fire on a healthy Pro device
  with a healthy prompt)

## Pre-TestFlight cleanup (single commit, recommended)

These were flagged in Xcode console traces all session. Not blocking but
shipping with them is messy:

- [ ] **`UIScene` lifecycle adoption** — Apple deprecation, "will assert
  in a future release." Add `UIApplicationSceneManifest` to
  `ios/App/App/Info.plist`, adopt `SceneDelegate`. Capacitor 8 should
  have a template; check their docs.
- [ ] **NSLayoutConstraint width=0 conflicts on `_UIModernBarButton`** —
  three nav/toolbar buttons with no intrinsic content. Cosmetic but
  ugly (3× per launch). Fix: give the offending `UIBarButtonItem`s an
  SF Symbol image at init.
- [ ] **WKWebView pull-to-refresh / overscroll bounce** — gemini flagged
  during the random UX consensus. One-line fix in `AppViewController.swift`:
  ```swift
  webView?.scrollView.bounces = false
  ```
  inside `capacitorDidLoad()` after `super.capacitorDidLoad()`. Prevents
  accidental drag-down-to-refresh during expand-cascade animations.

## Phase 3 polish (separate plan, post-TestFlight)

The basic generate path is verified; these are quality-of-life upgrades:

- [ ] **Streaming via `streamResponse(to:)`** — instead of waiting 1-3s
  for the full FM response, stream partial branches as they generate.
  Big perceived-latency win. Apple's API: `session.streamResponse(to:)`
  returns an `AsyncSequence` of partials. Need a new `streamGenerate`
  method on the Swift plugin + `notifyListeners` plumbing back to JS.
  See `~/.swarm/snippets/2026-05-08-foundationmodels-bridge-bisect.md`
  for the API surface.
- [ ] **`@Generable` Swift struct for branches** — replaces JSON-text
  round-trip + `parseBranches` regex fallback with structured output.
  Eliminates a class of failure modes ("FM ran but output didn't
  parse"). Requires defining the schema in Swift; minor refactor.
- [ ] **`prewarm(promptPrefix:)` on app boot** — pre-loads the model so
  the first generation is instant instead of cold-start latent. Apple's
  framework has `LanguageModelSession.prewarm`; call it in
  `AppViewController.capacitorDidLoad`.
- [ ] **Provider-aware dispatcher** — `useProviderSettings.ts` exposes
  a user-selectable provider; the dispatcher in `useAIGeneration.ts`
  doesn't consult it (always tries FM first). If user explicitly picks
  a cloud provider, should skip FM. One-day refactor.

## Hygiene — remote stale branch

`feat/round-0-1-ports` is at `ec642e0` on origin, fully merged into
main as of `af09842`. Local copy already deleted. Remote delete is
destructive so requires explicit go:

```sh
git push origin --delete feat/round-0-1-ports
```

## App Store review notes (already drafted)

When submitting after TestFlight, the 4.2 review notes paragraph from
the original `IOS_PORT_PLAN.md`-style framing should be in the app's
review notes field:

> Hexpand is a hexagonal mind-mapping tool. The core canvas, gesture
> handling, native settings, share extension, and on-device LLM
> integration are implemented natively in Swift / Capacitor. Apple
> Foundation Models handles brainstorm generation on supported
> hardware (iPhone 15 Pro+ / iPad M-series with Apple Intelligence
> enabled), with cloud fallback for older devices. Universal Links
> from hivemind.cx and 5 sister domains open the app via the
> committed AASA file.

Adjust to match current state once verified on hardware.

## Reference

- `~/.swarm/snippets/2026-05-08-foundationmodels-bridge-bisect.md` — six
  reusable patterns from this session including the dual-layer timeout,
  shadowing-dispatcher diagnosis, /team:technical right-sizing
- `~/.swarm/snippets/2026-05-08-capacitor-ios-gotchas.md` — earlier
  session's harvest with 9 patterns (plugin registration, safe-area,
  visualViewport keyboard, etc.)
- `~/.swarm/reports/2026-05-08-session-report.md` — full session
  outcome summary
- `~/.swarm/next-steps/2026-05-08-whatcolor-hexpand-testflight.md` —
  cross-repo next steps
