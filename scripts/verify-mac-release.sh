#!/usr/bin/env bash

set -euo pipefail

[[ $# -eq 1 ]] || {
  echo "Usage: $0 /path/to/IdeaTiles.app" >&2
  exit 2
}

app_path="$1"
[[ -d "$app_path" ]] || {
  echo "error: app bundle not found: $app_path" >&2
  exit 1
}

codesign --verify --deep --strict --verbose=2 "$app_path"
xcrun stapler validate "$app_path"
spctl --assess --type execute --verbose=4 "$app_path"

staging_root="$(mktemp -d "${TMPDIR:-/tmp}/ideatiles-release.XXXXXX")"
pid=""
cleanup() {
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$staging_root"
}
trap cleanup EXIT INT TERM

staged_app="$staging_root/IdeaTiles.app"
/usr/bin/ditto "$app_path" "$staged_app"
log_path="$staging_root/launch.log"
"$staged_app/Contents/MacOS/IdeaTiles" >"$log_path" 2>&1 &
pid=$!

for _ in 1 2 3 4 5 6; do
  sleep 0.5
  if ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid" || {
      echo "error: staged Idea Tiles launch failed" >&2
      sed -n '1,120p' "$log_path" >&2
      exit 1
    }
    echo "Staged Idea Tiles process launched and exited cleanly."
    exit 0
  fi
done

echo "Staged Idea Tiles process remained healthy for three seconds."
