#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

WORKFLOW=${1:-.github/workflows/windows-release.yml}

grep -q '^bash scripts/test-windows-release-workflow.sh$' scripts/release.sh

draft_query_line=$(grep -nF 'IS_DRAFT=$(gh release view "$TAG" --json isDraft' "$WORKFLOW" | cut -d: -f1)
draft_guard_line=$(grep -nF 'if [ "$IS_DRAFT" != "true" ]; then' "$WORKFLOW" | cut -d: -f1)
refusal_line=$(grep -nF 'Refusing to replace Windows assets outside the draft-release boundary.' "$WORKFLOW" | cut -d: -f1)
exit_line=$(awk -v start="$draft_guard_line" 'NR > start && /exit 1/ { print NR; exit }' "$WORKFLOW")
upload_line=$(grep -nF 'gh release upload "$TAG"' "$WORKFLOW" | head -1 | cut -d: -f1)

test -n "$draft_query_line"
test -n "$draft_guard_line"
test -n "$refusal_line"
test -n "$exit_line"
test -n "$upload_line"
test "$draft_query_line" -lt "$draft_guard_line"
test "$draft_guard_line" -lt "$refusal_line"
test "$refusal_line" -lt "$exit_line"
test "$exit_line" -lt "$upload_line"

mac_draft_query=$(grep -nF 'IS_DRAFT=$(gh release view "$TAG"' scripts/release.sh | cut -d: -f1)
mac_asset_query=$(grep -nF 'WINDOWS_ASSETS=$(gh release view "$TAG"' scripts/release.sh | cut -d: -f1)
mac_required_exe=$(grep -nF 'for REQUIRED in The-Operator-windows.exe latest.yml' scripts/release.sh | cut -d: -f1)
mac_upload=$(grep -nF 'gh release upload "$TAG" dist-electron/rel/*' scripts/release.sh | cut -d: -f1)
mac_publish=$(grep -nF 'gh release edit "$TAG"' scripts/release.sh | cut -d: -f1)

test -n "$mac_draft_query"
test -n "$mac_asset_query"
test -n "$mac_required_exe"
test -n "$mac_upload"
test -n "$mac_publish"
test "$mac_draft_query" -lt "$mac_asset_query"
test "$mac_asset_query" -lt "$mac_required_exe"
test "$mac_required_exe" -lt "$mac_upload"
test "$mac_upload" -lt "$mac_publish"
! grep -Fq 'npm run build:beta-win' scripts/release.sh
! grep -Fq 'gh release create' scripts/release.sh

echo 'Windows release draft handoff and public-asset guards passed'
