#!/usr/bin/env bash

set -euo pipefail

IDEATILES_TEAM_ID="596T7J7FB6"
IDEATILES_BUNDLE_ID="app.hexmind.ios"
IDEATILES_VERSION="1.1"
IDEATILES_BUILD="2"

release_error() {
  echo "error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || release_error "required command not found: $1"
}

require_clean_tree() {
  local status
  status="$(git -C "$IDEATILES_REPO_ROOT" status --porcelain --untracked-files=normal)"
  if [[ -n "$status" ]]; then
    echo "$status" >&2
    release_error "release commands require a clean working tree"
  fi
}

verify_release_metadata() {
  local app_path="$1"
  local plist="$app_path/Contents/Info.plist"
  [[ -f "$plist" ]] || release_error "missing archived Info.plist: $plist"

  local bundle version build
  bundle="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
  build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")"
  [[ "$bundle" == "$IDEATILES_BUNDLE_ID" ]] || release_error "archive bundle is $bundle, expected $IDEATILES_BUNDLE_ID"
  [[ "$version" == "$IDEATILES_VERSION" ]] || release_error "archive version is $version, expected $IDEATILES_VERSION"
  [[ "$build" == "$IDEATILES_BUILD" ]] || release_error "archive build is $build, expected $IDEATILES_BUILD"
}

find_developer_id_identity() {
  local configured="${IDEATILES_DEVELOPER_IDENTITY:-}"
  if [[ -n "$configured" ]]; then
    security find-identity -v -p codesigning | grep -Fq "\"$configured\"" \
      || release_error "configured Developer ID identity is not installed"
    printf '%s\n' "$configured"
    return
  fi

  local matches count
  matches="$(security find-identity -v -p codesigning | sed -n "/Developer ID Application: .*(${IDEATILES_TEAM_ID})/p")"
  count="$(printf '%s\n' "$matches" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
  [[ "$count" == "1" ]] || release_error "expected exactly one Developer ID Application identity for team $IDEATILES_TEAM_ID; found $count"
  printf '%s\n' "$matches" | sed -E 's/^[^"]*"([^"]+)".*$/\1/'
}

release_stamp() {
  date -u '+%Y%m%dT%H%M%SZ'
}
