#!/usr/bin/env bash
set -euo pipefail

REPO=${1:?Usage: verify-desktop-release-assets.sh <owner/repo> <version>}
VERSION=${2:?Usage: verify-desktop-release-assets.sh <owner/repo> <version>}
BASE_URL=${OPERATOR_RELEASE_BASE_URL:-https://github.com/$REPO/releases/latest/download}
BASE_URL=${BASE_URL%/}
EXPECTED_TAG="v$VERSION"

# Publishing and selecting the latest release are separate GitHub state changes.
# Verify the authoritative alias before probing URLs beneath /releases/latest/.
if ! LATEST_TAG=$(gh api "repos/$REPO/releases/latest" --jq '.tag_name'); then
  echo "Release $EXPECTED_TAG may already be public, but GitHub's latest-release alias could not be read; refusing to report success." >&2
  exit 1
fi
if [ "$LATEST_TAG" != "$EXPECTED_TAG" ]; then
  echo "Release $EXPECTED_TAG may already be public, but GitHub's latest-release alias points to ${LATEST_TAG:-<empty>}; refusing to report success." >&2
  exit 1
fi
echo "    GitHub latest release                    $EXPECTED_TAG"

# Keep customer-facing installers and both electron-updater channels in one
# executable contract. A printed 404 is not verification: every asset must
# return a successful full or range response or the release command fails.
ASSETS=(
  The-Operator-mac-apple-silicon.dmg
  The-Operator-mac-intel.dmg
  "The-Operator-$VERSION-arm64.dmg"
  "The-Operator-$VERSION.dmg"
  The-Operator-windows.exe
  latest.yml
  latest-mac.yml
  "The-Operator-$VERSION-arm64-mac.zip"
  "The-Operator-$VERSION-mac.zip"
)

for asset in "${ASSETS[@]}"; do
  if ! status=$(curl -sS -o /dev/null -w '%{http_code}' -L --max-time 90 -r 0-255 \
    "$BASE_URL/$asset"); then
    echo "Public release verification could not fetch $asset." >&2
    exit 1
  fi

  printf "    %-44s HTTP %s\n" "$asset" "$status"
  case "$status" in
    200|206) ;;
    *)
      echo "Public release verification failed for $asset (HTTP $status)." >&2
      exit 1
      ;;
  esac
done
