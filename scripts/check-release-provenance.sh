#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
WORKTREE_VERSION=${1:-$(node -p "require('./package.json').version")}

if ! HEAD_PACKAGE=$(git show HEAD:package.json 2>/dev/null); then
  echo "Cannot read package.json from HEAD; refusing to publish an uncommitted release." >&2
  exit 1
fi

HEAD_VERSION=$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).version || "")' <<<"$HEAD_PACKAGE")

if [ "$HEAD_VERSION" != "$WORKTREE_VERSION" ]; then
  echo "Release version $WORKTREE_VERSION is not committed at HEAD (HEAD declares $HEAD_VERSION)." >&2
  echo "Commit and review the version bump before creating a release tag." >&2
  exit 1
fi

echo "Release provenance guard passed: v$WORKTREE_VERSION is declared at HEAD"
