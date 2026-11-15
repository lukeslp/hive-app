# iPhone Duo

November 14, 2026. Shipped as iOS 1.4.0 (124). Build 123 was uploaded but not released: the status column covered the inspector.

Store screenshots: `ios/fastlane/screenshots/iphone-duo-outer/`, captured with
`scripts/capture-duo.sh` from a Debug build (the `-IdeaTilesShot` launch argument).

## What changes

On the Duo's inner screen held sideways (book pose, or lying flat sideways):

- **Left page:** the board, with the toolbar and the tile action bar. The action
  bar is kept whole on this page.
- **Right page:** the tile inspector, docked and always present, showing the open
  tile or "Select a tile to see its details here." The minimap sits at its foot.
  Dialogs and notices open on this page.
- **Fold:** the 40 pt band between the pages holds nothing you can tap.

Upright (tabletop) keeps the normal layout; tiles can sit across the fold there
because the board pans. Phone, iPad, Android, the Mac app and ideatiles.app are
unchanged: only the iOS shell provides `window.DuoFold`.

## How

- `ios/App/App/DuoBridge.swift` and `duo-fold.js` are byte-identical copies of
  lukeslp/snippets `mobile-capacitor/duo-bridge` (bridge files as of 19154ce).
  Change them there first. `AppViewController` makes the bridge in
  `capacitorDidLoad()` on `webView.configuration` and refreshes it on layout. A
  bridge made in `webViewConfiguration(for:)` never reaches the page in
  Capacitor 8.
- `client/src/lib/duoSpread.ts`: an active vertical fold, or a sideways inner
  screen lying flat, with both pages at least 360 px. While it holds, `<html>`
  carries `data-tiles-spread` and `--duo-fold-left/right`.
- `HexmindApp.tsx` builds the inspect panel once and places it floating (as
  before) or inside the right-page `aside`; `InspectPanel` gained a `docked`
  variant. The action bar's x is clamped to the left page. `index.css` narrows
  the board and the toolbar, lifts the minimap above the pane, and centers
  dialogs and the toaster on the right page.

## Checks (November 14, 2026)

- `pnpm test` (416, including `duoSpread.test.ts`), `pnpm check`, Prettier on the
  changed files, `scripts/check-apple-versions.mjs`.
- WebKit (Playwright 1.65.1, WebKit 27.2), main vs this branch, with a saved
  eight-tile board opened from the onboarding prompt, idle and with a tile
  selected: at 402 × 874, 466 × 678 (Duo outer, closed), 956 × 440, 951 × 669 with
  no bridge, 1024 × 768 and 1280 × 800, plus the upright inner screen, the
  toolbar, board, inspect panel and minimap are in the same place (14 of 14).
- Simulated sideways inner screen: a hit-test grid across the fold band finds no
  control (before: five tiles, the action bar's buttons and a notice).
- Xcode 27.2 Debug build on an "IdeaTiles Duo 20261114" simulator (folded): it
  launches; a temporary page probe (not committed) read `shim: true`,
  `handler: true` and a closed hinge.

## Not checked

- The real inner screen (the simulator needs a Device Hub click to unfold).
- In the harness, selecting a tile also asks the server for neighbors, which
  fails offline and shows a notice; on the right page in the spread.

## Rollback

Revert the merge commit. No stored data changes.
