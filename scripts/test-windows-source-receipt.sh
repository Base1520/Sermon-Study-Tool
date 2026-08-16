#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin" "$TMP_DIR/payload"

EXPECTED_COMMIT=0123456789abcdef0123456789abcdef01234567
STALE_COMMIT=89abcdef0123456789abcdef0123456789abcdef
INSTALLER="$TMP_DIR/payload/The-Operator-windows.exe"
MANIFEST="$TMP_DIR/payload/latest.yml"
VALID_RECEIPT="$TMP_DIR/valid.json"
STALE_RECEIPT="$TMP_DIR/stale.json"
BASE_INVENTORY="$TMP_DIR/inventory.json"

printf 'signed installer bytes\n' > "$INSTALLER"
printf 'version: 9.8.7\npath: The-Operator-windows.exe\n' > "$MANIFEST"
node scripts/windows-source-receipt.mjs write \
  "$VALID_RECEIPT" Acme/App "$EXPECTED_COMMIT" v9.8.7 9.8.7 \
  "$INSTALLER" "$MANIFEST"
node scripts/windows-source-receipt.mjs write \
  "$STALE_RECEIPT" Acme/App "$STALE_COMMIT" v9.8.7 9.8.7 \
  "$INSTALLER" "$MANIFEST"

node -e '
  const fs = require("node:fs");
  const [receiptFile, inventoryFile] = process.argv.slice(1);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  const inventory = [{ id: 501, name: "windows-source.json", size: 1, digest: `sha256:${"f".repeat(64)}`, state: "uploaded" }];
  receipt.assets.forEach((asset, index) => inventory.push({
    id: 601 + index,
    name: asset.name,
    size: asset.size,
    digest: `sha256:${asset.sha256}`,
    state: "uploaded",
  }));
  fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
' "$VALID_RECEIPT" "$BASE_INVENTORY"

node -e '
  const fs = require("node:fs");
  const [source, missing, duplicate, tamperedExe, tamperedManifest, staleBlockmap] = process.argv.slice(1);
  const base = JSON.parse(fs.readFileSync(source, "utf8"));
  fs.writeFileSync(missing, JSON.stringify(base.filter((asset) => asset.name !== "windows-source.json")));
  fs.writeFileSync(duplicate, JSON.stringify([...base, { ...base.find((asset) => asset.name === "windows-source.json"), id: 502 }]));
  const exe = structuredClone(base);
  exe.find((asset) => asset.name === "The-Operator-windows.exe").digest = `sha256:${"0".repeat(64)}`;
  fs.writeFileSync(tamperedExe, JSON.stringify(exe));
  const manifest = structuredClone(base);
  manifest.find((asset) => asset.name === "latest.yml").digest = `sha256:${"1".repeat(64)}`;
  fs.writeFileSync(tamperedManifest, JSON.stringify(manifest));
  fs.writeFileSync(staleBlockmap, JSON.stringify([...base, { id: 700, name: "The-Operator-windows.exe.blockmap", size: 3, digest: `sha256:${"2".repeat(64)}`, state: "uploaded" }]));
' "$BASE_INVENTORY" \
  "$TMP_DIR/missing-inventory.json" \
  "$TMP_DIR/duplicate-inventory.json" \
  "$TMP_DIR/tampered-exe-inventory.json" \
  "$TMP_DIR/tampered-manifest-inventory.json" \
  "$TMP_DIR/stale-blockmap-inventory.json"

cat > "$TMP_DIR/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail

if [ "$1" != api ]; then
  echo "Unexpected gh command: $*" >&2
  exit 90
fi
shift

ENDPOINT=''
ACCEPT=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --jq)
      shift 2
      ;;
    --paginate|--silent)
      shift
      ;;
    -H)
      ACCEPT=$2
      shift 2
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

printf '%s\t%s\n' "$ENDPOINT" "$ACCEPT" >> "$GH_LOG"

if [ "$ENDPOINT" = 'repos/Acme/App/releases/123' ]; then
  printf '%s\t%s\n' "${GH_RELEASE_DRAFT:-true}" "${GH_RELEASE_TAG:-v9.8.7}"
  exit 0
