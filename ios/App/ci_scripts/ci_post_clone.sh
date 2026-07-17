#!/bin/sh
# File purpose: Xcode Cloud post-clone hook — install JS deps so CapApp-SPM
#   path packages under node_modules/.pnpm resolve during Archive.
# Primary functions: brew node + pnpm, pnpm install, cap sync ios.
# I/O: writes node_modules (+ ios public/) from package.json / pnpm-lock.yaml.

set -eu

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

echo "==> ci_post_clone: branch=${CI_BRANCH:-?} commit=${CI_COMMIT:-?} build=${CI_BUILD_NUMBER:-?}"

APP_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$APP_DIR/../.." && pwd)"
cd "$REPO_ROOT"

if [ ! -f package.json ] || [ ! -f pnpm-lock.yaml ]; then
  echo "error: expected package.json + pnpm-lock.yaml at $REPO_ROOT" >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "error: Homebrew is required on Xcode Cloud" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing node via Homebrew"
  brew install node
fi

# Homebrew node may omit corepack on PATH; install pnpm directly.
if ! command -v pnpm >/dev/null 2>&1; then
  echo "==> Installing pnpm via Homebrew"
  brew install pnpm
fi

echo "==> node=$(command -v node) $(node -v); pnpm=$(command -v pnpm) $(pnpm -v)"

echo "==> pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

for pkg in app filesystem share splash-screen; do
  if ! ls -d node_modules/.pnpm/@capacitor+${pkg}@* 1>/dev/null 2>&1; then
    echo "error: missing @capacitor/${pkg} under node_modules/.pnpm after install" >&2
    exit 1
  fi
done

echo "==> pnpm cap:sync:ios"
pnpm cap:sync:ios

echo "==> ci_post_clone: node_modules + iOS web sync ready"
