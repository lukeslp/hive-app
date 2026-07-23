#!/usr/bin/env bash

set -euo pipefail

IDEATILES_TEAM_ID="596T7J7FB6"
IDEATILES_BUNDLE_ID="app.hexmind.ios"
IDEATILES_VERSION="1.3"
IDEATILES_BUILD="3"

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
  local privacy_manifest="$app_path/Contents/Resources/PrivacyInfo.xcprivacy"
  local app_icon="$app_path/Contents/Resources/AppIcon.icns"
  local web_app="$app_path/Contents/Resources/WebApp"
  [[ -f "$plist" ]] || release_error "missing archived Info.plist: $plist"
  [[ -f "$privacy_manifest" ]] || release_error "missing bundled privacy manifest: $privacy_manifest"
  [[ -s "$app_icon" ]] || release_error "missing bundled app icon: $app_icon"
  [[ -d "$web_app" ]] || release_error "missing bundled Mac web app: $web_app"
  if LC_ALL=C grep -RIqE 'sourceMappingURL=data:|/Users/' "$web_app"; then
    release_error "bundled Mac web app contains inline source maps or local user paths"
  fi

  local bundle version build local_networking
  bundle="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")"
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")"
  build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")"
  local_networking="$(/usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsLocalNetworking' "$plist")"
  [[ "$bundle" == "$IDEATILES_BUNDLE_ID" ]] || release_error "archive bundle is $bundle, expected $IDEATILES_BUNDLE_ID"
  [[ "$version" == "$IDEATILES_VERSION" ]] || release_error "archive version is $version, expected $IDEATILES_VERSION"
  [[ "$build" == "$IDEATILES_BUILD" ]] || release_error "archive build is $build, expected $IDEATILES_BUILD"
  [[ "$local_networking" == "true" ]] || release_error "NSAllowsLocalNetworking must be enabled for loopback providers"
  if /usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsArbitraryLoads' "$plist" >/dev/null 2>&1; then
    release_error "archive must not allow arbitrary network loads"
  fi

  local tracking accessed_category reason
  tracking="$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyTracking' "$privacy_manifest")"
  accessed_category="$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPIType' "$privacy_manifest")"
  reason="$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyAccessedAPITypes:0:NSPrivacyAccessedAPITypeReasons:0' "$privacy_manifest")"
  [[ "$tracking" == "false" ]] || release_error "privacy manifest must declare tracking false"
  [[ "$accessed_category" == "NSPrivacyAccessedAPICategoryUserDefaults" ]] \
    || release_error "privacy manifest is missing the UserDefaults category"
  [[ "$reason" == "CA92.1" ]] || release_error "privacy manifest has the wrong UserDefaults reason"

  local collected_types=(
    NSPrivacyCollectedDataTypeName
    NSPrivacyCollectedDataTypeEmailAddress
    NSPrivacyCollectedDataTypeUserID
    NSPrivacyCollectedDataTypeOtherUserContent
  )
  local index collected_type linked collected_tracking purpose
  for index in "${!collected_types[@]}"; do
    collected_type="$(/usr/libexec/PlistBuddy -c "Print :NSPrivacyCollectedDataTypes:$index:NSPrivacyCollectedDataType" "$privacy_manifest")"
    linked="$(/usr/libexec/PlistBuddy -c "Print :NSPrivacyCollectedDataTypes:$index:NSPrivacyCollectedDataTypeLinked" "$privacy_manifest")"
    collected_tracking="$(/usr/libexec/PlistBuddy -c "Print :NSPrivacyCollectedDataTypes:$index:NSPrivacyCollectedDataTypeTracking" "$privacy_manifest")"
    purpose="$(/usr/libexec/PlistBuddy -c "Print :NSPrivacyCollectedDataTypes:$index:NSPrivacyCollectedDataTypePurposes:0" "$privacy_manifest")"
    [[ "$collected_type" == "${collected_types[$index]}" ]] || release_error "privacy manifest collected-data types are incomplete or out of order"
    [[ "$linked" == "true" ]] || release_error "privacy manifest collected data must be linked to the user"
    [[ "$collected_tracking" == "false" ]] || release_error "privacy manifest collected data must not be used for tracking"
    [[ "$purpose" == "NSPrivacyCollectedDataTypePurposeAppFunctionality" ]] || release_error "privacy manifest collected data must be limited to app functionality"
  done
  if /usr/libexec/PlistBuddy -c 'Print :NSPrivacyCollectedDataTypes:4' "$privacy_manifest" >/dev/null 2>&1; then
    release_error "privacy manifest contains an unexpected collected-data declaration"
  fi
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
