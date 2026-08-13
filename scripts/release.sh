#!/usr/bin/env bash
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
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
REPO=Base1520/Sermon-Study-Tool
TAG="v$V"
echo "=== The Operator $V ==="

bash scripts/check-release-provenance.sh "$V"

# Windows CI owns creation of the draft and its Windows assets. Refuse to touch
# credentials or build the Mac half until both the installer and updater manifest
# exist on that draft. This makes a mac-only public release structurally impossible.
if ! IS_DRAFT=$(gh release view "$TAG" --repo "$REPO" --json isDraft --jq '.isDraft'); then
  echo "Windows CI has not created the draft release $TAG; refusing to publish one platform alone." >&2
  exit 1
fi
if [ "$IS_DRAFT" != "true" ]; then
  echo "Release $TAG is already public; refusing to replace assets outside the draft boundary." >&2
  exit 1
fi
WINDOWS_ASSETS=$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name')
for REQUIRED in The-Operator-windows.exe latest.yml; do
  if ! grep -Fxq "$REQUIRED" <<<"$WINDOWS_ASSETS"; then
    echo "Draft $TAG is missing $REQUIRED; Windows download/update would be broken." >&2
    exit 1
  fi
done

# This repo is PUBLIC. The notarisation password was already a keychain lookup,
# but the Apple ID was a literal — a personal email is the login identity for the
# Developer account that signs and submits, so publishing it hands out half of a
# credential pair and a phishing target. The keychain item already stores the same
# address as its account attribute, so read both from it and keep neither here.
NOTARY_KEYCHAIN_ITEM="operator-notarize"
export APPLE_ID="$(security find-generic-password -s "$NOTARY_KEYCHAIN_ITEM" | awk -F'"' '/"acct"/{print $4}')"
export APPLE_TEAM_ID="6UP72M96Q5"   # not a secret: shipped inside every signed bundle
export APPLE_APP_SPECIFIC_PASSWORD="$(security find-generic-password -s "$NOTARY_KEYCHAIN_ITEM" -w)"

if [ -z "$APPLE_ID" ]; then
  echo "Could not read the Apple ID from keychain item '$NOTARY_KEYCHAIN_ITEM'." >&2
  echo "Notarisation would fail later with a confusing error, so stopping here." >&2
  exit 1
fi

echo "--- tests (the gate) ---"
bash scripts/test-windows-update-manifest.sh
bash scripts/test-windows-release-workflow.sh
bash scripts/test-release-provenance.sh
node server/src/test-stripe-topup.js
npm run test:release >/tmp/rel-gate.log 2>&1 || { echo "TESTS FAILED — not releasing"; tail -20 /tmp/rel-gate.log; exit 1; }
echo "    $(grep -cE '^  ok' /tmp/rel-gate.log 2>/dev/null || echo '?') checks passed"

echo "--- mac (signed + notarised) ---"
npm run build >/tmp/rel-mac.log 2>&1 || { echo "MAC BUILD FAILED"; tail -20 /tmp/rel-mac.log; exit 1; }

echo "--- staging release names ---"
rm -rf dist-electron/rel && mkdir -p dist-electron/rel
cp "dist-electron/The Operator-$V-arm64.dmg"     "dist-electron/rel/The-Operator-mac-apple-silicon.dmg"
cp "dist-electron/The Operator-$V.dmg"           "dist-electron/rel/The-Operator-mac-intel.dmg"
# Versioned copies + the Mac update manifest, for electron-updater.
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

echo "--- completing and publishing $TAG ---"
gh release upload "$TAG" dist-electron/rel/* --repo "$REPO" --clobber
gh release edit "$TAG" --repo "$REPO" --verify-tag --draft=false --latest \
  --title "The Operator $V" --notes "Specialist agent chats now explain clearly when a tool still needs your own key, instead of showing a raw error. Windows auto-update is restored — this is the first release since 1.4.0 that Windows installs can actually receive."

echo "--- verifying the buttons a stranger clicks ---"
for f in The-Operator-mac-apple-silicon.dmg The-Operator-mac-intel.dmg The-Operator-windows.exe latest.yml; do
  printf "    %-40s HTTP %s\n" "$f" \
    "$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 90 -r 0-255 \
       "https://github.com/$REPO/releases/latest/download/$f")"
done
echo "=== done ==="
