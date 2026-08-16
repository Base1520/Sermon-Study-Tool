#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  printf 'Desktop release verification failed: %s\n' "$1" >&2
  exit 1
}

require() {
  local message=$1
  shift
  if ! "$@"; then
    fail "$message"
  fi
}

node -e 'const command = "bash scripts/test-desktop-release-verification.sh"; const steps = require("./package.json").scripts["test:release"].split(/\s*&&\s*/); if (steps.filter((step) => step === command).length !== 1) throw new Error("test:release must invoke the desktop release verifier exactly once")'
if ! release_source=$(< scripts/release.sh); then
  fail 'release.sh must be readable for structural verification'
fi
require 'release.sh must retain its explicit desktop release verifier test call' \
  grep -q '^bash scripts/test-desktop-release-verification.sh$' <<< "$release_source"

publish_line=$(grep -nF 'gh release edit "$TAG"' <<< "$release_source" | cut -d: -f1 || true)
verify_line=$(grep -nF 'bash scripts/verify-desktop-release-assets.sh "$REPO" "$V"' <<< "$release_source" | cut -d: -f1 || true)
done_line=$(grep -nF 'echo "=== done ==="' <<< "$release_source" | cut -d: -f1 || true)
versioned_arm_dmg_line=$(grep -nF '"dist-electron/rel/The-Operator-$V-arm64.dmg"' <<< "$release_source" | cut -d: -f1 || true)
versioned_intel_dmg_line=$(grep -nF '"dist-electron/rel/The-Operator-$V.dmg"' <<< "$release_source" | cut -d: -f1 || true)
upload_line=$(grep -nF 'scripts/upload-release-assets-by-id.sh "$REPO" "$RELEASE_ID" "$TAG" "$RELEASE_UPLOAD_URL" dist-electron/rel/*' <<< "$release_source" | cut -d: -f1 || true)
bundle_verify_line=$(grep -nF 'CODESIGN_BIN=/usr/bin/codesign CODESIGN_CONTROL_APP=/System/Applications/TextEdit.app \' <<< "$release_source" | cut -d: -f1 || true)
bundle_verify_call_line=$(grep -nF 'bash scripts/verify-macos-app-bundle.sh "$APP"' <<< "$release_source" | cut -d: -f1 || true)
gatekeeper_line=$(grep -nF 'spctl -a -vvv -t install "$APP"' <<< "$release_source" | cut -d: -f1 || true)
build_line=$(grep -nF 'npm run build >/tmp/rel-mac.log' <<< "$release_source" | cut -d: -f1 || true)
release_suite_line=$(grep -nF 'npm run test:release >/tmp/rel-gate.log' <<< "$release_source" | cut -d: -f1 || true)
staging_line=$(grep -nF 'echo "--- staging release names ---"' <<< "$release_source" | cut -d: -f1 || true)

require 'release.sh must publish the completed draft' test -n "$publish_line"
require 'release.sh must verify public desktop assets after publication' test -n "$verify_line"
require 'release.sh must retain its completion marker' test -n "$done_line"
require 'release.sh must stage the versioned arm64 DMG' test -n "$versioned_arm_dmg_line"
require 'release.sh must stage the versioned Intel DMG' test -n "$versioned_intel_dmg_line"
require 'release.sh must upload through the immutable release-id helper' test -n "$upload_line"
require 'release.sh must pin the production codesign tool and Apple control app' test -n "$bundle_verify_line"
require 'release.sh must invoke the Mac bundle verifier' test -n "$bundle_verify_call_line"
require 'release.sh must retain its Gatekeeper check' test -n "$gatekeeper_line"
require 'release.sh must retain its Mac build' test -n "$build_line"
require 'release.sh must run the canonical release suite' test -n "$release_suite_line"
require 'release.sh must retain the release-name staging phase' test -n "$staging_line"
require 'arm64 versioned DMG must be staged before upload' test "$versioned_arm_dmg_line" -lt "$upload_line"
require 'Intel versioned DMG must be staged before upload' test "$versioned_intel_dmg_line" -lt "$upload_line"
require 'canonical release suite must run before the Mac build' test "$release_suite_line" -lt "$build_line"
require 'Mac bundle verification must run after the Mac build' test "$build_line" -lt "$bundle_verify_line"
require 'pinned codesign configuration must precede the bundle verifier call' test "$bundle_verify_line" -lt "$bundle_verify_call_line"
require 'Mac bundle verifier must run before release-name staging' test "$bundle_verify_call_line" -lt "$staging_line"
require 'pinned codesign configuration must appear before release-name staging' test "$bundle_verify_line" -lt "$staging_line"
require 'release-name staging must precede Gatekeeper verification' test "$staging_line" -lt "$gatekeeper_line"
require 'Mac bundle verification must precede upload' test "$bundle_verify_line" -lt "$upload_line"
require 'publication must precede public desktop asset verification' test "$publish_line" -lt "$verify_line"
require 'public desktop asset verification must precede completion' test "$verify_line" -lt "$done_line"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin"

cat > "$TMP_DIR/bin/codesign" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
{
  printf 'argc=%s' "$#"
  for argument in "$@"; do
    printf ' argv=%q' "$argument"
  done
  printf '\n'
} >> "$CODESIGN_LOG"
case "${1:-}" in
  --verify)
    if [ "${CODESIGN_VERIFY_FAIL_PATH:-}" = "${!#}" ]; then
      echo 'mock invalid signature' >&2
      exit 1
    fi
    ;;
  -d)
    printf 'Identifier=%s\n' "${CODESIGN_APP_ID:-com.base1520.theoperator}" >&2
    printf 'TeamIdentifier=%s\n' "${CODESIGN_TEAM_ID:-6UP72M96Q5}" >&2
    ;;
  *)
    echo "Unexpected codesign arguments: $*" >&2
    exit 2
    ;;
