#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

grep -q '^bash scripts/test-windows-update-manifest.sh$' scripts/release.sh
grep -q '^node server/src/test-stripe-topup.js$' scripts/release.sh

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
cat > "$TMP_DIR/latest.yml" <<'YAML'
version: 1.4.2
files:
  - url: The-Operator-Setup-1.4.2.exe
    sha512: keep-this-hash
    size: 12345
path: The-Operator-Setup-1.4.2.exe
sha512: keep-this-hash
YAML

bash scripts/rewrite-windows-update-manifest.sh "$TMP_DIR/latest.yml" "$TMP_DIR/rewritten.yml"
grep -q 'url: The-Operator-windows.exe' "$TMP_DIR/rewritten.yml"
grep -q 'path: The-Operator-windows.exe' "$TMP_DIR/rewritten.yml"
test "$(grep -c 'keep-this-hash' "$TMP_DIR/rewritten.yml")" -eq 2
! grep -q 'The-Operator-Setup-1.4.2.exe' "$TMP_DIR/rewritten.yml"
echo 'Windows update manifest rewrite passed'
