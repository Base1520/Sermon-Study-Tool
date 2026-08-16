#!/bin/bash -p
# Complete the draft release after Windows CI has attached its signed half:
# build/notarise Mac, stage aliases, upload Mac assets, publish, verify.
#
# THE ALIASES ARE THE POINT. base1520.com/operator links to
# The-Operator-mac-apple-silicon.dmg and friends — names with no version in them,
# so the page never needs editing. But `latest/download/<file>` still resolves by
# EXACT FILENAME, so if a release ships without these copies the download button
# 404s silently on a page nobody thinks to re-check. Doing it by hand was a step
# waiting to be forgotten; here it cannot be.
set -euo pipefail
case "$-" in
  *p*) ;;
  *)
    echo 'Run scripts/release.sh directly so its privileged Bash boundary can isolate startup state.' >&2
    exit 1
    ;;
esac
unset CDPATH
INVOCATION_ROOT=$(pwd -P)
SCRIPT_PATH=${BASH_SOURCE[0]}
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH="$INVOCATION_ROOT/$SCRIPT_PATH" ;;
esac
if ! SCRIPT_PATH=$(/bin/realpath "$SCRIPT_PATH"); then
  echo 'Could not resolve the physical release driver path.' >&2
  exit 1
fi
# Privileged Bash ignores startup hooks and exported functions itself, but it
# otherwise passes their environment entries to later plain-Bash test/helper
# children. Re-exec only when one is present, removing every such entry so no
# downstream boundary can resurrect caller-controlled shell code.
SANITIZE_ENV_ARGS=()
while IFS= read -r ENV_NAME; do
  case "$ENV_NAME" in
    BASH_ENV|ENV|SHELLOPTS|BASHOPTS|CDPATH|GLOBIGNORE|BASH_COMPAT|POSIXLY_CORRECT|BASH_FUNC_*%%)
      SANITIZE_ENV_ARGS+=(-u "$ENV_NAME")
      ;;
  esac
done <<< "$(compgen -e)"
if [ "${#SANITIZE_ENV_ARGS[@]}" -gt 0 ]; then
  exec /usr/bin/env "${SANITIZE_ENV_ARGS[@]}" \
    /bin/bash -p "$SCRIPT_PATH" "$@"