esac
MOCK
chmod +x "$TMP_DIR/bin/codesign"

TEST_APP="$TMP_DIR/The Operator.app"
CONTROL_APP="$TMP_DIR/TextEdit.app"
mkdir -p "$TEST_APP/Contents/Resources"
mkdir -p "$CONTROL_APP"
LC_ALL=C printf -v control_app_q '%q' "$CONTROL_APP"
LC_ALL=C printf -v test_app_q '%q' "$TEST_APP"
expected_control_call="argc=5 argv=--verify argv=--deep argv=--strict argv=--verbose=4 argv=$control_app_q"
expected_target_call="argc=5 argv=--verify argv=--deep argv=--strict argv=--verbose=4 argv=$test_app_q"
expected_metadata_call="argc=3 argv=-d argv=--verbose=4 argv=$test_app_q"
write_valid_updater_config() {
  rm -f "$TEST_APP/Contents/Resources/app-update.yml"
  cat > "$TEST_APP/Contents/Resources/app-update.yml" <<'CONFIG'
# Electron Builder may reorder or quote equivalent YAML scalars.
provider: "github"
updaterCacheDirName: the-operator-updater
repo: 'Sermon-Study-Tool'
owner: Base1520
CONFIG
}
write_valid_updater_config
export CODESIGN_LOG="$TMP_DIR/codesign.log"
CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-success.out"
require 'Mac verifier must preserve the exact known Apple control argv boundaries' \
  grep -Fxq -- "$expected_control_call" "$CODESIGN_LOG"
require 'Mac verifier must preserve the exact target verification argv boundaries' \
  grep -Fxq -- "$expected_target_call" "$CODESIGN_LOG"
require 'Mac verifier must preserve the target app as one signing-metadata argv element' \
  grep -Fxq -- "$expected_metadata_call" "$CODESIGN_LOG"
require 'Mac verifier must report a successful signed and updater-configured bundle' \
  grep -Fq "signed + updater-configured: $TEST_APP" "$TMP_DIR/mac-bundle-success.out"

rm "$TEST_APP/Contents/Resources/app-update.yml"
: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-missing-updater.out" 2> "$TMP_DIR/mac-bundle-missing-updater.err"; then
  echo 'Mac bundle verifier accepted an app without updater configuration.' >&2
  exit 1
fi
require 'missing updater configuration must produce its named refusal' \
  grep -Fq 'package updater configuration before signing' "$TMP_DIR/mac-bundle-missing-updater.err"
require 'missing updater configuration must refuse before any codesign call' test ! -s "$CODESIGN_LOG"

: > "$TEST_APP/Contents/Resources/app-update.yml"
: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-empty-updater.out" 2> "$TMP_DIR/mac-bundle-empty-updater.err"; then
  echo 'Mac bundle verifier accepted an empty updater configuration.' >&2
  exit 1
fi
require 'empty updater configuration must produce its named refusal' \
  grep -Fq 'must exactly target github/Base1520/Sermon-Study-Tool' "$TMP_DIR/mac-bundle-empty-updater.err"
require 'empty updater configuration must refuse before any codesign call' test ! -s "$CODESIGN_LOG"

cat > "$TEST_APP/Contents/Resources/app-update.yml" <<'CONFIG'
owner: Base1520
repo: Wrong-Repository
provider: github
updaterCacheDirName: the-operator-updater
CONFIG
: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-wrong-updater.out" 2> "$TMP_DIR/mac-bundle-wrong-updater.err"; then
  echo 'Mac bundle verifier accepted updater configuration for the wrong repository.' >&2
  exit 1
fi
require 'wrong updater target must produce its named refusal' \
  grep -Fq 'must exactly target github/Base1520/Sermon-Study-Tool' "$TMP_DIR/mac-bundle-wrong-updater.err"
