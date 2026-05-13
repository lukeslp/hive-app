#!/usr/bin/env bash
# Smoke-test the deployed apple-app-site-association file across all
# brand domains. Run after redeploying server/_core/index.ts whenever
# the AASA payload (lines ~47-66) changes.
#
# All brand domains are reverse-proxied by Caddy into the same Node
# process, so they should all serve the same AASA. If even one returns
# a different appID, the deploy is half-rolled and Universal Links will
# silently fail signature validation on that domain.
#
# Exits 0 if every domain returns the expected app ID, 1 otherwise.
set -uo pipefail

# Match this to server/_core/index.ts. Keep in sync.
EXPECTED_APP_ID="596T7J7FB6.app.hexmind.ios"

DOMAINS=(
  "hivemind.cx"
  "hive-mind.pro"
  "hexmind.app"
  "hexmind.io"
  "hexpand.app"
  "hexpander.app"
  "ideatiles.app"
)

fail=0
echo "AASA smoke-test — expecting appID '${EXPECTED_APP_ID}' on ${#DOMAINS[@]} domains"
echo

for d in "${DOMAINS[@]}"; do
  url="https://${d}/.well-known/apple-app-site-association"
  ctype=$(curl -sS -I --max-time 10 "${url}" 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2; exit}')
  if ! echo "${ctype}" | grep -qi 'application/json'; then
    printf "  ✗ %-20s  bad Content-Type: %s (want application/json)\n" "${d}" "${ctype:-<none>}"
    fail=1
    continue
  fi

  body=$(curl -fsSL --max-time 10 "${url}" 2>/dev/null) || {
    printf "  ✗ %-20s  fetch failed (%s)\n" "${d}" "${url}"
    fail=1
    continue
  }

  ids=$(printf '%s' "${body}" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    applinks = d.get("applinks", {})
    out = set()
    for det in applinks.get("details", []):
        for x in det.get("appIDs", []) or []:
            out.add(x)
        for x in det.get("apps", []) or []:
            out.add(x)
    apps = applinks.get("apps", []) or []
    for x in apps:
        out.add(x)
    print(",".join(sorted(out)) or "<none>")
except Exception as exc:
    print(f"<parse error: {exc}>", file=sys.stderr)
    sys.exit(2)
') || {
    printf "  ✗ %-20s  parse failed\n" "${d}"
    fail=1
    continue
  }

  if [[ ",${ids}," == *",${EXPECTED_APP_ID},"* ]]; then
    printf "  ✓ %-20s  %s\n" "${d}" "${ids}"
  else
    printf "  ✗ %-20s  %s  (expected %s)\n" "${d}" "${ids}" "${EXPECTED_APP_ID}"
    fail=1
  fi
done

echo
if [[ ${fail} -eq 0 ]]; then
  echo "All domains pass."
  exit 0
else
  echo "One or more domains failed. Check Caddy reverse-proxy + redeploy."
  exit 1
fi
