#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "Usage: $0 <owner/repo> <release-id> <expected-tag> <expected-version> <expected-commit>" >&2
  exit 2
fi

REPO=$1
RELEASE_ID=$2
EXPECTED_TAG=$3
EXPECTED_VERSION=$4
EXPECTED_COMMIT=$5
case "$RELEASE_ID" in
  ''|*[!0-9]*)
    echo 'Windows source receipt verification requires a numeric release id.' >&2
    exit 1
    ;;
esac

case "$EXPECTED_COMMIT" in
  *[!0-9a-f]*|'')
    echo 'Windows source receipt verification requires a lowercase hexadecimal commit.' >&2
    exit 1
    ;;
esac
if [ "${#EXPECTED_COMMIT}" -ne 40 ]; then
  echo 'Windows source receipt verification requires an exact 40-character commit.' >&2
  exit 1
fi

RELEASE_STATE=$(gh api "repos/$REPO/releases/$RELEASE_ID" \
  --jq '[.draft, .tag_name] | @tsv')
IFS=$'\t' read -r IS_DRAFT ACTUAL_TAG <<<"$RELEASE_STATE"
if [ "$IS_DRAFT" != true ]; then
  echo "Release $RELEASE_ID is no longer a draft; refusing its Windows receipt." >&2
  exit 1
fi
if [ "$ACTUAL_TAG" != "$EXPECTED_TAG" ]; then
  echo "Release $RELEASE_ID now belongs to tag $ACTUAL_TAG, not $EXPECTED_TAG." >&2
  exit 1
fi

RECEIPT_DIR=$(mktemp -d)
trap 'rm -rf "$RECEIPT_DIR"' EXIT
INVENTORY_FILE="$RECEIPT_DIR/assets.json"
RECEIPT_FILE="$RECEIPT_DIR/windows-source.json"

if ! gh api "repos/$REPO/releases/$RELEASE_ID/assets?per_page=100" >"$INVENTORY_FILE"; then
  echo 'Could not read the Windows release asset inventory by immutable release id.' >&2
  exit 1
fi
RECEIPT_ID=$(node scripts/windows-source-receipt.mjs asset-id "$INVENTORY_FILE")
if ! gh api -H 'Accept: application/octet-stream' \
  "repos/$REPO/releases/assets/$RECEIPT_ID" >"$RECEIPT_FILE"; then
  echo 'Could not download the Windows source receipt by immutable asset id.' >&2
  exit 1
fi

node scripts/windows-source-receipt.mjs verify \
  "$RECEIPT_FILE" "$INVENTORY_FILE" \
  "$REPO" "$EXPECTED_COMMIT" "$EXPECTED_TAG" "$EXPECTED_VERSION"