require 'wrong updater target must refuse before any codesign call' test ! -s "$CODESIGN_LOG"

cat > "$TEST_APP/Contents/Resources/app-update.yml" <<'CONFIG'
owner: Base1520
repo: Sermon-Study-Tool
provider: github
provider: github
updaterCacheDirName: the-operator-updater
CONFIG
: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-duplicate-updater.out" 2> "$TMP_DIR/mac-bundle-duplicate-updater.err"; then
  echo 'Mac bundle verifier accepted duplicate updater authority.' >&2
  exit 1
fi
require 'duplicate updater authority must produce its named refusal' \
  grep -Fq 'must exactly target github/Base1520/Sermon-Study-Tool' "$TMP_DIR/mac-bundle-duplicate-updater.err"
require 'duplicate updater authority must refuse before any codesign call' test ! -s "$CODESIGN_LOG"

cat > "$TEST_APP/Contents/Resources/app-update.yml" <<'CONFIG'
owner: Base1520
repo: Sermon-Study-Tool
provider: github
updaterCacheDirName: the-operator-updater
host: attacker.invalid
CONFIG
: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-extra-updater.out" 2> "$TMP_DIR/mac-bundle-extra-updater.err"; then
  echo 'Mac bundle verifier accepted an extra updater redirect field.' >&2
  exit 1
fi
require 'extra updater redirect field must produce its named refusal' \
  grep -Fq 'must exactly target github/Base1520/Sermon-Study-Tool' "$TMP_DIR/mac-bundle-extra-updater.err"
require 'extra updater redirect field must refuse before any codesign call' test ! -s "$CODESIGN_LOG"

cat > "$TMP_DIR/symlinked-app-update.yml" <<'CONFIG'
owner: Base1520
repo: Sermon-Study-Tool
provider: github
updaterCacheDirName: the-operator-updater
token: SENTINEL_MUST_NOT_APPEAR
CONFIG
rm -f "$TEST_APP/Contents/Resources/app-update.yml"
ln -s "$TMP_DIR/symlinked-app-update.yml" "$TEST_APP/Contents/Resources/app-update.yml"
: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-symlink-updater.out" 2> "$TMP_DIR/mac-bundle-symlink-updater.err"; then
  echo 'Mac bundle verifier accepted a symlinked updater configuration.' >&2
  exit 1
fi
require 'symlinked updater configuration must produce its named refusal' \
  grep -Fq 'must be a direct regular file, not a symlink' "$TMP_DIR/mac-bundle-symlink-updater.err"
require 'symlinked updater configuration must refuse before any codesign call' test ! -s "$CODESIGN_LOG"
require 'symlinked updater refusal must not disclose target contents' \
  test "$(grep -F 'SENTINEL_MUST_NOT_APPEAR' "$TMP_DIR/mac-bundle-symlink-updater.out" "$TMP_DIR/mac-bundle-symlink-updater.err" 2>/dev/null | wc -l | tr -d ' ')" -eq 0

write_valid_updater_config
: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  CODESIGN_VERIFY_FAIL_PATH="$CONTROL_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-bad-verifier.out" 2> "$TMP_DIR/mac-bundle-bad-verifier.err"; then
  echo 'Mac bundle verifier trusted an unhealthy local code-signing evaluator.' >&2
  exit 1
fi
require 'unhealthy local verifier must produce its named refusal' \
  grep -Fq 'verifier failed its known Apple-signed control' "$TMP_DIR/mac-bundle-bad-verifier.err"
require 'unhealthy local verifier must stop after the control call' \
  test "$(wc -l < "$CODESIGN_LOG" | tr -d ' ')" -eq 1

: > "$CODESIGN_LOG"
if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" \
  CODESIGN_VERIFY_FAIL_PATH="$TEST_APP" \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-bad-signature.out" 2> "$TMP_DIR/mac-bundle-bad-signature.err"; then
  echo 'Mac bundle verifier accepted a failed strict signature check.' >&2
  exit 1
fi
require 'invalid target signature must produce its named refusal' \
  grep -Fq 'fails strict code-signature verification' "$TMP_DIR/mac-bundle-bad-signature.err"
require 'invalid target signature must stop after control and target calls' \
  test "$(wc -l < "$CODESIGN_LOG" | tr -d ' ')" -eq 2

if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" CODESIGN_TEAM_ID=WRONGTEAM \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-wrong-team.out" 2> "$TMP_DIR/mac-bundle-wrong-team.err"; then
  echo 'Mac bundle verifier accepted the wrong signing team.' >&2
  exit 1
fi
require 'wrong signing team must produce its named refusal' \
  grep -Fq 'TeamIdentifier is WRONGTEAM, expected 6UP72M96Q5' "$TMP_DIR/mac-bundle-wrong-team.err"

