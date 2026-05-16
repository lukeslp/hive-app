# Migration plan — UIScene lifecycle + UX duplicate cleanup

> Captured 2026-05-09 after parallel /consensus + scope-recon + UX-recon.
> Intended for /hitit execution. Two independent strands; the UIScene work
> ships first because it's blocking-eventually-required, the UX cleanup is
> a polish pass that can land in the same session.

## Strand A — UIScene lifecycle adoption

### Why now

Xcode console on iOS 26 prints on every launch:

> `UIScene` lifecycle will soon be required. Failure to adopt will result
> in an assert in the future.

Current setup is legacy `@UIApplicationMain` AppDelegate-only with no
SceneDelegate. The warning will become a hard assert in a near-future iOS
SDK. Time to adopt.

### Consensus (gemini + codex, both ran successfully)

Both models converge on the same architecture. Capacitor 8 is bridge-
lifecycle agnostic — the migration is pure Apple-side plumbing.

**Agreed:**

- Keep `Main.storyboard` and keep `AppViewController` as the
  `customClass="AppViewController"`. The bridge VC's `capacitorDidLoad()`
  fires the same way under either lifecycle, so `FoundationModelsPlugin`
  registration is unaffected.
- `SceneDelegate` owns `UIWindow`. `AppDelegate` keeps `var window` removed
  but stays for app-level (non-UI) lifecycle, app launch, scene config.
- URL handling and Universal Link routing **move to** `SceneDelegate`.
  Capacitor's `ApplicationDelegateProxy` does NOT auto-intercept scene
  callbacks — every scene method that wants to hand off to Capacitor must
  call the proxy manually.
- Add `UIApplicationSceneManifest` to `Info.plist`. **Remove**
  `UIMainStoryboardFile` once the manifest is in — leaving both creates
  split ownership and could fire `capacitorDidLoad()` twice.

**Codex-only nuance worth keeping:**

- In `scene(_:willConnectTo:options:)` for cold launches, forward both
  `connectionOptions.urlContexts` AND `connectionOptions.userActivities`
  (gemini missed urlContexts).
- Defer the cold-launch forward one main-queue turn (`DispatchQueue.main
.async {}`) so the bridge VC is alive before the link dispatches.
  Without this, the very first deep link silently drops.

### Files in scope (4 modified, 1 new)

| File                                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ios/App/App/AppDelegate.swift`         | Remove `var window`, remove the 5 empty boilerplate lifecycle methods. Keep `application(_:open:options:)` and `application(_:continue:restorationHandler:)` as fallbacks for code paths Apple still routes through AppDelegate. Add `application(_:configurationForConnecting:options:)` returning a `UISceneConfiguration` keyed by name "Default Configuration". Add `application(_:didDiscardSceneSessions:)` no-op. |
| `ios/App/App/Info.plist`                | Add `UIApplicationSceneManifest` dict: `UIApplicationSupportsMultipleScenes=false`, one `UISceneConfiguration` under role `UIWindowSceneSessionRoleApplication` with name "Default Configuration", `UISceneDelegateClassName=$(PRODUCT_MODULE_NAME).SceneDelegate`, `UISceneStoryboardFile=Main`. **Remove `UIMainStoryboardFile`.**                                                                                     |
| `ios/App/App/SceneDelegate.swift`       | NEW. `UIResponder, UIWindowSceneDelegate`. Implement `scene(_:willConnectTo:options:)` (handle cold-start urlContexts + userActivities, deferred), `scene(_:openURLContexts:)`, `scene(_:continue:)`. Each forwards into `ApplicationDelegateProxy.shared.application(...)`. Do NOT touch the window — let the storyboard own it. Do NOT register plugins here — keep that in `AppViewController.capacitorDidLoad()`.    |
| `ios/App/App.xcodeproj/project.pbxproj` | Add `SceneDelegate.swift` PBXBuildFile + PBXFileReference. Add to App target's compile sources.                                                                                                                                                                                                                                                                                                                          |

### Reference: stash@{0}

Stash from a prior attempt is largely valid as a structural reference but
its `FoundationModelsPlugin.swift` modifications are stale — the plugin
has been heavily rewritten since (timeout race, ANE error handling, the
12s→20s bump). **Do not pop the stash.** Re-derive SceneDelegate.swift
from the consensus pattern; ignore the stash's plugin changes entirely.
The AppDelegate/Info.plist/pbxproj changes in the stash are ~95% what we'd
write anyway and can be used as a sanity check after the fact.

### Risks specific to this app

1. **`appUrlOpen` contract on the JS side.** `client/src/main.tsx` listens
   for `App.addListener("appUrlOpen", …)`. That event fires from
   `ApplicationDelegateProxy`. If the SceneDelegate forwards to the proxy
   correctly, JS sees no change. **Verification:** after migration, tap a
   `hexmind://…` link in Notes → app should open and route exactly as
   today. (Universal Links via the AASA file need server redeploy first
   per `NEXT_STEPS.md`, so test custom-scheme links instead.)
2. **`SplashScreen` plugin timing.** `launchAutoHide: false` relies on
   `SplashScreen.hide()` being called from JS after first React paint.
   Scene lifecycle doesn't reorder bridge init; the splash should hide at
   the same point. **Verification:** cold launch should still show the
   splash → React mount → fade, no blank screen.
