#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

RELEASE_INPUTS=(
  package.json
  vite.mobile.config.ts
  capacitor.config.ts
  mobile
  src
  server/src/iap-products.json
  store/metadata.json
  ios/App/App.xcodeproj/project.pbxproj
  ios/App/App/Info.plist
  ios/App/App/PrivacyInfo.xcprivacy
  android/app/build.gradle
  android/app/src/main/AndroidManifest.xml
)

if [ -n "$(git status --porcelain -- "${RELEASE_INPUTS[@]}")" ]; then
  echo "Mobile release inputs differ from HEAD; refusing to package an irreproducible native build." >&2
  git status --short -- "${RELEASE_INPUTS[@]}" >&2
  echo "Commit and review these inputs before running mobile:sync." >&2
  exit 1
fi

bash scripts/check-release-provenance.sh
echo "Mobile release provenance guard passed: native inputs are committed at HEAD"
