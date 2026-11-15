#!/bin/bash
# Store screenshots of Idea Tiles on the iPhone Duo simulator, outer or inner screen.
#
#   scripts/capture-duo.sh <udid> <outer|inner> <outdir> [path/to/hexmind.app]
#
# Needs a Debug build whose web payload was built with the showcase hook: the
# scenes come from the Debug-only `-IdeaTilesShot <scene>` launch argument
# (AppViewController.swift, #if DEBUG) and VITE_IDEATILES_SHOWCASE_HOOK=1
# (client/src/lib/appStoreShowcase.ts), so no taps are needed. A Release build
# ignores the argument, never logs the scene, and the script refuses its shots.
#
#   outer  folded Duo, `simctl io --display=1 --mask=ignored`, 1398x2034
#   inner  unfolded Duo (Device Hub), `--display=LCD-1`, 2007x2853 portrait or
#          2853x2007 landscape (hold the book pose for the Duo layout)
#
# Shots: 01-canvas.png, 02-tile-detail.png, 03-themes.png. Each one is refused
# when it is the wrong size, black, a blank white page (not painted yet), or when the app did not log
# the scene. Kept shots are flattened to opaque RGB, as App Store Connect wants.
# Build the app with:
#   pnpm install && VITE_IDEATILES_SHOWCASE_HOOK=1 pnpm build && pnpm exec cap sync ios
#   cd ios/App && xcodebuild -project IdeaTiles.xcodeproj -scheme "Idea Tiles (iOS)" \
#     -configuration Debug -destination "id=<udid>" -derivedDataPath /tmp/idea-dd \
#     CODE_SIGNING_ALLOWED=NO IDEATILES_SKIP_CAP_SYNC=1 build
#   # App: /tmp/idea-dd/Build/Products/Debug-iphonesimulator/hexmind.app
# Then `git checkout`-clean: rebuild the payload WITHOUT the variable before any release.
#
# Env: IDEATILES_SCENES (default "canvas detail themes"), IDEATILES_TIMEOUT seconds
# per scene (default 150; the first paint after a launch takes about 20 s).
set -uo pipefail
usage() { echo "usage: $0 <udid> <outer|inner> <outdir> [path/to/hexmind.app]" >&2; exit 2; }
[ $# -ge 3 ] || usage
UDID=$1; SCREEN=$2; OUT=$3; APP=${4:-}
BUNDLE=app.hexmind.ios
SCENES=${IDEATILES_SCENES:-canvas detail themes}
TIMEOUT=${IDEATILES_TIMEOUT:-150}
case "$SCREEN" in
  outer) DISPLAY_ARG=1;     SIZES="1398x2034" ;;
  inner) DISPLAY_ARG=LCD-1; SIZES="2007x2853 2853x2007" ;;
  *) usage ;;
esac
command -v magick >/dev/null || { echo "needs ImageMagick 7 (magick)" >&2; exit 1; }
fail() { echo "REFUSED: $*" >&2; exit 1; }

xcrun simctl list devices | grep -q "($UDID) (Booted)" || fail "simulator $UDID is not booted"
if [ "$SCREEN" = inner ]; then
  # Unfolded = LCD-1 active. If devicectl can't tell, the black check below still guards.
  if info=$(xcrun devicectl device info displays --device "$UDID" 2>/dev/null); then
    echo "$info" | awk '/LCD-1/{f=1} f&&/ active:/{print; exit}' | grep -q "active: true" \
      || fail "inner display LCD-1 is not active: unfold the Duo in Device Hub first"
  fi
fi

if [ -n "$APP" ]; then
  id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist" 2>/dev/null)
  [ "$id" = "$BUNDLE" ] || fail "$APP is not $BUNDLE (got '$id')"
  xcrun simctl install "$UDID" "$APP" || fail "install failed"
fi

mkdir -p "$OUT"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/idea-duo.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

shot() { xcrun simctl io "$UDID" screenshot --display="$DISPLAY_ARG" --mask=ignored "$1" >/dev/null 2>&1; }
# Size, then mean and spread of the color channels (alpha off: an opaque black
# RGBA frame would otherwise read as mean 0.25).
stats() { magick "$1" -alpha off -format '%w %h %[fx:mean] %[fx:standard_deviation]' info: 2>/dev/null; }
# The hook logs "IdeaTilesShot: <scene>" through NSLog; read it back from the unified log.
logged() {
  xcrun simctl spawn "$UDID" log show --start "$1" --style compact \
    --predicate "process == \"hexmind\" AND eventMessage CONTAINS \"IdeaTilesShot: $2\"" 2>/dev/null \
    | grep -q "IdeaTilesShot: $2"
}

n=0
for scene in $SCENES; do
  n=$((n + 1))
  case "$scene" in
    canvas) name=01-canvas ;;
    detail) name=02-tile-detail ;;
    themes) name=03-themes ;;
    *) fail "unknown scene '$scene' (canvas, detail, themes)" ;;
  esac
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1
  start=$(date '+%Y-%m-%d %H:%M:%S')
  xcrun simctl launch "$UDID" "$BUNDLE" -IdeaTilesShot "$scene" >/dev/null \
    || fail "launch failed for $scene"
  # Wait until the screen has painted and holds still for two frames.
  prev=""; ok=""; t0=$SECONDS
  while [ $((SECONDS - t0)) -lt "$TIMEOUT" ]; do
    sleep 2
    cur="$WORK/$scene-$((SECONDS)).png"
    shot "$cur" || continue
    read -r w h mean sd <<<"$(stats "$cur")"
    if awk -v s="$sd" 'BEGIN{exit !(s > 0.06)}' && [ -n "$prev" ] \
       && [ "$(magick compare -metric AE "$prev" "$cur" null: 2>&1 | cut -d' ' -f1)" = "0" ]; then
      ok=$cur; break
    fi
    prev=$cur
  done
  logged "$start" "$scene" \
    || fail "$scene: the app never logged 'IdeaTilesShot: $scene' (a Release build, or the hook is gone)"
  [ -n "$ok" ] || fail "$scene: no steady, painted screen within ${TIMEOUT}s (last: ${w:-?}x${h:-?} mean ${mean:-?} sd ${sd:-?})"
  read -r w h mean sd <<<"$(stats "$ok")"
  echo " $SIZES " | grep -q " ${w}x${h} " || fail "$scene: ${w}x${h}, expected one of: $SIZES"
  awk -v m="$mean" 'BEGIN{exit !(m > 0.005)}' || fail "$scene: black screen (mean $mean)"
  # Opaque 8-bit RGB (color-type 2): ImageMagick would otherwise write a
  # black-and-white frame as grayscale.
  magick "$ok" -background white -alpha remove -alpha off -define png:color-type=2 "$OUT/$name.png" \
    || fail "flatten failed"
  ch=$(magick identify -format '%[channels]' "$OUT/$name.png")
  [ "${ch%% *}" = srgb ] || fail "$scene: expected opaque sRGB after flattening, got '$ch'"
  printf '%s  %sx%s  mean %.3f  sd %.3f  %s\n' "$OUT/$name.png" "$w" "$h" "$mean" "$sd" "$ch"
done
xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1
echo "ok: $n $SCREEN shots in $OUT"