3. **Double instantiation of `AppViewController`.** If both
   `UIMainStoryboardFile` AND `UIApplicationSceneManifest` are set, the VC
   could be instantiated twice → `capacitorDidLoad()` runs twice → plugin
   registered twice. **Mitigation:** the plan removes `UIMainStoryboardFile`
   in the same edit as adding the manifest. Don't split into two commits.
4. **Cold-start link drop.** Without the codex-flagged deferred forward in
   `scene(_:willConnectTo:options:)`, the very first link tap from a cold
   launch lands before the bridge VC exists. **Mitigation:** wrap the
   forward in `DispatchQueue.main.async { }`.

### Execution order (Strand A)

1. Write `SceneDelegate.swift`.
2. Edit `AppDelegate.swift` (trim + add scene config method).
3. Edit `Info.plist` (add manifest, remove UIMainStoryboardFile).
4. Edit `project.pbxproj` to add SceneDelegate.swift to the target.
5. `npx cap sync ios` (no-op for plugin manifest, but cheap).
6. Build in Xcode, verify launch.
7. Verify a custom-scheme deep link opens the app + routes to the right
   screen. The console warning should be gone.
8. Single commit: `feat(ios): adopt UIScene lifecycle, defer cold-start
link forward`.

---

## Strand B — Toolbar duplicate cleanup

### What's actually duplicated

User reported "two download buttons on tablet." Confirmed:

On tablet (`sm:` ≥ 640px, includes all iPads), the desktop toolbar shows
**two adjacent Download icon buttons** with no labels:

| File:Line                                   | What                                                      | Trigger                      |
| ------------------------------------------- | --------------------------------------------------------- | ---------------------------- |
| `client/src/components/Toolbar.tsx:188-198` | Hover dropdown — Download icon, opens menu with PNG + SVG | `onExportPNG`, `onExportSVG` |
| `client/src/components/Toolbar.tsx:252-258` | Standalone Download icon button                           | `onExportSession` (JSON)     |

A user staring at the tablet toolbar can't tell which is which without
hovering — both are just a download arrow icon. This is the actual UX
smell.

The mobile menu (`sm:hidden`, lines 290-376) has labeled "Export PNG",
"Export SVG", "Export JSON" — that's NOT a duplicate, it's a different
viewport's UI.

### Decision: consolidate into ONE export menu

> Constraint from user: "make no aesthetic changes." So no new component,
> no restyling, no icon swap. Use the existing pattern.

The hover dropdown at line 175-200 already exists and is the right shape.
**Add a third menu item ("JSON") to the dropdown, then delete the
standalone JSON button (lines 252-258).** Result:

- Tablet: ONE Download icon → hover/tap opens menu with PNG / SVG / JSON
- Phone: existing mobile menu unchanged (already shows all three labeled)
- Code: `onExportSession` is wired to the new dropdown item the same way
  PNG and SVG are.

This is purely a structural dedupe; nothing changes visually beyond "one
button instead of two adjacent identical-looking buttons."

### Out of scope (separate work, flag only)

- **Mobile capability gap.** `Toolbar.tsx:497` minimap toggle is
  `hidden sm:block` — phone users can't toggle the minimap at all. NOT a
  duplicate, but a missing capability on phones. Flag for a future
  decision; don't fix in this pass.
- **Mobile overflow menu shape.** It works. The labels make sense on
  phone. Not a dedupe target.

### Execution order (Strand B)

1. Edit `client/src/components/Toolbar.tsx`:
   - In the hover dropdown around lines 188-198, add a third `<button>`
     for `onExportSession` labeled "JSON".
   - Delete lines 252-258 (the standalone Export JSON button) and its
     enclosing tooltip wrapper.
2. `pnpm check` — type check.
3. `pnpm test` — verify no test references the deleted button.
4. `pnpm build && npx cap sync ios` for the iOS bundle.
5. Single commit: `ui(toolbar): consolidate three Export buttons into one
dropdown — fixes duplicate Download icons on tablet`.

---

## Combined verification after both strands

1. `pnpm check` clean.
2. `pnpm test` 68/68 pass.
3. `pnpm build` clean.
4. `npx cap sync ios` clean.
5. Xcode rebuild → launch on simulator:
   - No `UIScene` deprecation warning in console.
   - Splash → React mount → fade, no blank screen.
   - Toolbar shows ONE Download icon on iPad simulator (sm+).
   - Toolbar shows the hamburger overflow menu on iPhone simulator.
6. Tap a `hexmind://test` link in Notes (cold launch) — app should open
   and route correctly.

## What we're explicitly NOT doing in this round

- Re-applying the FoundationModels concurrency gate from stash@{0}. Plugin
  has been rewritten; gate may not be needed. Separate decision.
- Touching the mobile capability gap on the minimap toggle.
- Restyling anything. No new icons, no spacing tweaks, no color changes.
- Renaming the Xcode target/project from "App". Cosmetic only.
- Filing the Class 9 trademark (still on `NEXT_STEPS.md`, not blocking).
