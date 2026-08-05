#!/bin/bash
# Build a ZERO-SETUP beta of The Operator: download, open, study.
#
# WHY THIS EXISTS
# Seven men asked for this tool, were handed free API keys, and two downloaded
# it. Zero studies ran. The app was never the obstacle — the setup was. This
# build carries a key so there is nothing between opening it and using it.
#
#   ./scripts/build-beta.sh                 # key from $OPERATOR_BETA_KEY
#   ./scripts/build-beta.sh --keychain      # key from the macOS Keychain
#
# The key is written to electron/embedded-key.js, baked into the app, and the
# file is DELETED on the way out — including if the build fails or you Ctrl-C.
# It is gitignored, so it can never be committed even if the trap fails.
set -uo pipefail

cd "$(dirname "$0")/.."
KEYFILE="electron/embedded-key.js"

# Delete the key file on ANY exit path. This is the guard that matters: a build
# that dies halfway must not leave a live API key sitting in the working tree.
cleanup() { rm -f "$KEYFILE"; }
trap cleanup EXIT INT TERM

# ── Get the key without ever printing it ─────────────────────────────────────
if [ "${1:-}" = "--keychain" ]; then
  BETA_KEY=$(security find-generic-password -s "operator-beta-key" -w 2>/dev/null || true)
  SRC="the macOS Keychain (operator-beta-key)"
else
  BETA_KEY="${OPERATOR_BETA_KEY:-}"
  SRC="\$OPERATOR_BETA_KEY"
fi

if [ -z "$BETA_KEY" ]; then
  echo "No beta key found in ${SRC}."
  echo
  echo "Store one in the Keychain (it never passes through a terminal argument,"
  echo "so it never lands in your shell history):"
  echo "    security add-generic-password -s 'operator-beta-key' -a \"\$USER\" -w"
  echo "  ...then paste the key at the prompt and press Return."
  echo
  echo "Then: ./scripts/build-beta.sh --keychain"
  exit 1
fi

case "$BETA_KEY" in
  sk-ant-*) ;;
  *) echo "That does not look like an Anthropic key (expected it to start sk-ant-). Refusing."; exit 1 ;;
esac

echo "=== 1. embedding the beta key ==="
# Written with node so the key is passed via the environment and never appears
# in a command line, a shell history, or a process listing.
BETA_KEY="$BETA_KEY" node -e '
const fs = require("fs");
fs.writeFileSync(process.argv[1], [
  "// GENERATED AT BUILD TIME. Gitignored. Deleted when the build exits.",
  "// Do not edit, do not commit, do not copy anywhere.",
  "module.exports = { ANTHROPIC_KEY: " + JSON.stringify(process.env.BETA_KEY) + " }",
  "",
].join("\n"), { mode: 0o600 });
' "$KEYFILE"
echo "  wrote $KEYFILE (mode 600, ${#BETA_KEY} chars, not shown)"

echo
echo "=== 2. confirming git cannot see it ==="
if git check-ignore -q "$KEYFILE"; then
  echo "  ok — gitignored"
else
  echo "  REFUSING: $KEYFILE is NOT gitignored. This repo is PUBLIC."
  exit 1
fi

echo
echo "=== 3. tests ==="
npm run test:release 2>&1 | grep -E "passed|failed|error" | tail -8

echo
echo "=== 4. build + notarize ==="
npx vite build 2>&1 | grep -E "built in|error" | head -2
npx electron-builder --mac --win 2>&1 \
  | grep -viE "password|APPLE_APP" \
  | grep -E "notariz|signing.*Developer ID|building.*target=|Error" | tail -15

echo
echo "=== 5. verifying the key actually made it into the app ==="
APP="dist-electron/mac-arm64/The Operator.app"
if [ -d "$APP" ]; then
  if npx asar list "$APP/Contents/Resources/app.asar" 2>/dev/null | grep -q "embedded-key.js"; then
    echo "  ok — embedded-key.js is inside the packaged app"
  else
    echo "  WARNING: embedded-key.js is NOT in the asar. The beta build will still"
    echo "  ask users for a key, which defeats the entire purpose."
  fi
else
  echo "  (no arm64 app produced — check the build output above)"
fi

echo
echo "Done. The key file is removed on exit by the trap."
echo
echo "REMEMBER what this key is exposed to: anyone who opens the app bundle can"
echo "read it. That is unavoidable in a desktop app. What keeps it safe is the"
echo "blast radius — a dedicated key, in its own workspace, with a hard spend"
echo "cap set low, revocable in one click. Set that cap BEFORE you send this."