fi
unset BASH_ENV ENV CDPATH GLOBIGNORE BASH_COMPAT POSIXLY_CORRECT
SCRIPT_DIR=${SCRIPT_PATH%/*}
if [ "$SCRIPT_DIR" = "$SCRIPT_PATH" ]; then
  SCRIPT_DIR=$INVOCATION_ROOT
fi
if ! cd -- "$SCRIPT_DIR/.."; then
  echo 'Could not enter the repository containing this release driver.' >&2
  exit 1
fi
V=$(node -p "require('./package.json').version")
REPO=Base1520/Sermon-Study-Tool
TAG="v$V"
# Imported environment variables retain Bash's export attribute after a plain
# assignment. Clear any caller-provided Apple credentials now so they cannot
# reach the verification suite or other pre-build child processes.
unset APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD
echo "=== The Operator $V ==="

/bin/bash -p scripts/check-release-provenance.sh "$V"

# Windows CI owns creation of the draft and its Windows assets. Refuse to touch
# credentials or build the Mac half until both the installer and updater manifest
# exist on that draft. This makes a mac-only public release structurally impossible.
if ! RELEASE_INFO=$(gh release view "$TAG" --repo "$REPO" \
  --json isDraft,databaseId,uploadUrl,assets \
  --jq '[.isDraft, .databaseId, .uploadUrl, ([.assets[].name] | join("\u001f"))] | @tsv'); then
  echo "Windows CI has not created the draft release $TAG; refusing to publish one platform alone." >&2
  exit 1
fi
IFS=$'\t' read -r IS_DRAFT RELEASE_ID RELEASE_UPLOAD_URL WINDOWS_ASSETS <<<"$RELEASE_INFO"
if [ "$IS_DRAFT" != "true" ]; then
  echo "Release $TAG is already public; refusing to replace assets outside the draft boundary." >&2
  exit 1
fi
case "$RELEASE_ID" in
  ''|*[!0-9]*)
    echo "Draft $TAG did not provide a numeric GitHub release id." >&2
    exit 1
    ;;
esac
if [ "${RELEASE_UPLOAD_URL%%\{*}" != "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets" ]; then
  echo "Draft $TAG did not provide the expected release-specific upload URL." >&2
  exit 1
fi
WINDOWS_ASSETS=${WINDOWS_ASSETS//$'\x1f'/$'\n'}
for REQUIRED in The-Operator-windows.exe latest.yml windows-source.json; do
  if ! grep -Fxq "$REQUIRED" <<<"$WINDOWS_ASSETS"; then
    echo "Draft $TAG is missing $REQUIRED; Windows download/update would be broken." >&2
    exit 1
  fi
done

WINDOWS_SOURCE_COMMIT=$(git rev-parse HEAD)
bash scripts/verify-windows-source-receipt.sh \
  "$REPO" "$RELEASE_ID" "$TAG" "$V" "$WINDOWS_SOURCE_COMMIT"

echo "--- tests (the gate) ---"
bash scripts/test-windows-update-manifest.sh
bash scripts/test-windows-release-workflow.sh
bash scripts/test-windows-source-receipt.sh
bash scripts/test-release-provenance.sh
bash scripts/test-desktop-release-verification.sh
bash scripts/test-release-asset-upload.sh
node server/src/test-stripe-topup.js
npm run test:release >/tmp/rel-gate.log 2>&1 || { echo "TESTS FAILED — not releasing"; tail -20 /tmp/rel-gate.log; exit 1; }
echo "    $(grep -cE '^  ok' /tmp/rel-gate.log 2>/dev/null || echo '?') checks passed"

# This repo is PUBLIC. The notarisation password was already a keychain lookup,
# but the Apple ID was a literal — a personal email is the login identity for the
# Developer account that signs and submits, so publishing it hands out half of a
# credential pair and a phishing target. Read both from the keychain only after
# the complete test gate, keep them shell-local, and pass them only to the Mac
# build process that needs them.
NOTARY_KEYCHAIN_ITEM="operator-notarize"
APPLE_ID="$(security find-generic-password -s "$NOTARY_KEYCHAIN_ITEM" | awk -F'"' '/"acct"/{print $4}')"
APPLE_TEAM_ID="6UP72M96Q5"   # not a secret: shipped inside every signed bundle
APPLE_APP_SPECIFIC_PASSWORD="$(security find-generic-password -s "$NOTARY_KEYCHAIN_ITEM" -w)"

if [ -z "$APPLE_ID" ]; then
  echo "Could not read the Apple ID from keychain item '$NOTARY_KEYCHAIN_ITEM'." >&2
  echo "Notarisation would fail later with a confusing error, so stopping here." >&2
  exit 1
fi

echo "--- mac (signed + notarised) ---"
APPLE_ID="$APPLE_ID" APPLE_TEAM_ID="$APPLE_TEAM_ID" APPLE_APP_SPECIFIC_PASSWORD="$APPLE_APP_SPECIFIC_PASSWORD" npm run build >/tmp/rel-mac.log 2>&1 || { echo "MAC BUILD FAILED"; tail -20 /tmp/rel-mac.log; exit 1; }

echo "--- signed + updater-configured mac bundles ---"
for APP in "dist-electron/mac-arm64/The Operator.app" "dist-electron/mac/The Operator.app"; do
  CODESIGN_BIN=/usr/bin/codesign CODESIGN_CONTROL_APP=/System/Applications/TextEdit.app \
    bash scripts/verify-macos-app-bundle.sh "$APP"
done

echo "--- staging release names ---"
rm -rf dist-electron/rel && mkdir -p dist-electron/rel
cp "dist-electron/The Operator-$V-arm64.dmg"     "dist-electron/rel/The-Operator-mac-apple-silicon.dmg"
cp "dist-electron/The Operator-$V.dmg"           "dist-electron/rel/The-Operator-mac-intel.dmg"
# Versioned DMGs are also named in latest-mac.yml. Stage them rather than
# publishing a manifest with secondary links that 404.
cp "dist-electron/The Operator-$V-arm64.dmg"     "dist-electron/rel/The-Operator-$V-arm64.dmg"
cp "dist-electron/The Operator-$V.dmg"           "dist-electron/rel/The-Operator-$V.dmg"
# Versioned zip archives + the Mac update manifest, for electron-updater.
cp "dist-electron/The Operator-$V-arm64-mac.zip" "dist-electron/rel/The-Operator-$V-arm64-mac.zip"
cp "dist-electron/The Operator-$V-mac.zip"       "dist-electron/rel/The-Operator-$V-mac.zip"
cp dist-electron/latest-mac.yml                   dist-electron/rel/

echo "--- gatekeeper ---"
# spctl writes its verdict to STDERR, so the first version of this piped an
# empty stdout to tail and printed nothing — a notarisation failure would have
# looked identical to a pass. Redirect, and FAIL the release if either build is
# not accepted rather than shipping a Gatekeeper wall to a pastor.
for APP in "dist-electron/mac-arm64/The Operator.app" "dist-electron/mac/The Operator.app"; do
  if spctl -a -vvv -t install "$APP" 2>&1 | grep -q "source=Notarized Developer ID"; then
    echo "    notarised: $APP"
  else
    echo "NOT NOTARISED: $APP — refusing to publish"; exit 1
  fi
done

echo "--- final provenance check ---"
/bin/bash -p scripts/check-release-provenance.sh "$V"

echo "--- completing and publishing $TAG ---"
bash scripts/upload-release-assets-by-id.sh "$REPO" "$RELEASE_ID" "$TAG" "$RELEASE_UPLOAD_URL" dist-electron/rel/*
bash scripts/verify-windows-source-receipt.sh \
  "$REPO" "$RELEASE_ID" "$TAG" "$V" "$WINDOWS_SOURCE_COMMIT"
gh release edit "$TAG" --repo "$REPO" --verify-tag --draft=false --latest \
  --title "The Operator $V" --notes "Specialist agent chats now explain clearly when a tool still needs your own key, instead of showing a raw error. Windows auto-update is restored — this is the first release since 1.4.0 that Windows installs can actually receive."

echo "--- verifying customer downloads and updater channels ---"
bash scripts/verify-desktop-release-assets.sh "$REPO" "$V"
echo "=== done ==="