if CODESIGN_BIN="$TMP_DIR/bin/codesign" CODESIGN_CONTROL_APP="$CONTROL_APP" CODESIGN_APP_ID=com.example.wrong \
  bash scripts/verify-macos-app-bundle.sh "$TEST_APP" \
  > "$TMP_DIR/mac-bundle-wrong-id.out" 2> "$TMP_DIR/mac-bundle-wrong-id.err"; then
  echo 'Mac bundle verifier accepted the wrong app identifier.' >&2
  exit 1
fi
require 'wrong bundle identifier must produce its named refusal' \
  grep -Fq 'identifier is com.example.wrong, expected com.base1520.theoperator' "$TMP_DIR/mac-bundle-wrong-id.err"

cat > "$TMP_DIR/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
url=${!#}
asset=${url##*/}
printf '%s\n' "$asset" >> "$CURL_LOG"
if [ "${FAIL_ASSET:-}" = "$asset" ]; then
  printf '404'
else
  printf '206'
fi
MOCK
chmod +x "$TMP_DIR/bin/curl"

cat > "$TMP_DIR/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$GH_LOG"
if [ "${GH_API_FAIL:-0}" = "1" ]; then
  exit 1
fi
printf '%s\n' "${GH_LATEST_TAG:-}"
MOCK
chmod +x "$TMP_DIR/bin/gh"

cat > "$TMP_DIR/expected-assets" <<'EXPECTED'
The-Operator-mac-apple-silicon.dmg
The-Operator-mac-intel.dmg
The-Operator-9.8.7-arm64.dmg
The-Operator-9.8.7.dmg
The-Operator-windows.exe
latest.yml
latest-mac.yml
The-Operator-9.8.7-arm64-mac.zip
The-Operator-9.8.7-mac.zip
EXPECTED

export CURL_LOG="$TMP_DIR/curl.log"
export GH_LOG="$TMP_DIR/gh.log"
PATH="$TMP_DIR/bin:$PATH" GH_LATEST_TAG=v9.8.7 \
  OPERATOR_RELEASE_BASE_URL=https://release.invalid/download \
  bash scripts/verify-desktop-release-assets.sh Base1520/Sermon-Study-Tool 9.8.7 \
  > "$TMP_DIR/success.out"
grep -Fxq "api repos/Base1520/Sermon-Study-Tool/releases/latest --jq .tag_name" "$GH_LOG"
grep -Fq "GitHub latest release                    v9.8.7" "$TMP_DIR/success.out"
diff -u "$TMP_DIR/expected-assets" "$CURL_LOG"
test "$(grep -c 'HTTP 206' "$TMP_DIR/success.out")" -eq 9

: > "$CURL_LOG"
if PATH="$TMP_DIR/bin:$PATH" GH_LATEST_TAG=v9.8.6 \
  OPERATOR_RELEASE_BASE_URL=https://release.invalid/download \
  bash scripts/verify-desktop-release-assets.sh Base1520/Sermon-Study-Tool 9.8.7 \
  > "$TMP_DIR/latest-stale.out" 2> "$TMP_DIR/latest-stale.err"; then
  echo 'Public verifier accepted a stale GitHub latest-release alias.' >&2
  exit 1
fi
grep -Fq "Release v9.8.7 may already be public" "$TMP_DIR/latest-stale.err"
grep -Fq "points to v9.8.6" "$TMP_DIR/latest-stale.err"
test ! -s "$CURL_LOG"

if PATH="$TMP_DIR/bin:$PATH" GH_API_FAIL=1 \
  OPERATOR_RELEASE_BASE_URL=https://release.invalid/download \
  bash scripts/verify-desktop-release-assets.sh Base1520/Sermon-Study-Tool 9.8.7 \
  > "$TMP_DIR/latest-api-failure.out" 2> "$TMP_DIR/latest-api-failure.err"; then
  echo 'Public verifier accepted a failed GitHub latest-release API read.' >&2
  exit 1
fi
grep -Fq "latest-release alias could not be read" "$TMP_DIR/latest-api-failure.err"
test ! -s "$CURL_LOG"

if PATH="$TMP_DIR/bin:$PATH" GH_LATEST_TAG=v9.8.7 \
  OPERATOR_RELEASE_BASE_URL=https://release.invalid/download \
  FAIL_ASSET=latest-mac.yml \
  bash scripts/verify-desktop-release-assets.sh Base1520/Sermon-Study-Tool 9.8.7 \
  > "$TMP_DIR/failure.out" 2> "$TMP_DIR/failure.err"; then
  echo 'Verifier accepted a missing Mac updater manifest.' >&2
  exit 1
fi
grep -Fq 'latest-mac.yml (HTTP 404)' "$TMP_DIR/failure.err"
! grep -Fq 'The-Operator-9.8.7-arm64-mac.zip' "$CURL_LOG"

echo 'Desktop public-release verification passed'
