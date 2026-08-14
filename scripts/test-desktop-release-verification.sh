#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

grep -q '^bash scripts/test-desktop-release-verification.sh$' scripts/release.sh

publish_line=$(grep -nF 'gh release edit "$TAG"' scripts/release.sh | cut -d: -f1)
verify_line=$(grep -nF 'bash scripts/verify-desktop-release-assets.sh "$REPO" "$V"' scripts/release.sh | cut -d: -f1)
done_line=$(grep -nF 'echo "=== done ==="' scripts/release.sh | cut -d: -f1)
versioned_arm_dmg_line=$(grep -nF '"dist-electron/rel/The-Operator-$V-arm64.dmg"' scripts/release.sh | cut -d: -f1)
versioned_intel_dmg_line=$(grep -nF '"dist-electron/rel/The-Operator-$V.dmg"' scripts/release.sh | cut -d: -f1)
upload_line=$(grep -nF 'gh release upload "$TAG" dist-electron/rel/*' scripts/release.sh | cut -d: -f1)

test -n "$publish_line"
test -n "$verify_line"
test -n "$done_line"
test -n "$versioned_arm_dmg_line"
test -n "$versioned_intel_dmg_line"
test -n "$upload_line"
test "$versioned_arm_dmg_line" -lt "$upload_line"
test "$versioned_intel_dmg_line" -lt "$upload_line"
test "$publish_line" -lt "$verify_line"
test "$verify_line" -lt "$done_line"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin"

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
PATH="$TMP_DIR/bin:$PATH" OPERATOR_RELEASE_BASE_URL=https://release.invalid/download \
  bash scripts/verify-desktop-release-assets.sh Base1520/Sermon-Study-Tool 9.8.7 \
  > "$TMP_DIR/success.out"
diff -u "$TMP_DIR/expected-assets" "$CURL_LOG"
test "$(grep -c 'HTTP 206' "$TMP_DIR/success.out")" -eq 9

: > "$CURL_LOG"
if PATH="$TMP_DIR/bin:$PATH" OPERATOR_RELEASE_BASE_URL=https://release.invalid/download \
  FAIL_ASSET=latest-mac.yml \
  bash scripts/verify-desktop-release-assets.sh Base1520/Sermon-Study-Tool 9.8.7 \
  > "$TMP_DIR/failure.out" 2> "$TMP_DIR/failure.err"; then
  echo 'Verifier accepted a missing Mac updater manifest.' >&2
  exit 1
fi
grep -Fq 'latest-mac.yml (HTTP 404)' "$TMP_DIR/failure.err"
! grep -Fq 'The-Operator-9.8.7-arm64-mac.zip' "$CURL_LOG"

echo 'Desktop public-release verification passed'
