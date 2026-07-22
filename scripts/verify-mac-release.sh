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
