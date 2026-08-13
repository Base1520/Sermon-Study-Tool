#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

guard_line=$(grep -nF 'bash scripts/check-release-provenance.sh "$V"' scripts/release.sh | cut -d: -f1)
publish_line=$(grep -nF 'gh release create "v$V"' scripts/release.sh | cut -d: -f1)
test -n "$guard_line"
test -n "$publish_line"
test "$guard_line" -lt "$publish_line"

PROBE_DIR=$(mktemp -d)
trap 'rm -rf "$PROBE_DIR"' EXIT
mkdir -p "$PROBE_DIR/scripts"
cp scripts/check-release-provenance.sh "$PROBE_DIR/scripts/"
printf '{"version":"1.4.2"}\n' > "$PROBE_DIR/package.json"
git -C "$PROBE_DIR" init -q
git -C "$PROBE_DIR" add package.json scripts/check-release-provenance.sh
git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' commit -qm 'fixture'

bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null

printf '{"version":"1.4.3"}\n' > "$PROBE_DIR/package.json"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted an uncommitted version bump' >&2
  exit 1
fi

echo 'Release provenance guard passed'
