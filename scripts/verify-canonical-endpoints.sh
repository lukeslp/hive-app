#!/usr/bin/env bash
# Verify deployed legal and marketing HTML on canonical + legacy brand hosts.
# Run after DNS/Caddy point ideatiles.app at production and Node is redeployed.
#
# Exits 0 if every host returns HTTP 200 and HTML contains expected markers.
set -uo pipefail

MARKER="Idea Tiles"
DOMAINS=(
  "ideatiles.app"
  "hexmind.app"
  "hivemind.cx"
  "hive-mind.pro"
  "hexmind.io"
  "hexpand.app"
  "hexpander.app"
)

fail=0
echo "Canonical endpoint smoke — expect title/body marker: '${MARKER}'"
echo

for d in "${DOMAINS[@]}"; do
  for path in "/privacy" "/terms"; do
    url="https://${d}${path}"
    code=$(curl -sS -o /tmp/_vc_body.txt -w "%{http_code}" --max-time 15 "${url}" 2>/dev/null || echo "000")
    if [[ "${code}" != "200" ]]; then
      printf "  ✗ %-22s HTTP %s\n" "${d}${path}" "${code}"
      fail=1
      continue
    fi
    if ! grep -q "${MARKER}" /tmp/_vc_body.txt 2>/dev/null; then
      printf "  ✗ %-22s HTTP 200 but missing marker '%s'\n" "${d}${path}" "${MARKER}"
      fail=1
      continue
    fi
    ctype=$(curl -sS -I --max-time 10 "${url}" 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2; exit}')
    if ! echo "${ctype}" | grep -qi 'text/html'; then
      printf "  ✗ %-22s unexpected Content-Type: %s\n" "${d}${path}" "${ctype:-<none>}"
      fail=1
      continue
    fi
    printf "  ✓ %-22s HTTP 200 text/html + marker\n" "${d}${path}"
  done
done

rm -f /tmp/_vc_body.txt

echo
if [[ ${fail} -eq 0 ]]; then
  echo "All endpoint checks pass."
  exit 0
else
  echo "One or more checks failed. Fix DNS/Caddy/deploy before App Store / UL trust."
  exit 1
fi
