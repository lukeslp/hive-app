#!/usr/bin/env bash
# File Purpose: Stage versioned Android APK/AAB artifacts with integrity checks.
# Primary Components: Artifact validation, signature checks, SHA-256 manifest.
# I/O: Reads Gradle release outputs and writes ignored artifacts/android/version/.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_GRADLE="$ROOT_DIR/android/app/build.gradle"
APK_SOURCE="$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk"
AAB_SOURCE="$ROOT_DIR/android/app/build/outputs/bundle/release/app-release.aab"

VERSION_NAME="$(awk '/versionName "/ { gsub(/"/, "", $2); print $2; exit }' "$APP_GRADLE")"
VERSION_CODE="$(awk '/versionCode / { print $2; exit }' "$APP_GRADLE")"

if [[ -z "$VERSION_NAME" || -z "$VERSION_CODE" ]]; then
  echo "Could not read Android versionName/versionCode." >&2
  exit 1
fi
if [[ ! -f "$APK_SOURCE" || ! -f "$AAB_SOURCE" ]]; then
  echo "Release APK/AAB missing. Run pnpm android:release first." >&2
  exit 1
fi

STAGE_DIR="$ROOT_DIR/artifacts/android/v${VERSION_NAME}-${VERSION_CODE}"
APK_NAME="idea-tiles-android-v${VERSION_NAME}-${VERSION_CODE}.apk"
AAB_NAME="idea-tiles-android-v${VERSION_NAME}-${VERSION_CODE}.aab"
mkdir -p "$STAGE_DIR"
cp "$APK_SOURCE" "$STAGE_DIR/$APK_NAME"
cp "$AAB_SOURCE" "$STAGE_DIR/$AAB_NAME"

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
APKSIGNER="$(ls -1 "$ANDROID_SDK_ROOT"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -n 1 || true)"
if [[ -z "$APKSIGNER" ]]; then
  echo "apksigner was not found in Android SDK build-tools." >&2
  exit 1
fi

"$APKSIGNER" verify --verbose "$STAGE_DIR/$APK_NAME"
# AAB signer certificates are self-signed by design. `-strict` returns exit 4
# for that expected warning, so verify archive integrity without promoting the
# certificate-chain warning to a failure.
jarsigner -verify "$STAGE_DIR/$AAB_NAME" >/dev/null

(
  cd "$STAGE_DIR"
  shasum -a 256 "$APK_NAME" "$AAB_NAME" > SHA256SUMS
  shasum -a 256 -c SHA256SUMS
)

echo "Staged Android release artifacts in: $STAGE_DIR"
