#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! grep -Fq 'bash scripts/check-mobile-release-provenance.sh' package.json; then
  echo "mobile:sync does not invoke the mobile provenance guard" >&2
  exit 1
fi

PROBE_DIR=$(mktemp -d)
trap 'rm -rf "$PROBE_DIR"' EXIT
mkdir -p "$PROBE_DIR/scripts" "$PROBE_DIR/src/mobile" "$PROBE_DIR/server/src" "$PROBE_DIR/store" "$PROBE_DIR/ios/App/App.xcodeproj" "$PROBE_DIR/ios/App/App" "$PROBE_DIR/android/app/src/main"
cp package.json vite.mobile.config.ts capacitor.config.ts "$PROBE_DIR/"
cp scripts/check-release-provenance.sh scripts/check-mobile-release-provenance.sh "$PROBE_DIR/scripts/"
cp src/mobile/store.ts "$PROBE_DIR/src/mobile/"
cp server/src/iap-products.json "$PROBE_DIR/server/src/"
cp store/metadata.json "$PROBE_DIR/store/"
cp ios/App/App.xcodeproj/project.pbxproj "$PROBE_DIR/ios/App/App.xcodeproj/"
cp ios/App/App/Info.plist ios/App/App/PrivacyInfo.xcprivacy "$PROBE_DIR/ios/App/App/"
cp android/app/build.gradle "$PROBE_DIR/android/app/"
cp android/app/src/main/AndroidManifest.xml "$PROBE_DIR/android/app/src/main/"

git -C "$PROBE_DIR" init -q
git -C "$PROBE_DIR" config user.email test@example.invalid
git -C "$PROBE_DIR" config user.name "Release Guard Test"
git -C "$PROBE_DIR" add .
git -C "$PROBE_DIR" commit -qm baseline

bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null

printf '\n// deliberate release-input mutation\n' >> "$PROBE_DIR/src/mobile/store.ts"
tail -n 1 "$PROBE_DIR/src/mobile/store.ts"
if bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null 2>&1; then
  echo "mobile provenance guard accepted a modified release input" >&2
  exit 1
fi

echo "mobile release provenance guard passed mutation test"