fi

if [ "$ENDPOINT" = 'repos/Acme/App/releases/123/assets?per_page=100' ]; then
  if [ "${GH_INVENTORY_FAIL:-false}" = true ]; then
    exit 1
  fi
  cat "$GH_INVENTORY_FILE"
  exit 0
fi

if [ "$ENDPOINT" = 'repos/Acme/App/releases/assets/501' ]; then
  test "$ACCEPT" = 'Accept: application/octet-stream'
  if [ "${GH_RECEIPT_DOWNLOAD_FAIL:-false}" = true ]; then
    exit 1
  fi
  cat "$GH_RECEIPT_FILE"
  exit 0
fi

echo "Unexpected gh API endpoint: $ENDPOINT" >&2
exit 92
MOCK
chmod +x "$TMP_DIR/bin/gh"

export GH_LOG="$TMP_DIR/gh.log"
export GH_RECEIPT_FILE="$VALID_RECEIPT"
export GH_INVENTORY_FILE="$BASE_INVENTORY"

PATH="$TMP_DIR/bin:$PATH" bash scripts/verify-windows-source-receipt.sh \
  Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT"
grep -Fq $'repos/Acme/App/releases/123\t' "$GH_LOG"
grep -Fq $'repos/Acme/App/releases/123/assets?per_page=100\t' "$GH_LOG"
grep -Fq $'repos/Acme/App/releases/assets/501\tAccept: application/octet-stream' "$GH_LOG"

if PATH="$TMP_DIR/bin:$PATH" GH_INVENTORY_FILE="$TMP_DIR/missing-inventory.json" \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/missing.out" 2>"$TMP_DIR/missing.err"; then
  echo 'Windows source receipt guard accepted a draft with no receipt.' >&2
  exit 1
fi
grep -Fq 'must contain exactly one windows-source.json asset' "$TMP_DIR/missing.err"

if PATH="$TMP_DIR/bin:$PATH" GH_INVENTORY_FILE="$TMP_DIR/duplicate-inventory.json" \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/duplicate.out" 2>"$TMP_DIR/duplicate.err"; then
  echo 'Windows source receipt guard accepted duplicate receipts.' >&2
  exit 1
fi
grep -Fq 'must contain exactly one windows-source.json asset' "$TMP_DIR/duplicate.err"

export GH_RECEIPT_FILE="$STALE_RECEIPT"
if PATH="$TMP_DIR/bin:$PATH" bash scripts/verify-windows-source-receipt.sh \
  Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
  >"$TMP_DIR/stale.out" 2>"$TMP_DIR/stale.err"; then
  echo 'Windows source receipt guard accepted a stale commit.' >&2
  exit 1
fi
grep -Fq 'commit does not match the Mac release commit' "$TMP_DIR/stale.err"

export GH_RECEIPT_FILE="$VALID_RECEIPT"
if PATH="$TMP_DIR/bin:$PATH" GH_INVENTORY_FILE="$TMP_DIR/tampered-exe-inventory.json" \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/tampered-exe.out" 2>"$TMP_DIR/tampered-exe.err"; then
  echo 'Windows source receipt guard accepted replaced installer bytes.' >&2
  exit 1
fi
grep -Fq 'Windows installer digest does not match its source receipt' "$TMP_DIR/tampered-exe.err"

if PATH="$TMP_DIR/bin:$PATH" GH_INVENTORY_FILE="$TMP_DIR/tampered-manifest-inventory.json" \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/tampered-manifest.out" 2>"$TMP_DIR/tampered-manifest.err"; then
  echo 'Windows source receipt guard accepted replaced updater-manifest bytes.' >&2
  exit 1
fi
grep -Fq 'Windows updater manifest digest does not match its source receipt' "$TMP_DIR/tampered-manifest.err"

if PATH="$TMP_DIR/bin:$PATH" GH_INVENTORY_FILE="$TMP_DIR/stale-blockmap-inventory.json" \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/stale-blockmap.out" 2>"$TMP_DIR/stale-blockmap.err"; then
  echo 'Windows source receipt guard accepted a stale unreceipted blockmap.' >&2
  exit 1
