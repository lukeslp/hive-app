#!/bin/sh
# File purpose: Xcode Cloud post-clone hook — install JS deps so CapApp-SPM
#   path packages under node_modules/.pnpm resolve during Archive.
# Primary functions: enable pnpm via corepack, pnpm install, optional web sync.
# I/O: reads package.json + pnpm-lock.yaml; writes node_modules (+ ios public/).
#
# Working directory is ios/App/ci_scripts (adjacent to App.xcodeproj).
# CapApp-SPM/Package.swift references ../../../node_modules/.pnpm/...

set -eu

echo "==> ci_post_clone: branch=${CI_BRANCH:-?} commit=${CI_COMMIT:-?} build=${CI_BUILD_NUMBER:-?}"

APP_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$APP_DIR/../.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f package.json ] || [ ! -f pnpm-lock.yaml ]; then
  echo "error: expected package.json + pnpm-lock.yaml at $REPO_ROOT" >&2
  exit 1
fi

# Prefer Homebrew node so corepack/pnpm are available on Xcode Cloud images.
if ! command -v node >/dev/null 2>&1; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: node (or Homebrew) is required on Xcode Cloud" >&2
    exit 1
  fi
  echo "==> Installing node via Homebrew"
  brew install node
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "==> Enabling pnpm via corepack"
  corepack enable
  corepack prepare pnpm@10.4.1 --activate
fi

echo "==> pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

# Ensure CapApp-SPM path deps exist (Capacitor plugins live in pnpm store paths).
for pkg in app filesystem share splash-screen; do
  # Soft check: at least one matching path under node_modules/.pnpm
  if ! ls -d node_modules/.pnpm/@capacitor+${pkg}@* 1>/dev/null 2>&1; then
    echo "error: missing @capacitor/${pkg} under node_modules/.pnpm after install" >&2
    exit 1
  fi
done

# Build + sync web assets so Archive does not ship an empty public/ bundle.
echo "==> pnpm cap:sync:ios"
pnpm cap:sync:ios

echo "==> ci_post_clone: node_modules + iOS web sync ready"
