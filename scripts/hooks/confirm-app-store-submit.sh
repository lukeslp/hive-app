#!/bin/bash
# File purpose: force a permission prompt before any command submits an Idea
#   Tiles build to App Store review.
# I/O: reads the PreToolUse hook payload on stdin; emits a permissionDecision
#   of "ask" on stdout when the command matches, otherwise stays silent.
#
# Staging a version is reversible: metadata, screenshots, and an attached build
# can all be edited or replaced while the version sits in PREPARE_FOR_SUBMISSION.
# Submitting it for review is not reversible from here, and iOS and macOS share
# one App Store product, so a submission on the wrong platform or build number
# is a public mistake.
#
# This deliberately answers "ask", not "deny" — submitting is a normal thing to
# want. The goal is that it is always a deliberate answer to a prompt, never a
# silent step inside a longer automated run.

set -u

command="$(jq -r '.tool_input.command // ""' 2>/dev/null || true)"
[ -n "$command" ] || exit 0

# asc_ship.py's submit subcommand, and fastlane deliver's submit_for_review.
if printf '%s' "$command" | grep -qE 'asc_ship\.py[[:space:]]+submit([[:space:]]|$)|submit_for_review[[:space:]]*:?[[:space:]]*true'; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"This submits an Idea Tiles build to App Store review. That is outward-facing and cannot be undone from here. Confirm the platform, version, and build number first."}}
JSON
fi

exit 0
