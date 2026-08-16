#!/usr/bin/env bash
set -euo pipefail

APP=${1:?Usage: verify-macos-app-bundle.sh <path-to-app> [expected-app-id] [expected-team-id]}
EXPECTED_APP_ID=${2:-com.base1520.theoperator}
EXPECTED_TEAM_ID=${3:-6UP72M96Q5}
CODESIGN_BIN=${CODESIGN_BIN:-/usr/bin/codesign}
CODESIGN_CONTROL_APP=${CODESIGN_CONTROL_APP:-/System/Applications/TextEdit.app}
UPDATER_CONFIG="$APP/Contents/Resources/app-update.yml"

if [ ! -d "$APP" ]; then
  echo "Mac app bundle does not exist: $APP" >&2
  exit 1
fi

# electron-updater reads this file from the signed Resources directory. Adding
# it after signing breaks the resource seal; omitting it leaves updates dormant.
# Require it before the signature check so either packaging error fails closed.
if [ -L "$UPDATER_CONFIG" ]; then
  echo "Mac app bundle updater configuration must be a direct regular file, not a symlink: $UPDATER_CONFIG" >&2
  exit 1
fi
if [ ! -f "$UPDATER_CONFIG" ]; then
  echo "Mac app bundle is missing Contents/Resources/app-update.yml; package updater configuration before signing." >&2
  exit 1
fi

# Existence alone is not configuration: electron-updater will accept this
# package file as its runtime authority. Require the exact flat mapping emitted
# by Electron Builder for Operator's official GitHub channel. Deep equality is
# deliberate: duplicate keys, alternate providers/repos, unexpected redirect
# fields, nested YAML, and empty files all fail before signature checks.
if ! node --input-type=module - "$UPDATER_CONFIG" <<'NODE'
import fs from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { load } from 'js-yaml'

const expected = {
  owner: 'Base1520',
  repo: 'Sermon-Study-Tool',
  provider: 'github',
  updaterCacheDirName: 'the-operator-updater',
}

let valid = false
try {
  const source = fs.readFileSync(process.argv[2], 'utf8')
  valid = isDeepStrictEqual(load(source), expected)
} catch {
  valid = false
}

if (!valid) process.exit(1)
NODE
then
  echo "Mac app bundle updater configuration must exactly target github/Base1520/Sermon-Study-Tool with cache the-operator-updater: $UPDATER_CONFIG" >&2
  exit 1
fi

if [ ! -d "$CODESIGN_CONTROL_APP" ]; then
  echo "macOS code-signature verifier control is unavailable: $CODESIGN_CONTROL_APP" >&2
  exit 1
fi
if ! "$CODESIGN_BIN" --verify --deep --strict --verbose=4 "$CODESIGN_CONTROL_APP"; then
  echo "macOS code-signature verifier failed its known Apple-signed control; refusing to evaluate $APP." >&2
  exit 1
fi

if ! "$CODESIGN_BIN" --verify --deep --strict --verbose=4 "$APP"; then
  echo "Mac app bundle fails strict code-signature verification: $APP" >&2
  exit 1
fi

if ! SIGNATURE_INFO=$("$CODESIGN_BIN" -d --verbose=4 "$APP" 2>&1); then
  echo "Mac app bundle signature metadata could not be read: $APP" >&2
  exit 1
fi
ACTUAL_APP_ID=$(awk -F= '$1 == "Identifier" { print $2; exit }' <<<"$SIGNATURE_INFO")
ACTUAL_TEAM_ID=$(awk -F= '$1 == "TeamIdentifier" { print $2; exit }' <<<"$SIGNATURE_INFO")

if [ "$ACTUAL_APP_ID" != "$EXPECTED_APP_ID" ]; then
  echo "Mac app bundle identifier is ${ACTUAL_APP_ID:-<empty>}, expected $EXPECTED_APP_ID." >&2
  exit 1
fi
if [ "$ACTUAL_TEAM_ID" != "$EXPECTED_TEAM_ID" ]; then
  echo "Mac app bundle TeamIdentifier is ${ACTUAL_TEAM_ID:-<empty>}, expected $EXPECTED_TEAM_ID." >&2
  exit 1
fi

echo "    signed + updater-configured: $APP"
