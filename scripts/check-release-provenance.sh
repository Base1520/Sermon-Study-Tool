#!/usr/bin/env bash
set -euo pipefail

# Resolve the guard's own checkout before any relative cd. Bash otherwise lets
# an inherited CDPATH redirect `cd scripts/..` into a different, clean clone.
unset CDPATH
INVOCATION_ROOT=$(pwd -P)
SCRIPT_PATH=${BASH_SOURCE[0]}
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH="$INVOCATION_ROOT/$SCRIPT_PATH" ;;
esac
if ! SCRIPT_PATH=$(/bin/realpath "$SCRIPT_PATH"); then
  echo "Could not resolve the physical release guard path." >&2
  exit 1
fi
SCRIPT_DIR=${SCRIPT_PATH%/*}
if [ "$SCRIPT_DIR" = "$SCRIPT_PATH" ]; then
  SCRIPT_DIR=$INVOCATION_ROOT
fi
if ! cd -- "$SCRIPT_DIR/.."; then
  echo "Could not enter the repository containing this release guard." >&2
  exit 1
fi
REPOSITORY_ROOT=$(pwd -P)
GIT_BIN=/usr/bin/git
CANONICAL_REPOSITORY=Base1520/Sermon-Study-Tool
CANONICAL_REMOTE=origin
CANONICAL_BRANCH=main
CANONICAL_UPSTREAM="$CANONICAL_REMOTE/$CANONICAL_BRANCH"
CANONICAL_BRANCH_REF="refs/heads/$CANONICAL_BRANCH"
CANONICAL_REMOTE_URL='https://github.com/Base1520/Sermon-Study-Tool.git'

if [ ! -x "$GIT_BIN" ]; then
  echo "Trusted system Git is unavailable at $GIT_BIN; refusing to infer release source." >&2
  exit 1
fi
TRUSTED_GIT_EXEC_PATH=$($GIT_BIN --exec-path)

# A caller-controlled repository context can make every later Git assertion
# describe a different checkout than the bytes npm will package. Refuse the
# variables that redirect repository, index, object, ref, or config identity.
# Disable replace-object interpretation for every Git read in this process.
if [ "${RELEASE_REMOTE+x}" = x ] ||
  [ "${GIT_DIR+x}" = x ] ||
  [ "${GIT_WORK_TREE+x}" = x ] ||
  [ "${GIT_INDEX_FILE+x}" = x ] ||
  [ "${GIT_COMMON_DIR+x}" = x ] ||
  [ "${GIT_OBJECT_DIRECTORY+x}" = x ] ||
  [ "${GIT_ALTERNATE_OBJECT_DIRECTORIES+x}" = x ] ||
  [ "${GIT_REPLACE_REF_BASE+x}" = x ] ||
  [ "${GIT_NAMESPACE+x}" = x ] ||
  [ "${GIT_CONFIG+x}" = x ] ||
  [ "${GIT_CONFIG_SYSTEM+x}" = x ] ||
  [ "${GIT_CONFIG_GLOBAL+x}" = x ] ||
  [ "${GIT_CONFIG_PARAMETERS+x}" = x ] ||
  [ "${GIT_CONFIG_COUNT+x}" = x ] ||
  [ "${GIT_EXEC_PATH+x}" = x ] ||
  [ "${GIT_SSH+x}" = x ] ||
  [ "${GIT_SSH_COMMAND+x}" = x ] ||
  [ "${GIT_SSH_VARIANT+x}" = x ] ||
  [ "${GIT_PROXY_COMMAND+x}" = x ] ||
  [ "${GIT_SSL_NO_VERIFY+x}" = x ] ||
  [ "${GIT_SSL_CAINFO+x}" = x ] ||
  [ "${GIT_SSL_CAPATH+x}" = x ] ||
  [ "${CURL_CA_BUNDLE+x}" = x ] ||
  [ "${SSL_CERT_FILE+x}" = x ] ||
  [ "${SSL_CERT_DIR+x}" = x ] ||
  [ "${GIT_CEILING_DIRECTORIES+x}" = x ] ||
  [ "${GIT_DISCOVERY_ACROSS_FILESYSTEM+x}" = x ]; then
  echo "Caller-controlled Git repository/configuration context is not allowed for a release." >&2
  exit 1
fi
export GIT_NO_REPLACE_OBJECTS=1

# Query the public repository URL directly, outside this checkout, with Git's
# trusted helper directory and no repository, user, or system Git config. This
# keeps a repository-local remote helper or transport alias from turning a
# correctly spelled origin URL into a query against different bytes.
official_ls_remote() (
  cd /
  export GIT_CONFIG_NOSYSTEM=1
  export GIT_CONFIG_SYSTEM=/dev/null
  export GIT_CONFIG_GLOBAL=/dev/null
  export GIT_CONFIG_COUNT=0
  export GIT_EXEC_PATH="$TRUSTED_GIT_EXEC_PATH"
  export GIT_NO_REPLACE_OBJECTS=1
  "$GIT_BIN" ls-remote --exit-code "$CANONICAL_REMOTE_URL" "$@"
)

if ! GIT_TOPLEVEL=$($GIT_BIN rev-parse --show-toplevel 2>/dev/null); then
  echo "Could not identify the repository root; refusing to infer release source." >&2
  exit 1
fi
if ! GIT_TOPLEVEL=$(cd "$GIT_TOPLEVEL" 2>/dev/null && pwd -P); then
  echo "Could not resolve the repository root; refusing to infer release source." >&2
  exit 1
fi
if [ "$GIT_TOPLEVEL" != "$REPOSITORY_ROOT" ]; then
  echo "Git describes $GIT_TOPLEVEL, not the repository containing this release guard." >&2
  exit 1
fi

if ! CURRENT_BRANCH=$($GIT_BIN symbolic-ref --quiet --short HEAD 2>/dev/null); then
  echo "Release source is detached; the canonical $CANONICAL_BRANCH branch is required." >&2
  exit 1
fi
if [ "$CURRENT_BRANCH" != "$CANONICAL_BRANCH" ]; then
  echo "Release source is on $CURRENT_BRANCH, not canonical branch $CANONICAL_BRANCH." >&2
  exit 1
fi
if ! LOCAL_BRANCH_REMOTES=$($GIT_BIN config --local --get-all "branch.$CANONICAL_BRANCH.remote" 2>/dev/null) ||
  [ "$LOCAL_BRANCH_REMOTES" != "$CANONICAL_REMOTE" ]; then
  echo "Canonical branch $CANONICAL_BRANCH is not repository-locally bound to $CANONICAL_REMOTE exactly once." >&2
  exit 1
fi
if ! LOCAL_BRANCH_MERGES=$($GIT_BIN config --local --get-all "branch.$CANONICAL_BRANCH.merge" 2>/dev/null) ||
  [ "$LOCAL_BRANCH_MERGES" != "$CANONICAL_BRANCH_REF" ]; then
  echo "Canonical branch $CANONICAL_BRANCH is not repository-locally bound to $CANONICAL_BRANCH_REF exactly once." >&2
  exit 1
fi
if ! UPSTREAM=$($GIT_BIN rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null); then
  echo "Canonical branch $CANONICAL_BRANCH has no upstream." >&2
  exit 1
fi
if [ "$UPSTREAM" != "$CANONICAL_UPSTREAM" ]; then
  echo "Canonical branch $CANONICAL_BRANCH tracks $UPSTREAM, not $CANONICAL_UPSTREAM." >&2
  exit 1
fi

is_official_remote_url() {
  [ "$1" = "$CANONICAL_REMOTE_URL" ]
}

if ! RAW_REMOTE_URLS=$($GIT_BIN config --local --get-all "remote.$CANONICAL_REMOTE.url" 2>/dev/null); then
  echo "Canonical remote $CANONICAL_REMOTE has no repository-local URL." >&2
  exit 1
fi
if ! is_official_remote_url "$RAW_REMOTE_URLS"; then
  echo "Canonical remote $CANONICAL_REMOTE does not name $CANONICAL_REPOSITORY exactly once." >&2
  exit 1
fi
if ! EFFECTIVE_REMOTE_URLS=$($GIT_BIN remote get-url --all "$CANONICAL_REMOTE" 2>/dev/null); then
  echo "Could not resolve canonical remote $CANONICAL_REMOTE." >&2
  exit 1
fi

for REMOTE_OVERRIDE_KEY in vcs uploadpack receivepack proxy; do
  if $GIT_BIN config --local --get-all "remote.$CANONICAL_REMOTE.$REMOTE_OVERRIDE_KEY" >/dev/null 2>&1; then
    echo "Canonical remote $CANONICAL_REMOTE has a custom $REMOTE_OVERRIDE_KEY transport override." >&2
    exit 1
  fi
done
if $GIT_BIN config --local --get-all "remote.$CANONICAL_REMOTE.pushurl" >/dev/null 2>&1; then
  echo "Canonical remote $CANONICAL_REMOTE has a separate push URL." >&2
  exit 1
fi
if ! EFFECTIVE_PUSH_URLS=$($GIT_BIN remote get-url --push --all "$CANONICAL_REMOTE" 2>/dev/null); then
  echo "Could not resolve the canonical push identity for remote $CANONICAL_REMOTE." >&2
  exit 1
fi
if ! is_official_remote_url "$EFFECTIVE_PUSH_URLS"; then
  echo "Canonical remote $CANONICAL_REMOTE has a push identity outside $CANONICAL_REPOSITORY." >&2
  exit 1
fi
if ! is_official_remote_url "$EFFECTIVE_REMOTE_URLS"; then
  echo "Canonical remote $CANONICAL_REMOTE is rewritten away from $CANONICAL_REPOSITORY." >&2
  exit 1
fi

WORKTREE_VERSION=${1:-$(node -p "require('./package.json').version")}

if ! HEAD_PACKAGE=$($GIT_BIN show HEAD:package.json 2>/dev/null); then
  echo "Cannot read package.json from HEAD; refusing to publish an uncommitted release." >&2
  exit 1
fi

HEAD_VERSION=$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).version || "")' <<<"$HEAD_PACKAGE")

if [ "$HEAD_VERSION" != "$WORKTREE_VERSION" ]; then
  echo "Release version $WORKTREE_VERSION is not committed at HEAD (HEAD declares $HEAD_VERSION)." >&2
  echo "Commit and review the version bump before creating a release tag." >&2
  exit 1
fi

# The package version can match HEAD while the source actually built does not.
# Refuse tracked, staged, or untracked repository changes so the release bytes
# come from the exact reviewed commit that the tag names. Ignored build outputs
# and local credential files remain outside Git's release-source boundary.
if ! WORKTREE_STATE=$($GIT_BIN status --porcelain=v1 --untracked-files=all --ignore-submodules=none); then
  echo "Could not inspect the working tree; refusing to infer clean release source." >&2
  exit 1
fi
if [ -n "$WORKTREE_STATE" ]; then
  echo "Working tree is not clean; refusing to build release artifacts that the tag cannot reproduce." >&2
  echo "Commit or remove every tracked, staged, and untracked repository change before releasing." >&2
  exit 1
fi

# THE RELEASE COMMIT MUST EXIST ON THE REMOTE.
#
# WHAT WENT WRONG ONCE: a release tag was created from the remote default branch
# while the version bump existed only locally. v1.4.1 and v1.4.2 both point at
# b96313f, a commit whose package.json declares 1.4.0, and the auto-updater carried
# those irreproducible releases to every installed copy.
#
# The current split release flow is different: Windows CI creates the tagged
# draft, then release.sh builds the Mac half from this checkout and completes that
# existing tag with --verify-tag. Branch equality proves the commit is pushed, but
# it does not prove the already-created tag names that same commit. Both claims
# are required so Windows and Mac cannot ship from different revisions under one
# release version.
#
# A release whose tag does not build it cannot be audited, reverted to, or
# reproduced — the exact condition that put an Apple build under a permanent
# do-not-submit order.
REMOTE=$CANONICAL_REMOTE
if ! REMOTE_BRANCH_LINES=$(official_ls_remote "$CANONICAL_BRANCH_REF" 2>/dev/null); then
  echo "Could not read $CANONICAL_BRANCH_REF from official remote $REMOTE." >&2
  exit 1
fi
LOCAL_HEAD=$($GIT_BIN rev-parse HEAD)
REMOTE_HEAD=''
while IFS=$'\t' read -r OBJECT REF; do
  case "$REF" in
    "$CANONICAL_BRANCH_REF")
      if [ -n "$REMOTE_HEAD" ]; then
        echo "Official remote returned duplicate $CANONICAL_BRANCH_REF identities." >&2
        exit 1
      fi
      REMOTE_HEAD=$OBJECT
      ;;
    *)
      echo "Official branch lookup returned an unexpected ref: $REF" >&2
      exit 1
      ;;
  esac
done <<<"$REMOTE_BRANCH_LINES"

if [ -z "$REMOTE_HEAD" ]; then
  echo "Could not resolve official branch $CANONICAL_BRANCH_REF." >&2
  exit 1
fi

if [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; then
  echo "Local HEAD and official $CANONICAL_BRANCH_REF disagree, so the release tag would NOT be built from what you tested." >&2
  echo "  local  HEAD: $($GIT_BIN rev-parse --short HEAD)" >&2
  echo "  remote main: ${REMOTE_HEAD:0:7}" >&2
  echo "Push the release commit first. This is the exact defect that tagged v1.4.1 and v1.4.2" >&2
  echo "to b96313f, a commit declaring 1.4.0." >&2
  exit 1
fi

# The remote is what will be tagged, so the version claim has to hold THERE too.
REMOTE_VERSION=$($GIT_BIN show "$REMOTE_HEAD:package.json" 2>/dev/null \
  | node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).version || "")' 2>/dev/null || echo '')
if [ "$REMOTE_VERSION" != "$WORKTREE_VERSION" ]; then
  echo "The commit that will be tagged declares $REMOTE_VERSION, not $WORKTREE_VERSION." >&2
  exit 1
fi

# Read the tag from the named remote rather than trusting a potentially stale
# local tag. Annotated tags return both the tag object and a peeled ^{} target;
# lightweight tags return only the direct target.
TAG="v$WORKTREE_VERSION"
TAG_REF="refs/tags/$TAG"
if ! REMOTE_TAG_LINES=$(official_ls_remote "$TAG_REF" "$TAG_REF^{}" 2>/dev/null); then
  echo "Remote release tag $TAG does not exist; Windows CI must create the tagged draft first." >&2
  exit 1
fi

TAG_OBJECT=''
TAG_PEELED=''
while IFS=$'\t' read -r OBJECT REF; do
  case "$REF" in
    "$TAG_REF") TAG_OBJECT=$OBJECT ;;
    "$TAG_REF^{}") TAG_PEELED=$OBJECT ;;
    *)
      echo "Remote release tag lookup returned an unexpected ref: $REF" >&2
      exit 1
      ;;
  esac
done <<<"$REMOTE_TAG_LINES"

if [ -z "$TAG_OBJECT" ]; then
  echo "Remote release tag $TAG did not resolve to an exact tag ref." >&2
  exit 1
fi
TAG_COMMIT=${TAG_PEELED:-$TAG_OBJECT}

if [ "$TAG_COMMIT" != "$LOCAL_HEAD" ] || [ "$TAG_COMMIT" != "$REMOTE_HEAD" ]; then
  echo "Remote release tag $TAG does not resolve to the release commit." >&2
  echo "  local  HEAD: $($GIT_BIN rev-parse --short "$LOCAL_HEAD")" >&2
  echo "  upstream   : $($GIT_BIN rev-parse --short "$REMOTE_HEAD")" >&2
  echo "  remote tag : ${TAG_COMMIT:0:7}" >&2
  echo "Create a new version tag on the reviewed pushed source; never move a published tag." >&2
  exit 1
fi

echo "Release provenance guard passed: $TAG resolves to the clean reviewed commit pushed to $REMOTE"
