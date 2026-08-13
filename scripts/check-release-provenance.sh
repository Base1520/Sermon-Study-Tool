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

# THE RELEASE COMMIT MUST EXIST ON THE REMOTE.
#
# WHAT WENT WRONG ONCE: `gh release create` used to run without `--target`, so
# GitHub created the missing tag from the REMOTE default branch while everything
# above inspected only LOCAL HEAD. v1.4.1 and v1.4.2 both point at b96313f, a
# commit whose package.json declares 1.4.0 — the bumps were committed locally and
# never pushed, so two releases shipped tagged to source that cannot build them,
# and the auto-updater (autoDownload + autoInstallOnAppQuit) carried them to every
# installed copy.
#
# WHY THIS CHECK STILL EARNS ITS KEEP: release.sh now pins `--target
# "$RELEASE_COMMIT"`, so the tag can no longer drift to a different commit. That
# closes the drift, not the reachability. A tag pinned to a commit that exists
# ONLY on this laptop points at an object no one else can fetch: unreproducible
# for anyone but the machine that built it, and gone entirely if the laptop is.
# `--target` guarantees the tag names the right commit; this guarantees that
# commit is somewhere other than here.
#
# A release whose tag does not build it cannot be audited, reverted to, or
# reproduced — the exact condition that put an Apple build under a permanent
# do-not-submit order.
REMOTE=${RELEASE_REMOTE:-origin}
if ! UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null); then
  echo "This branch has no upstream, so the release tag would be cut from an unknown commit." >&2
  echo "Set an upstream and push before releasing." >&2
  exit 1
fi

case "$UPSTREAM" in
  "$REMOTE"/*) ;;
  *)
    echo "This branch tracks $UPSTREAM, not $REMOTE; refusing to infer the release target." >&2
    exit 1
    ;;
esac

if ! git fetch "$REMOTE" --quiet; then
  echo "Could not refresh $REMOTE; refusing to trust a potentially stale upstream ref." >&2
  exit 1
fi
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse '@{upstream}' 2>/dev/null || echo '')

if [ -z "$REMOTE_HEAD" ]; then
  echo "Could not resolve the upstream commit; refusing to publish a tag from an unverified remote." >&2
  exit 1
fi

if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  echo "Local HEAD and the remote disagree, so the release tag would NOT be built from what you tested." >&2
  echo "  local  HEAD: $(git rev-parse --short HEAD)" >&2
  echo "  upstream   : $(git rev-parse --short '@{upstream}')" >&2
  echo "Push the release commit first. This is the exact defect that tagged v1.4.1 and v1.4.2" >&2
  echo "to b96313f, a commit declaring 1.4.0." >&2
  exit 1
fi

# The remote is what will be tagged, so the version claim has to hold THERE too.
REMOTE_VERSION=$(git show '@{upstream}:package.json' 2>/dev/null \
  | node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).version || "")' 2>/dev/null || echo '')
if [ "$REMOTE_VERSION" != "$WORKTREE_VERSION" ]; then
  echo "The commit that will be tagged declares $REMOTE_VERSION, not $WORKTREE_VERSION." >&2
  exit 1
fi

echo "Release provenance guard passed: v$WORKTREE_VERSION is declared at HEAD and pushed to $REMOTE"
