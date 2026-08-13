#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

guard_line=$(grep -nF 'bash scripts/check-release-provenance.sh "$V"' scripts/release.sh | cut -d: -f1)
publish_line=$(grep -nF 'gh release edit "$TAG"' scripts/release.sh | cut -d: -f1)
test -n "$guard_line"
test -n "$publish_line"
test "$guard_line" -lt "$publish_line"
! grep -Fq 'gh release create' scripts/release.sh
grep -F 'gh release edit "$TAG"' scripts/release.sh | grep -Fq -- '--verify-tag'

PROBE_DIR=$(mktemp -d)
REMOTE_DIR=$(mktemp -d)/release-guard.git
trap 'rm -rf "$PROBE_DIR" "$(dirname "$REMOTE_DIR")"' EXIT
mkdir -p "$PROBE_DIR/scripts"
cp scripts/check-release-provenance.sh "$PROBE_DIR/scripts/"
printf '{"version":"1.4.2"}\n' > "$PROBE_DIR/package.json"
git -C "$PROBE_DIR" init -q
git -C "$PROBE_DIR" add package.json scripts/check-release-provenance.sh
git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' commit -qm 'fixture'
git init --bare -q "$REMOTE_DIR"
git -C "$PROBE_DIR" branch -M main
git -C "$PROBE_DIR" remote add origin "$REMOTE_DIR"
git -C "$PROBE_DIR" push -qu origin main

bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null

git -C "$PROBE_DIR" remote set-url origin "$(dirname "$REMOTE_DIR")/missing.git"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard trusted a stale upstream after fetch failed' >&2
  exit 1
fi
git -C "$PROBE_DIR" remote set-url origin "$REMOTE_DIR"

printf '{"version":"1.4.3"}\n' > "$PROBE_DIR/package.json"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted an uncommitted version bump' >&2
  exit 1
fi

git -C "$PROBE_DIR" add package.json
git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' commit -qm 'bump without push'
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted a committed but unpushed version bump' >&2
  exit 1
fi

git -C "$PROBE_DIR" push -q
bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null

echo 'Release provenance guard passed'
