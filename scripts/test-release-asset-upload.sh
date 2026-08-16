#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! grep -Fq -- '--json isDraft,databaseId,uploadUrl,assets' scripts/release.sh; then
  echo 'release.sh does not capture the draft release id and upload URL.' >&2
  exit 1
fi
if ! grep -Fq 'scripts/upload-release-assets-by-id.sh "$REPO" "$RELEASE_ID" "$TAG" "$RELEASE_UPLOAD_URL" dist-electron/rel/*' scripts/release.sh; then
  echo 'release.sh does not upload Mac assets through the captured release id.' >&2
  exit 1
fi
if grep -Fq 'gh release upload "$TAG" dist-electron/rel/*' scripts/release.sh; then
  echo 'release.sh still re-resolves the draft by tag during Mac asset upload.' >&2
  exit 1
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin" "$TMP_DIR/assets"
printf 'dmg bytes\n' > "$TMP_DIR/assets/a.dmg"
printf 'zip bytes\n' > "$TMP_DIR/assets/b.zip"

cat > "$TMP_DIR/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

if [ "$1" != api ]; then
  echo "Unexpected gh command: $*" >&2
  exit 90
fi
shift

METHOD=GET
ENDPOINT=''
INPUT=''
NAME=''
CONTENT_TYPE=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --method)
      METHOD=$2
      shift 2
      ;;
    --input)
      INPUT=$2
      shift 2
      ;;
    -f)
      case "$2" in name=*) NAME=${2#name=} ;; esac
      shift 2
      ;;
    --jq)
      shift 2
      ;;
    -H)
      CONTENT_TYPE=$2
      shift 2
      ;;
    --paginate|--silent)
      shift
      ;;
    *)
      if [ -n "$ENDPOINT" ]; then
        echo "Unexpected gh argument: $1" >&2
        exit 91
      fi
      ENDPOINT=$1
      shift
      ;;
  esac
done

printf '%s\t%s\t%s\t%s\t%s\n' "$METHOD" "$ENDPOINT" "$NAME" "$INPUT" "$CONTENT_TYPE" >> "$GH_LOG"

if [ "$METHOD" = GET ] && [ "$ENDPOINT" = 'repos/Acme/App/releases/123' ]; then
  RELEASE_UPLOAD=${GH_RELEASE_UPLOAD_URL:-}
  if [ -z "$RELEASE_UPLOAD" ]; then
    RELEASE_UPLOAD='https://uploads.github.com/repos/Acme/App/releases/123/assets{?name,label}'
  fi
  printf '%s\t%s\t%s\n' \
    "${GH_RELEASE_DRAFT:-true}" \
    "${GH_RELEASE_TAG:-v9.8.7}" \
    "$RELEASE_UPLOAD"
  exit 0
fi
if [ "$METHOD" = GET ] && [ "$ENDPOINT" = 'repos/Acme/App/releases/123/assets' ]; then
  printf '%s\n' "${GH_ASSET_ROWS:-}"
  exit 0
fi
if [ "$METHOD" = DELETE ]; then
  exit 0
fi
if [ "$METHOD" = POST ]; then
  test "$ENDPOINT" = 'https://uploads.github.com/repos/Acme/App/releases/123/assets'
  test -f "$INPUT"
  test "$CONTENT_TYPE" = 'Content-Type: application/octet-stream'
  if [ "${GH_UPLOAD_FAIL_NAME:-}" = "$NAME" ]; then
    exit 1
  fi
  exit 0
fi

echo "Unexpected gh API call: $METHOD $ENDPOINT" >&2
exit 92
MOCK
chmod +x "$TMP_DIR/bin/gh"

export GH_LOG="$TMP_DIR/gh.log"
export GH_ASSET_ROWS=$'91\ta.dmg\n88\tThe-Operator-windows.exe'
PATH="$TMP_DIR/bin:$PATH" bash scripts/upload-release-assets-by-id.sh \
  Acme/App 123 v9.8.7 'https://uploads.github.com/repos/Acme/App/releases/123/assets{?name,label}' \
  "$TMP_DIR/assets/a.dmg" "$TMP_DIR/assets/b.zip"

