#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <owner/repo> <release-id> <expected-tag> <upload-url> <asset>..." >&2
  exit 2
fi

REPO=$1
RELEASE_ID=$2
EXPECTED_TAG=$3
UPLOAD_URL=$4
shift 4

case "$RELEASE_ID" in
  ''|*[!0-9]*)
    echo "Release asset upload requires a numeric GitHub release id." >&2
    exit 1
    ;;
esac

# GitHub returns a URI template such as .../assets{?name,label}. `gh api`
# accepts the full endpoint, and fields supplied alongside --input become query
# parameters while the file remains the raw request body.
UPLOAD_ENDPOINT=${UPLOAD_URL%%\{*}
EXPECTED_ENDPOINT="https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets"
if [ "$UPLOAD_ENDPOINT" != "$EXPECTED_ENDPOINT" ]; then
  echo "Release upload URL does not belong to release id $RELEASE_ID in $REPO." >&2
  exit 1
fi

# The first draft check happens before a long build/notarization. Re-read the
# immutable release id immediately before any destructive clobber so a release
# published or retagged during that interval cannot be modified here.
RELEASE_STATE=$(gh api "repos/$REPO/releases/$RELEASE_ID" \
  --jq '[.draft, .tag_name, .upload_url] | @tsv')
IFS=$'\t' read -r IS_DRAFT ACTUAL_TAG CURRENT_UPLOAD_URL <<<"$RELEASE_STATE"
if [ "$IS_DRAFT" != true ]; then
  echo "Release $RELEASE_ID is no longer a draft; refusing to replace assets." >&2
  exit 1
fi
if [ "$ACTUAL_TAG" != "$EXPECTED_TAG" ]; then
  echo "Release $RELEASE_ID now belongs to tag $ACTUAL_TAG, not $EXPECTED_TAG." >&2
  exit 1
fi
if [ "${CURRENT_UPLOAD_URL%%\{*}" != "$UPLOAD_ENDPOINT" ]; then
  echo "Release $RELEASE_ID no longer reports the captured upload URL." >&2
  exit 1
fi

EXISTING_ASSETS=$(gh api "repos/$REPO/releases/$RELEASE_ID/assets" \
  --paginate --jq '.[] | [.id, .name] | @tsv')

for ASSET in "$@"; do
  if [ ! -f "$ASSET" ]; then
    echo "Release asset is missing: $ASSET" >&2
    exit 1
  fi

  NAME=${ASSET##*/}
  case "$NAME" in
    ''|*$'\n'*|*$'\t'*)
      echo "Release asset has an unsupported filename: $ASSET" >&2
      exit 1
      ;;
  esac

  EXISTING_ID=''
  while IFS=$'\t' read -r ASSET_ID ASSET_NAME; do
    if [ "$ASSET_NAME" = "$NAME" ]; then
      EXISTING_ID=$ASSET_ID
      break
    fi
  done <<<"$EXISTING_ASSETS"

  if [ -n "$EXISTING_ID" ]; then
    case "$EXISTING_ID" in
      *[!0-9]*)
        echo "Existing asset id for $NAME is not numeric." >&2
        exit 1
        ;;
    esac
    gh api --method DELETE "repos/$REPO/releases/assets/$EXISTING_ID" --silent
  fi

  gh api --method POST "$UPLOAD_ENDPOINT" \
    -H 'Content-Type: application/octet-stream' \
    --input "$ASSET" \
    -f "name=$NAME" \
    --silent
done