fi
grep -Fq 'wrong count for The-Operator-windows.exe.blockmap' "$TMP_DIR/stale-blockmap.err"

printf '{not json}\n' > "$TMP_DIR/malformed.json"
export GH_RECEIPT_FILE="$TMP_DIR/malformed.json"
if PATH="$TMP_DIR/bin:$PATH" bash scripts/verify-windows-source-receipt.sh \
  Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
  >"$TMP_DIR/malformed.out" 2>"$TMP_DIR/malformed.err"; then
  echo 'Windows source receipt guard accepted malformed JSON.' >&2
  exit 1
fi
grep -Fq 'Windows source receipt is malformed JSON' "$TMP_DIR/malformed.err"

node -e '
  const fs = require("node:fs");
  const [source, wrongTag, wrongVersion] = process.argv.slice(1);
  const base = JSON.parse(fs.readFileSync(source, "utf8"));
  fs.writeFileSync(wrongTag, JSON.stringify({ ...base, tag: "v9.8.8" }));
  fs.writeFileSync(wrongVersion, JSON.stringify({ ...base, version: "9.8.8" }));
' "$VALID_RECEIPT" "$TMP_DIR/wrong-tag.json" "$TMP_DIR/wrong-version.json"
export GH_RECEIPT_FILE="$TMP_DIR/wrong-tag.json"
if PATH="$TMP_DIR/bin:$PATH" bash scripts/verify-windows-source-receipt.sh \
  Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
  >"$TMP_DIR/wrong-tag.out" 2>"$TMP_DIR/wrong-tag.err"; then
  echo 'Windows source receipt guard accepted a receipt for another tag.' >&2
  exit 1
fi
grep -Fq 'tag does not match the draft release tag' "$TMP_DIR/wrong-tag.err"

export GH_RECEIPT_FILE="$TMP_DIR/wrong-version.json"
if PATH="$TMP_DIR/bin:$PATH" bash scripts/verify-windows-source-receipt.sh \
  Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
  >"$TMP_DIR/wrong-version.out" 2>"$TMP_DIR/wrong-version.err"; then
  echo 'Windows source receipt guard accepted a receipt for another version.' >&2
  exit 1
fi
grep -Fq 'version does not match the Mac release version' "$TMP_DIR/wrong-version.err"

export GH_RECEIPT_FILE="$VALID_RECEIPT"
if PATH="$TMP_DIR/bin:$PATH" GH_RELEASE_DRAFT=false \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/public.out" 2>"$TMP_DIR/public.err"; then
  echo 'Windows source receipt guard accepted a public release.' >&2
  exit 1
fi
grep -Fq 'is no longer a draft' "$TMP_DIR/public.err"

if PATH="$TMP_DIR/bin:$PATH" GH_RELEASE_TAG=v9.8.8 \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/retagged.out" 2>"$TMP_DIR/retagged.err"; then
  echo 'Windows source receipt guard accepted a retagged release.' >&2
  exit 1
fi
grep -Fq 'now belongs to tag v9.8.8, not v9.8.7' "$TMP_DIR/retagged.err"

if PATH="$TMP_DIR/bin:$PATH" GH_INVENTORY_FAIL=true \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/inventory.out" 2>"$TMP_DIR/inventory.err"; then
  echo 'Windows source receipt guard ignored a failed asset inventory read.' >&2
  exit 1
fi
grep -Fq 'Could not read the Windows release asset inventory by immutable release id' "$TMP_DIR/inventory.err"

if PATH="$TMP_DIR/bin:$PATH" GH_RECEIPT_DOWNLOAD_FAIL=true \
  bash scripts/verify-windows-source-receipt.sh \
    Acme/App 123 v9.8.7 9.8.7 "$EXPECTED_COMMIT" \
    >"$TMP_DIR/download.out" 2>"$TMP_DIR/download.err"; then
  echo 'Windows source receipt guard ignored a failed receipt download.' >&2
  exit 1
fi
grep -Fq 'Could not download the Windows source receipt by immutable asset id' "$TMP_DIR/download.err"

echo 'Windows source receipt guard passed'