STATE_LINE=$(grep -n $'^GET\trepos/Acme/App/releases/123\t' "$GH_LOG" | cut -d: -f1)
GET_LINE=$(grep -n $'^GET\trepos/Acme/App/releases/123/assets\t' "$GH_LOG" | cut -d: -f1)
DELETE_LINE=$(grep -n $'^DELETE\trepos/Acme/App/releases/assets/91\t' "$GH_LOG" | cut -d: -f1)
A_UPLOAD_LINE=$(grep -n $'^POST\thttps://uploads.github.com/repos/Acme/App/releases/123/assets\ta.dmg\t' "$GH_LOG" | cut -d: -f1)
B_UPLOAD_LINE=$(grep -n $'^POST\thttps://uploads.github.com/repos/Acme/App/releases/123/assets\tb.zip\t' "$GH_LOG" | cut -d: -f1)
test -n "$STATE_LINE"
test -n "$GET_LINE"
test -n "$DELETE_LINE"
test -n "$A_UPLOAD_LINE"
test -n "$B_UPLOAD_LINE"
test "$STATE_LINE" -lt "$GET_LINE"
test "$GET_LINE" -lt "$DELETE_LINE"
test "$DELETE_LINE" -lt "$A_UPLOAD_LINE"
test "$A_UPLOAD_LINE" -lt "$B_UPLOAD_LINE"
! grep -Fq 'releases/assets/88' "$GH_LOG"
! grep -Fq 'v9.8.7' "$GH_LOG"

: > "$GH_LOG"
if PATH="$TMP_DIR/bin:$PATH" GH_UPLOAD_FAIL_NAME=a.dmg \
  bash scripts/upload-release-assets-by-id.sh \
    Acme/App 123 v9.8.7 'https://uploads.github.com/repos/Acme/App/releases/123/assets{?name,label}' \
    "$TMP_DIR/assets/a.dmg" "$TMP_DIR/assets/b.zip"; then
  echo 'Release asset helper ignored an upload failure.' >&2
  exit 1
fi
grep -Fq $'DELETE\trepos/Acme/App/releases/assets/91' "$GH_LOG"
grep -Fq $'POST\thttps://uploads.github.com/repos/Acme/App/releases/123/assets\ta.dmg' "$GH_LOG"
! grep -Fq $'\tb.zip\t' "$GH_LOG"

: > "$GH_LOG"
if PATH="$TMP_DIR/bin:$PATH" GH_RELEASE_DRAFT=false \
  bash scripts/upload-release-assets-by-id.sh \
    Acme/App 123 v9.8.7 'https://uploads.github.com/repos/Acme/App/releases/123/assets{?name,label}' \
    "$TMP_DIR/assets/a.dmg" > "$TMP_DIR/public.out" 2> "$TMP_DIR/public.err"; then
  echo 'Release asset helper modified a release that was no longer a draft.' >&2
  exit 1
fi
grep -Fq 'is no longer a draft' "$TMP_DIR/public.err"
test "$(wc -l < "$GH_LOG")" -eq 1
! grep -Eq $'^(DELETE|POST)\t' "$GH_LOG"

: > "$GH_LOG"
if PATH="$TMP_DIR/bin:$PATH" GH_RELEASE_TAG=v9.8.8 \
  bash scripts/upload-release-assets-by-id.sh \
    Acme/App 123 v9.8.7 'https://uploads.github.com/repos/Acme/App/releases/123/assets{?name,label}' \
    "$TMP_DIR/assets/a.dmg" > "$TMP_DIR/wrong-tag.out" 2> "$TMP_DIR/wrong-tag.err"; then
  echo 'Release asset helper modified a release whose tag changed.' >&2
  exit 1
fi
grep -Fq 'now belongs to tag v9.8.8, not v9.8.7' "$TMP_DIR/wrong-tag.err"
test "$(wc -l < "$GH_LOG")" -eq 1
! grep -Eq $'^(DELETE|POST)\t' "$GH_LOG"

: > "$GH_LOG"
if PATH="$TMP_DIR/bin:$PATH" \
  GH_RELEASE_UPLOAD_URL='https://uploads.github.com/repos/Acme/App/releases/124/assets{?name,label}' \
  bash scripts/upload-release-assets-by-id.sh \
    Acme/App 123 v9.8.7 'https://uploads.github.com/repos/Acme/App/releases/123/assets{?name,label}' \
    "$TMP_DIR/assets/a.dmg" > "$TMP_DIR/changed-url.out" 2> "$TMP_DIR/changed-url.err"; then
  echo 'Release asset helper ignored a changed upload URL.' >&2
  exit 1
fi
grep -Fq 'no longer reports the captured upload URL' "$TMP_DIR/changed-url.err"
test "$(wc -l < "$GH_LOG")" -eq 1
! grep -Eq $'^(DELETE|POST)\t' "$GH_LOG"

: > "$GH_LOG"
if PATH="$TMP_DIR/bin:$PATH" bash scripts/upload-release-assets-by-id.sh \
  Acme/App v123 v9.8.7 'https://uploads.github.com/repos/Acme/App/releases/v123/assets{?name,label}' \
  "$TMP_DIR/assets/a.dmg" > "$TMP_DIR/invalid-id.out" 2> "$TMP_DIR/invalid-id.err"; then
  echo 'Release asset helper accepted a tag in place of a release id.' >&2
  exit 1
fi
grep -Fq 'requires a numeric GitHub release id' "$TMP_DIR/invalid-id.err"
test ! -s "$GH_LOG"

echo 'Release asset by-id upload guard passed'
