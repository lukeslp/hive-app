#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
IDEATILES_REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/mac-release-common.sh"

mode="release"
output_root="$IDEATILES_REPO_ROOT/build/release/direct"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preflight) mode="preflight" ;;
    --archive-only) mode="archive-only" ;;
    --output-dir)
      shift
      [[ $# -gt 0 ]] || release_error "--output-dir requires a path"
      output_root="$1"
      ;;
    --help)
      echo "Usage: $0 [--preflight | --archive-only] [--output-dir PATH]"
      echo "Builds, Developer ID signs, notarizes, staples, verifies, and zips Idea Tiles."
      echo "--archive-only exercises signing/export without contacting the notary service."
      exit 0
      ;;
    *) release_error "unknown option: $1" ;;
  esac
  shift
done

for command in pnpm xcodebuild xcrun codesign security spctl ditto shasum; do
  require_command "$command"
done

cd "$IDEATILES_REPO_ROOT"
pnpm versions:check
require_clean_tree
identity="$(find_developer_id_identity)"

if ! grep -Fq "ENABLE_HARDENED_RUNTIME: true" macos/project.yml; then
  release_error "Mac hardened runtime must remain enabled"
fi
if ! grep -Fq "com.apple.security.app-sandbox" macos/IdeaTiles/IdeaTiles.entitlements; then
  release_error "Mac App Sandbox entitlement is missing"
fi
if ! grep -Fq "com.apple.security.network.client" macos/IdeaTiles/IdeaTiles.entitlements; then
  release_error "Mac outbound network entitlement is missing"
fi

echo "Developer ID identity: $identity"
if [[ -n "${IDEATILES_NOTARY_KEYCHAIN_PROFILE:-}" ]]; then
  echo "Notary Keychain profile: configured explicitly"
else
  echo "Notary Keychain profile: not configured; set IDEATILES_NOTARY_KEYCHAIN_PROFILE for a release"
fi

xcodebuild -list -workspace IdeaTiles.xcworkspace | grep -Eq '^[[:space:]]+IdeaTiles$' \
  || release_error "IdeaTiles Mac scheme is not discoverable from the root workspace"
xcrun notarytool --help >/dev/null

if [[ "$mode" == "preflight" ]]; then
  echo "Direct-distribution preflight passed. No archive, notarization, or upload submission occurred."
  exit 0
fi

if [[ "$mode" == "release" ]]; then
  [[ -n "${IDEATILES_NOTARY_KEYCHAIN_PROFILE:-}" ]] \
    || release_error "refusing to build a direct release without explicit IDEATILES_NOTARY_KEYCHAIN_PROFILE"
fi

stamp="$(release_stamp)"
release_dir="$output_root/IdeaTiles-${IDEATILES_VERSION}-${IDEATILES_BUILD}-$stamp"
archive_path="$release_dir/IdeaTiles.xcarchive"
export_dir="$release_dir/export"
export_options="$release_dir/ExportOptions.plist"
zip_path="$release_dir/IdeaTiles-${IDEATILES_VERSION}-${IDEATILES_BUILD}.zip"
mkdir -p "$release_dir"

archive_args=(
  archive
  -workspace "$IDEATILES_REPO_ROOT/IdeaTiles.xcworkspace"
  -scheme IdeaTiles
  -configuration Release
  -destination "generic/platform=macOS"
  -archivePath "$archive_path"
  DEVELOPMENT_TEAM="$IDEATILES_TEAM_ID"
  CODE_SIGN_STYLE=Automatic
)
export_args=(
  -exportArchive
  -archivePath "$archive_path"
  -exportPath "$export_dir"
  -exportOptionsPlist "$export_options"
)
if [[ "${IDEATILES_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
  archive_args+=(-allowProvisioningUpdates)
  export_args+=(-allowProvisioningUpdates)
fi

xcodebuild "${archive_args[@]}"
cat >"$export_options" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>developer-id</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>$IDEATILES_TEAM_ID</string>
</dict>
</plist>
PLIST
xcodebuild "${export_args[@]}"

app_path="$export_dir/IdeaTiles.app"
verify_release_metadata "$app_path"
codesign --verify --deep --strict --verbose=2 "$app_path"
codesign_details="$(codesign -dvvv "$app_path" 2>&1)"
grep -Fq "Authority=$identity" <<<"$codesign_details" \
  || release_error "exported app is not signed with the selected Developer ID identity"
grep -Eq 'flags=0x[0-9a-f]*10000\(runtime\)' <<<"$codesign_details" \
  || release_error "exported app does not have hardened runtime enabled"

/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$app_path" "$zip_path"
if [[ "$mode" == "archive-only" ]]; then
  shasum -a 256 "$zip_path" >"$zip_path.sha256"
  echo "Developer ID archive/export verification passed: $zip_path"
  echo "This archive was not notarized or stapled and is not a distribution artifact."
  exit 0
fi

xcrun notarytool submit "$zip_path" \
  --keychain-profile "$IDEATILES_NOTARY_KEYCHAIN_PROFILE" \
  --wait
xcrun stapler staple "$app_path"
xcrun stapler validate "$app_path"

rm -f "$zip_path"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$app_path" "$zip_path"
"$SCRIPT_DIR/verify-mac-release.sh" "$app_path"
shasum -a 256 "$zip_path" >"$zip_path.sha256"

echo "Notarized direct-distribution archive: $zip_path"
echo "Checksum: $zip_path.sha256"
