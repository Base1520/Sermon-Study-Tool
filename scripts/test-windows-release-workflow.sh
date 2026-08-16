#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

WORKFLOW=${1:-.github/workflows/windows-release.yml}

grep -q '^bash scripts/test-windows-release-workflow.sh$' scripts/release.sh
grep -q '^bash scripts/test-windows-source-receipt.sh$' scripts/release.sh

dispatch_ref_line=$(grep -nF 'if [ "$GITHUB_REF" != "refs/tags/$TAG" ]; then' "$WORKFLOW" | cut -d: -f1 || true)
checkout_line=$(grep -nF 'uses: actions/checkout@v5' "$WORKFLOW" | cut -d: -f1 || true)
if [ -z "$dispatch_ref_line" ] || [ -z "$checkout_line" ] || [ "$dispatch_ref_line" -ge "$checkout_line" ]; then
  echo 'Windows release workflow must run from the exact tag it builds' >&2
  exit 1
fi

draft_query_line=$(grep -nF 'IS_DRAFT=$(gh release view "$TAG" --json isDraft' "$WORKFLOW" | cut -d: -f1)
draft_guard_line=$(grep -nF 'if [ "$IS_DRAFT" != "true" ]; then' "$WORKFLOW" | cut -d: -f1)
refusal_line=$(grep -nF 'Refusing to replace Windows assets outside the draft-release boundary.' "$WORKFLOW" | cut -d: -f1)
exit_line=$(awk -v start="$draft_guard_line" 'NR > start && /exit 1/ { print NR; exit }' "$WORKFLOW")
upload_line=$(grep -nF 'bash scripts/upload-release-assets-by-id.sh \' "$WORKFLOW" | cut -d: -f1)
receipt_write_line=$(grep -nF 'node scripts/windows-source-receipt.mjs write' "$WORKFLOW" | cut -d: -f1)
receipt_delete_line=$(grep -nF 'delete_existing_asset "$RECEIPT_NAME"' "$WORKFLOW" | cut -d: -f1)
stale_blockmap_delete_line=$(grep -nF 'delete_existing_asset "${BLOCKMAP##*/}"' "$WORKFLOW" | cut -d: -f1)
blockmap_upload_line=$(grep -nF 'WINDOWS_UPLOADS+=("$BLOCKMAP")' "$WORKFLOW" | cut -d: -f1)
receipt_upload_line=$(grep -nF 'WINDOWS_UPLOADS+=("$RECEIPT")' "$WORKFLOW" | cut -d: -f1)
source_commit_line=$(grep -nF 'SOURCE_COMMIT=$(git rev-parse HEAD)' "$WORKFLOW" | cut -d: -f1)

test -n "$draft_query_line"
test -n "$draft_guard_line"
test -n "$refusal_line"
test -n "$exit_line"
test -n "$upload_line"
test -n "$receipt_write_line"
test -n "$receipt_delete_line"
test -n "$stale_blockmap_delete_line"
test -n "$blockmap_upload_line"
test -n "$receipt_upload_line"
test -n "$source_commit_line"
test "$draft_query_line" -lt "$draft_guard_line"
test "$draft_guard_line" -lt "$refusal_line"
test "$refusal_line" -lt "$exit_line"
test "$exit_line" -lt "$upload_line"
if (( source_commit_line >= receipt_write_line
   || receipt_write_line >= receipt_delete_line
   || receipt_delete_line >= stale_blockmap_delete_line
   || stale_blockmap_delete_line >= blockmap_upload_line
   || blockmap_upload_line >= receipt_upload_line
   || receipt_upload_line >= upload_line )); then
  echo 'Windows source receipt must hash staged assets, remove stale markers, and upload last by immutable release id' >&2
  exit 1
fi
if grep -F 'delete_existing_asset "$RECEIPT_NAME"' "$WORKFLOW" | grep -Fq '|| true'; then
  echo 'Windows workflow must fail closed when an old source receipt cannot be removed' >&2
  exit 1
fi
if grep -Fq '${{ github.sha }}' "$WORKFLOW"; then
  echo 'Windows source receipt must derive the checked-out tag commit, not the dispatch SHA' >&2
  exit 1
fi
if grep -Fq 'gh release upload "$TAG"' "$WORKFLOW"; then
  echo 'Windows workflow still re-resolves the draft by tag during asset upload' >&2
  exit 1
fi

mac_draft_query=$(grep -nF 'RELEASE_INFO=$(gh release view "$TAG"' scripts/release.sh | cut -d: -f1)
mac_asset_query=$(grep -nF -- '--json isDraft,databaseId,uploadUrl,assets' scripts/release.sh | cut -d: -f1)
mac_required_exe=$(grep -nF 'for REQUIRED in The-Operator-windows.exe latest.yml windows-source.json' scripts/release.sh | cut -d: -f1)
mac_receipt_count=$(grep -Fc 'bash scripts/verify-windows-source-receipt.sh \' scripts/release.sh)
mac_receipt_first=$(grep -nF 'bash scripts/verify-windows-source-receipt.sh \' scripts/release.sh | head -1 | cut -d: -f1)
mac_receipt_final=$(grep -nF 'bash scripts/verify-windows-source-receipt.sh \' scripts/release.sh | tail -1 | cut -d: -f1)
mac_credential=$(grep -nF 'security find-generic-password' scripts/release.sh | head -1 | cut -d: -f1)
mac_build=$(grep -nF 'npm run build >/tmp/rel-mac.log' scripts/release.sh | cut -d: -f1)
mac_final_provenance=$(grep -nF '/bin/bash -p scripts/check-release-provenance.sh "$V"' scripts/release.sh | tail -1 | cut -d: -f1)
mac_upload=$(grep -nF 'scripts/upload-release-assets-by-id.sh "$REPO" "$RELEASE_ID" "$TAG" "$RELEASE_UPLOAD_URL" dist-electron/rel/*' scripts/release.sh | cut -d: -f1)
mac_publish=$(grep -nF 'gh release edit "$TAG"' scripts/release.sh | cut -d: -f1)

test -n "$mac_draft_query"
test -n "$mac_asset_query"
test -n "$mac_required_exe"
test "$mac_receipt_count" -eq 2
test -n "$mac_receipt_first"
test -n "$mac_receipt_final"
test -n "$mac_credential"
test -n "$mac_build"
test -n "$mac_final_provenance"
test -n "$mac_upload"
test -n "$mac_publish"
test "$mac_draft_query" -lt "$mac_asset_query"
test "$mac_asset_query" -lt "$mac_required_exe"
if (( mac_required_exe >= mac_receipt_first
   || mac_receipt_first >= mac_credential
   || mac_receipt_first >= mac_build
   || mac_final_provenance >= mac_upload
   || mac_upload >= mac_receipt_final
   || mac_receipt_final >= mac_publish )); then
  echo 'Mac completion must verify the Windows source receipt before credentials and again after Mac upload but before publication' >&2
  exit 1
fi
test "$mac_required_exe" -lt "$mac_upload"
test "$mac_upload" -lt "$mac_publish"
! grep -Fq 'npm run build:beta-win' scripts/release.sh
! grep -Fq 'gh release create' scripts/release.sh

echo 'Windows release draft handoff and public-asset guards passed'
