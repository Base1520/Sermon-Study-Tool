#!/usr/bin/env bash
set -euo pipefail

INPUT=${1:?input latest.yml required}
OUTPUT=${2:?output latest.yml required}

sed -E 's|The-Operator-Setup-[0-9.]+\.exe|The-Operator-windows.exe|g' "$INPUT" > "$OUTPUT"

grep -q 'url: The-Operator-windows.exe' "$OUTPUT"
grep -q 'path: The-Operator-windows.exe' "$OUTPUT"
if grep -q 'The-Operator-Setup-' "$OUTPUT"; then
  echo 'Windows update manifest still references a versioned installer' >&2
  exit 1
fi
