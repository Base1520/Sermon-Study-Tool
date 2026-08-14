#!/usr/bin/env bash
set -euo pipefail

REPO=${1:?Usage: verify-desktop-release-assets.sh <owner/repo> <version>}
VERSION=${2:?Usage: verify-desktop-release-assets.sh <owner/repo> <version>}
BASE_URL=${OPERATOR_RELEASE_BASE_URL:-https://github.com/$REPO/releases/latest/download}
BASE_URL=${BASE_URL%/}

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
