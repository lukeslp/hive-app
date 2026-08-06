#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
IDEATILES_REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/mac-release-common.sh"

unsigned=0
output_root="$IDEATILES_REPO_ROOT/build/release/app-store"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --unsigned) unsigned=1 ;;
    --output-dir)
      shift
      [[ $# -gt 0 ]] || release_error "--output-dir requires a path"
      output_root="$1"
      ;;
    --help)
      echo "Usage: $0 [--unsigned] [--output-dir PATH]"
      echo "Archives the 'Idea Tiles (macOS)' scheme for App Store Connect without uploading it."
      exit 0
      ;;
    *) release_error "unknown option: $1" ;;
  esac
  shift
done

require_command pnpm
require_command xcodebuild
require_command codesign
cd "$IDEATILES_REPO_ROOT"
pnpm versions:check
if [[ "$unsigned" == "0" ]]; then
  require_clean_tree
fi

mkdir -p "$output_root"
archive_path="$output_root/IdeaTiles-${IDEATILES_VERSION}-${IDEATILES_BUILD}-$(release_stamp).xcarchive"
archive_args=(
  archive
  -workspace "$IDEATILES_REPO_ROOT/IdeaTiles.xcworkspace"
  -scheme "Idea Tiles (macOS)"
  -configuration Release
  -destination "generic/platform=macOS"
  -archivePath "$archive_path"
)
if [[ "$unsigned" == "1" ]]; then
  archive_args+=(CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO)
elif [[ "${IDEATILES_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
  archive_args+=(-allowProvisioningUpdates)
fi

xcodebuild "${archive_args[@]}"
app_path="$archive_path/Products/Applications/IdeaTiles.app"
verify_release_metadata "$app_path"
if [[ "$unsigned" == "0" ]]; then
  codesign --verify --deep --strict --verbose=2 "$app_path"
fi

echo "App Store archive ready: $archive_path"
echo "No upload or App Store Connect submission was performed."
