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

echo 'Windows release public-asset overwrite guard passed'
