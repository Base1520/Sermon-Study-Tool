#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! grep -Fq 'bash scripts/check-mobile-release-provenance.sh' package.json; then
  echo "mobile:sync does not invoke the mobile provenance guard" >&2
  exit 1
fi

PROBE_ROOT=$(mktemp -d)
PROBE_DIR="$PROBE_ROOT/project"
REMOTE_DIR="$PROBE_ROOT/remote.git"
trap 'rm -rf "$PROBE_ROOT"' EXIT
mkdir -p "$PROBE_DIR/scripts" "$PROBE_DIR/mobile" "$PROBE_DIR/src/mobile" "$PROBE_DIR/src/components" "$PROBE_DIR/src/types" "$PROBE_DIR/src/assets" "$PROBE_DIR/server/src" "$PROBE_DIR/store" "$PROBE_DIR/ios/App/App.xcodeproj" "$PROBE_DIR/ios/App/App" "$PROBE_DIR/android/app/src/main"
cp package.json package-lock.json vite.mobile.config.ts capacitor.config.ts "$PROBE_DIR/"
cp scripts/check-release-provenance.sh scripts/check-mobile-release-provenance.sh "$PROBE_DIR/scripts/"
cp mobile/index.html mobile/main.tsx "$PROBE_DIR/mobile/"
cp src/mobile/store.ts "$PROBE_DIR/src/mobile/"
cp src/components/PlainRead.tsx src/components/ErrorBoundary.tsx "$PROBE_DIR/src/components/"
cp src/types/phrasing.ts "$PROBE_DIR/src/types/"
cp src/assets/b-icon.png "$PROBE_DIR/src/assets/"
cp src/theme.ts "$PROBE_DIR/src/"
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
git init --bare -q "$REMOTE_DIR"
git -C "$PROBE_DIR" branch -M main
git -C "$PROBE_DIR" remote add origin "$REMOTE_DIR"
git -C "$PROBE_DIR" push -qu origin main

bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null

printf '\n// deliberate release-input mutation\n' >> "$PROBE_DIR/src/mobile/store.ts"
tail -n 1 "$PROBE_DIR/src/mobile/store.ts"
if bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null 2>&1; then
  echo "mobile provenance guard accepted a modified release input" >&2
  exit 1
fi

git -C "$PROBE_DIR" checkout -q -- src/mobile/store.ts
printf '\n// deliberate formerly-uncovered import mutation\n' >> "$PROBE_DIR/src/components/PlainRead.tsx"
tail -n 1 "$PROBE_DIR/src/components/PlainRead.tsx"
if bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null 2>&1; then
  echo "mobile provenance guard accepted a modified imported bundle input" >&2
  exit 1
fi

git -C "$PROBE_DIR" checkout -q -- src/components/PlainRead.tsx
printf '\n// deliberate transitive release-input mutation\n' >> "$PROBE_DIR/src/theme.ts"
tail -n 1 "$PROBE_DIR/src/theme.ts"
if bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null 2>&1; then
  echo "mobile provenance guard accepted a modified transitive bundle input" >&2
  exit 1
fi

git -C "$PROBE_DIR" checkout -q -- src/theme.ts
printf '\n// deliberate mobile-entrypoint mutation\n' >> "$PROBE_DIR/mobile/main.tsx"
tail -n 1 "$PROBE_DIR/mobile/main.tsx"
if bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null 2>&1; then
  echo "mobile provenance guard accepted a modified mobile entrypoint" >&2
  exit 1
fi

git -C "$PROBE_DIR" checkout -q -- mobile/main.tsx
printf '\n ' >> "$PROBE_DIR/package-lock.json"
tail -c 8 "$PROBE_DIR/package-lock.json"
printf '\n'
if bash "$PROBE_DIR/scripts/check-mobile-release-provenance.sh" >/dev/null 2>&1; then
  echo "mobile provenance guard accepted a modified dependency lockfile" >&2
  exit 1
fi

echo "mobile release provenance guard passed mutation test"
