#!/usr/bin/env bash
# One release: build, notarise, stage version-free aliases, upload, verify.
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
echo "=== The Operator $V ==="

export APPLE_ID="aperme2@gmail.com"
export APPLE_TEAM_ID="6UP72M96Q5"
export APPLE_APP_SPECIFIC_PASSWORD="$(security find-generic-password -s operator-notarize -w)"

echo "--- tests (the gate) ---"
npm run test:release >/tmp/rel-gate.log 2>&1 || { echo "TESTS FAILED — not releasing"; tail -20 /tmp/rel-gate.log; exit 1; }
echo "    $(grep -cE '^  ok' /tmp/rel-gate.log 2>/dev/null || echo '?') checks passed"

echo "--- mac (signed + notarised) ---"
npm run build >/tmp/rel-mac.log 2>&1 || { echo "MAC BUILD FAILED"; tail -20 /tmp/rel-mac.log; exit 1; }

echo "--- windows ---"
npm run build:beta-win >/tmp/rel-win.log 2>&1 || { echo "WIN BUILD FAILED"; tail -20 /tmp/rel-win.log; exit 1; }

echo "--- staging release names ---"
rm -rf dist-electron/rel && mkdir -p dist-electron/rel
cp "dist-electron/The Operator-$V-arm64.dmg"     "dist-electron/rel/The-Operator-mac-apple-silicon.dmg"
cp "dist-electron/The Operator-$V.dmg"           "dist-electron/rel/The-Operator-mac-intel.dmg"
cp "dist-electron/The Operator Setup $V.exe"     "dist-electron/rel/The-Operator-windows.exe"
# Versioned copies + the update manifest, for electron-updater.
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

echo "--- publishing v$V ---"
gh release create "v$V" dist-electron/rel/* --repo "$REPO" --latest \
  --title "The Operator $V" --notes "Pricing, ESV licensing, and church licences. See the commit log." \
  2>/dev/null || gh release upload "v$V" dist-electron/rel/* --repo "$REPO" --clobber

echo "--- verifying the buttons a stranger clicks ---"
for f in The-Operator-mac-apple-silicon.dmg The-Operator-mac-intel.dmg The-Operator-windows.exe; do
  printf "    %-40s HTTP %s\n" "$f" \
    "$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 90 -r 0-255 \
       "https://github.com/$REPO/releases/latest/download/$f")"
done
echo "=== done ==="
