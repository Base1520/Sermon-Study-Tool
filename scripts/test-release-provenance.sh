#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SCOPED_MAC_BUILD='APPLE_ID="$APPLE_ID" APPLE_TEAM_ID="$APPLE_TEAM_ID" APPLE_APP_SPECIFIC_PASSWORD="$APPLE_APP_SPECIFIC_PASSWORD" npm run build >/tmp/rel-mac.log 2>&1 || { echo "MAC BUILD FAILED"; tail -20 /tmp/rel-mac.log; exit 1; }'
PROVENANCE_GUARD_COMMAND='/bin/bash -p scripts/check-release-provenance.sh "$V"'
DRIVER_PROBE_VERSION='9.9.9'

verify_release_entry_binding() {
  local release_file=$1
  local shebang_count privilege_count cdpath_count invocation_count source_count realpath_count
  local sanitize_count function_count reexec_count unset_count enter_count

  shebang_count=$(grep -xcF -- '#!/bin/bash -p' "$release_file" || true)
  privilege_count=$(grep -cF -- 'Run scripts/release.sh directly so its privileged Bash boundary can isolate startup state.' "$release_file" || true)
  cdpath_count=$(grep -xcF -- 'unset CDPATH' "$release_file" || true)
  invocation_count=$(grep -xcF -- 'INVOCATION_ROOT=$(pwd -P)' "$release_file" || true)
  source_count=$(grep -xcF -- 'SCRIPT_PATH=${BASH_SOURCE[0]}' "$release_file" || true)
  realpath_count=$(grep -xcF -- 'if ! SCRIPT_PATH=$(/bin/realpath "$SCRIPT_PATH"); then' "$release_file" || true)
  sanitize_count=$(grep -xcF -- 'SANITIZE_ENV_ARGS=()' "$release_file" || true)
  function_count=$(grep -xcF -- '    BASH_ENV|ENV|SHELLOPTS|BASHOPTS|CDPATH|GLOBIGNORE|BASH_COMPAT|POSIXLY_CORRECT|BASH_FUNC_*%%)' "$release_file" || true)
  reexec_count=$(grep -xcF -- '    /bin/bash -p "$SCRIPT_PATH" "$@"' "$release_file" || true)
  unset_count=$(grep -xcF -- 'unset BASH_ENV ENV CDPATH GLOBIGNORE BASH_COMPAT POSIXLY_CORRECT' "$release_file" || true)
  enter_count=$(grep -xcF -- 'if ! cd -- "$SCRIPT_DIR/.."; then' "$release_file" || true)
  if [ "$shebang_count" -ne 1 ] || [ "$privilege_count" -ne 1 ] ||
    [ "$cdpath_count" -ne 1 ] || [ "$invocation_count" -ne 1 ] ||
    [ "$source_count" -ne 1 ] || [ "$realpath_count" -ne 1 ] ||
    [ "$sanitize_count" -ne 1 ] || [ "$function_count" -ne 1 ] ||
    [ "$reexec_count" -ne 1 ] || [ "$unset_count" -ne 1 ] || [ "$enter_count" -ne 1 ]; then
    echo 'Release entry must bind its physical source tree under privileged Bash' >&2
    return 1
  fi
  if grep -Fq -- 'cd "$(dirname "$0")/.."' "$release_file"; then
    echo 'Release entry must not use a CDPATH-sensitive relative source-directory change' >&2
    return 1
  fi
}

verify_source_identity_constants() {
  local guard_file=$1
  local repository_count repository_assignment_count
  local url_count url_assignment_count git_count git_assignment_count direct_query_count

  repository_count=$(grep -xcF -- 'CANONICAL_REPOSITORY=Base1520/Sermon-Study-Tool' "$guard_file" || true)
  repository_assignment_count=$(grep -cE -- '^CANONICAL_REPOSITORY=' "$guard_file" || true)
  url_count=$(grep -xcF -- "CANONICAL_REMOTE_URL='https://github.com/Base1520/Sermon-Study-Tool.git'" "$guard_file" || true)
  url_assignment_count=$(grep -cE -- '^CANONICAL_REMOTE_URL=' "$guard_file" || true)
  git_count=$(grep -xcF -- 'GIT_BIN=/usr/bin/git' "$guard_file" || true)
  git_assignment_count=$(grep -cE -- '^GIT_BIN=' "$guard_file" || true)
  direct_query_count=$(grep -cF -- 'official_ls_remote ' "$guard_file" || true)
  if [ "$repository_count" -ne 1 ] || [ "$repository_assignment_count" -ne 1 ] ||
    [ "$url_count" -ne 1 ] || [ "$url_assignment_count" -ne 1 ]; then
    echo 'Release provenance guard must pin the official Base1520 repository and HTTPS URL' >&2
    return 1
  fi
  if [ "$git_count" -ne 1 ] || [ "$git_assignment_count" -ne 1 ] || [ "$direct_query_count" -ne 2 ]; then
    echo 'Release provenance guard must query official refs through the trusted isolated Git path' >&2
    return 1
  fi
}

verify_credential_scope() {
  local release_file=$1
  local unset_count unset_line tag_line banner_line preamble_commands
  local test_gate_line last_test_line
  local credential_count first_credential_line last_credential_line scoped_build_count

  unset_count=$(grep -xcF -- 'unset APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD' "$release_file" || true)
  unset_line=$(grep -nFx -- 'unset APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD' "$release_file" | cut -d: -f1 || true)
  tag_line=$(grep -nFx -- 'TAG="v$V"' "$release_file" | head -1 | cut -d: -f1 || true)
  banner_line=$(grep -nFx -- 'echo "=== The Operator $V ==="' "$release_file" | head -1 | cut -d: -f1 || true)
  test_gate_line=$(grep -nFx -- 'echo "--- tests (the gate) ---"' "$release_file" | cut -d: -f1 || true)
  last_test_line=$(grep -nF -- 'npm run test:release >/tmp/rel-gate.log' "$release_file" | tail -1 | cut -d: -f1 || true)
  credential_count=$(grep -cF -- 'security find-generic-password' "$release_file" || true)
  first_credential_line=$(grep -nF -- 'security find-generic-password' "$release_file" | head -1 | cut -d: -f1 || true)
  last_credential_line=$(grep -nF -- 'security find-generic-password' "$release_file" | tail -1 | cut -d: -f1 || true)
  scoped_build_count=$(grep -xcF -- "$SCOPED_MAC_BUILD" "$release_file" || true)

  if [ "$unset_count" -ne 1 ] || [ -z "$unset_line" ]; then
    echo 'Release must clear inherited Apple credentials exactly once' >&2
    return 1
  fi
  if [ -z "$tag_line" ] || [ -z "$banner_line" ]; then
    echo 'Release credential scope check could not bind the startup preamble' >&2
    return 1
  fi
  preamble_commands=$(awk -v start="$tag_line" -v end="$banner_line" '
    NR > start && NR < end && $0 !~ /^[[:space:]]*(#|$)/ { print }
  ' "$release_file")
  if [ "$preamble_commands" != 'unset APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD' ]; then
    echo 'Inherited Apple credentials must be cleared unconditionally in the startup preamble' >&2
    return 1
  fi
  if [ -z "$test_gate_line" ] || [ -z "$last_test_line" ]; then
    echo 'Release credential scope check could not bind the complete test gate' >&2
    return 1
  fi
  if [ "$credential_count" -ne 2 ] || [ -z "$first_credential_line" ] || [ -z "$last_credential_line" ]; then
    echo 'Release must contain exactly the two expected post-test keychain reads' >&2
    return 1
  fi
  if grep -Eq '^[[:space:]]*(export|declare[[:space:]]+-[^[:space:]]*x|typeset[[:space:]]+-[^[:space:]]*x)[^#]*APPLE_(ID|TEAM_ID|APP_SPECIFIC_PASSWORD)' "$release_file"; then
    echo 'Apple notarisation credentials must not be globally exported' >&2
    return 1
  fi
  if [ "$scoped_build_count" -ne 1 ]; then
    echo 'Apple credentials must be scoped to the exact Mac build command' >&2
    return 1
  fi
  if (( unset_line >= test_gate_line
     || test_gate_line >= last_test_line
     || last_test_line >= first_credential_line
     || first_credential_line > last_credential_line )); then
    echo 'Apple credentials must be cleared before tests and read only after the complete gate' >&2
    return 1
  fi
}

verify_guard_structure() {
  local release_file=$1
  local guard_count first_guard_line final_guard_line
  local banner_line github_line credential_line build_line gatekeeper_done_line
  local final_banner_line completing_banner_line upload_line publish_line
  local first_guard_region final_guard_region

  if ! bash -n "$release_file" >/dev/null 2>&1; then
    echo 'Release provenance guard check requires syntactically valid Bash' >&2
    return 1
  fi

  guard_count=$(grep -xcF -- "$PROVENANCE_GUARD_COMMAND" "$release_file" || true)
  first_guard_line=$(grep -nFx -- "$PROVENANCE_GUARD_COMMAND" "$release_file" | head -1 | cut -d: -f1 || true)
  final_guard_line=$(grep -nFx -- "$PROVENANCE_GUARD_COMMAND" "$release_file" | tail -1 | cut -d: -f1 || true)
  banner_line=$(grep -nFx -- 'echo "=== The Operator $V ==="' "$release_file" | head -1 | cut -d: -f1 || true)
  github_line=$(grep -nFx -- 'if ! RELEASE_INFO=$(gh release view "$TAG" --repo "$REPO" \' "$release_file" | cut -d: -f1 || true)
  credential_line=$(grep -nF -- 'security find-generic-password' "$release_file" | head -1 | cut -d: -f1 || true)
  build_line=$(grep -nF -- 'npm run build >/tmp/rel-mac.log' "$release_file" | cut -d: -f1 || true)
  gatekeeper_done_line=$(grep -nFx -- 'done' "$release_file" | tail -1 | cut -d: -f1 || true)
  final_banner_line=$(grep -nFx -- 'echo "--- final provenance check ---"' "$release_file" | cut -d: -f1 || true)
  completing_banner_line=$(grep -nFx -- 'echo "--- completing and publishing $TAG ---"' "$release_file" | cut -d: -f1 || true)
  upload_line=$(grep -nF -- 'bash scripts/upload-release-assets-by-id.sh' "$release_file" | cut -d: -f1 || true)
  publish_line=$(grep -nF -- 'gh release edit "$TAG"' "$release_file" | cut -d: -f1 || true)

  if [ "$guard_count" -ne 2 ]; then
    echo 'Release provenance guard must be exactly two standalone active commands' >&2
    return 1
  fi
  if [ -z "$first_guard_line" ] || [ -z "$final_guard_line" ] ||
    [ -z "$banner_line" ] || [ -z "$github_line" ] ||
    [ -z "$credential_line" ] || [ -z "$build_line" ] ||
    [ -z "$gatekeeper_done_line" ] || [ -z "$final_banner_line" ] ||
    [ -z "$completing_banner_line" ] || [ -z "$upload_line" ] ||
    [ -z "$publish_line" ]; then
    echo 'Release provenance guard check could not bind every protected boundary' >&2
    return 1
  fi

  first_guard_region=$(awk -v start="$banner_line" -v end="$github_line" '
    NR > start && NR < end && $0 !~ /^[[:space:]]*(#|$)/ { print }
  ' "$release_file")
  if [ "$first_guard_region" != "$PROVENANCE_GUARD_COMMAND" ]; then
    echo 'The first provenance guard must be the only active command before GitHub access' >&2
    return 1
  fi
  final_guard_region=$(awk -v start="$final_banner_line" -v end="$completing_banner_line" '
    NR > start && NR < end && $0 !~ /^[[:space:]]*(#|$)/ { print }
  ' "$release_file")
  if [ "$final_guard_region" != "$PROVENANCE_GUARD_COMMAND" ]; then
    echo 'The final provenance guard must be the only active command at the publication boundary' >&2
    return 1
  fi
  if (( banner_line >= first_guard_line
     || first_guard_line >= github_line
     || first_guard_line >= credential_line
     || first_guard_line >= build_line
     || first_guard_line >= publish_line )); then
    echo 'Release provenance guard must run before GitHub, credential, build, and publication access' >&2
    return 1
  fi
  if (( final_banner_line >= final_guard_line
     || final_guard_line <= build_line
     || final_guard_line <= gatekeeper_done_line
     || final_guard_line >= completing_banner_line
     || final_guard_line >= upload_line
     || final_guard_line >= publish_line )); then
    echo 'Final provenance guard must rerun after Mac build and Gatekeeper, before asset upload' >&2
    return 1
  fi
  if ! awk -v guard="$PROVENANCE_GUARD_COMMAND" '
    function reject(message) {
      print message > "/dev/stderr"
      failed=1
      exit 1
    }

    BEGIN {
      block_depth=0
      substitution_depth=0
      backtick_depth=0
      top_level_guards=0
    }

    {
      physical_line=$0
      if (continued_line) {
        logical_line=logical_line physical_line
      } else {
        logical_line=physical_line
      }
      if (physical_line ~ /\\$/) {
        sub(/\\$/, "", logical_line)
        continued_line=1
        next
      }
      continued_line=0
      line=logical_line
      logical_line=""
      if (line ~ /^[[:space:]]*(#|$)/) {
        next
      }

      opener_line=line
      closer_line=line
      opener_count=gsub(/(^|[;&|!]|time[[:space:]]+)[[:space:]]*(if|for|while|until|select|case)([[:space:];]|$)/, "&", opener_line)
      closer_count=gsub(/(^|[;&|])[[:space:]]*(fi|done|esac)([[:space:];]|$)/, "&", closer_line)

      group_opener=0
      group_closer=0
      if (line !~ /[{].*[}]/ && line !~ /[(].*[)]/) {
        if (line ~ /[{(][[:space:]]*$/ && line !~ /[$<>]\([[:space:]]*$/) {
          group_opener=1
        }
        if (line ~ /(^|[;&|])[[:space:]]*[})]([[:space:];]|$)/) {
          group_closer=1
        }
      }
      if (opener_count > 1 || closer_count > 1 ||
          (opener_count + group_opener > 0 && closer_count + group_closer > 0)) {
        reject("Release provenance guard check found ambiguous compact shell control flow")
      }

      block_depth-=closer_count + group_closer
      if (block_depth < 0) {
        reject("Release provenance guard check found ambiguous shell nesting")
      }
      if (substitution_depth > 0 &&
          (line ~ /\)[[:space:]]*$/ ||
           line ~ /\)[[:space:]]*;[[:space:]]*(then|do)[[:space:]]*$/)) {
        substitution_depth--
      }

      backtick_line=line
      backtick_count=gsub(/`/, "", backtick_line)
      if (backtick_count % 2 == 1) {
        backtick_depth=1-backtick_depth
      }

      if (line == guard) {
        if (block_depth != 0 || substitution_depth != 0 || backtick_depth != 0) {
          reject("Each release provenance guard must be an unconditional top-level Bash command")
        }
        top_level_guards++
      }

      block_depth+=opener_count + group_opener
      if (line ~ /[$<>]\(/ && line !~ /\)/) {
        substitution_depth++
      }
    }

    END {
      if (!failed && continued_line) {
        reject("Release provenance guard check found an unterminated logical line")
      }
      if (!failed && top_level_guards != 2) {
        reject("Release must contain exactly two unconditional top-level provenance guards")
      }
      if (!failed && (block_depth != 0 || substitution_depth != 0 || backtick_depth != 0)) {
        reject("Release provenance guard check found ambiguous shell nesting")
      }
    }
  ' "$release_file"; then
    return 1
  fi
}

verify_credential_scope scripts/release.sh
verify_guard_structure scripts/release.sh
verify_release_entry_binding scripts/release.sh
verify_source_identity_constants scripts/check-release-provenance.sh
! grep -Fq 'gh release create' scripts/release.sh
grep -F 'gh release edit "$TAG"' scripts/release.sh | grep -Fq -- '--verify-tag'

PROBE_DIR=$(mktemp -d)
SCOPE_PROBE_DIR=$(mktemp -d)
DRIVER_PROBE_DIR=$(mktemp -d)
REMOTE_DIR=$(mktemp -d)/release-guard.git
trap 'rm -rf "$PROBE_DIR" "$SCOPE_PROBE_DIR" "$DRIVER_PROBE_DIR" "$(dirname "$REMOTE_DIR")"' EXIT
mkdir -p "$PROBE_DIR/scripts"

sed 's#^/bin/bash -p scripts/check-release-provenance.sh "$V"$#/bin/bash scripts/check-release-provenance.sh "$V"#' \
  scripts/release.sh > "$SCOPE_PROBE_DIR/nonprivileged-provenance-shell.sh"
if verify_guard_structure "$SCOPE_PROBE_DIR/nonprivileged-provenance-shell.sh" >/dev/null 2>&1; then
  echo 'Guard structure check accepted provenance calls without privileged Bash isolation' >&2
  exit 1
fi
sed 's|^#!/bin/bash -p$|#!/usr/bin/env bash|' scripts/release.sh > "$SCOPE_PROBE_DIR/nonprivileged-release-entry.sh"
if verify_release_entry_binding "$SCOPE_PROBE_DIR/nonprivileged-release-entry.sh" >/dev/null 2>&1; then
  echo 'Release entry check accepted a nonprivileged interpreter' >&2
  exit 1
fi
sed '/^unset CDPATH$/d' scripts/release.sh > "$SCOPE_PROBE_DIR/cdpath-sensitive-release-entry.sh"
if verify_release_entry_binding "$SCOPE_PROBE_DIR/cdpath-sensitive-release-entry.sh" >/dev/null 2>&1; then
  echo 'Release entry check accepted inherited CDPATH' >&2
  exit 1
fi
sed '/^SANITIZE_ENV_ARGS=()$/d' scripts/release.sh > "$SCOPE_PROBE_DIR/unsanitized-release-children.sh"
if verify_release_entry_binding "$SCOPE_PROBE_DIR/unsanitized-release-children.sh" >/dev/null 2>&1; then
  echo 'Release entry check accepted unsanitized Bash child startup state' >&2
  exit 1
fi

SYMLINK_ENTRY_DIR="$SCOPE_PROBE_DIR/symlink-entry"
SYMLINK_ENTRY_MARKER="$SCOPE_PROBE_DIR/symlink-entry-used-adjacent-guard"
mkdir -p "$SYMLINK_ENTRY_DIR/scripts"
ln -s "$(pwd -P)/scripts/release.sh" "$SYMLINK_ENTRY_DIR/scripts/release.sh"
printf '{"version":"9.9.9"}\n' > "$SYMLINK_ENTRY_DIR/package.json"
printf '%s\n' \
  '#!/bin/bash' \
  'printf used > "$SYMLINK_ENTRY_MARKER"' \
  'exit 73' > "$SYMLINK_ENTRY_DIR/scripts/check-release-provenance.sh"
chmod +x "$SYMLINK_ENTRY_DIR/scripts/check-release-provenance.sh"
if SYMLINK_ENTRY_MARKER="$SYMLINK_ENTRY_MARKER" \
  "$SYMLINK_ENTRY_DIR/scripts/release.sh" >"$SCOPE_PROBE_DIR/symlink-entry.out" 2>"$SCOPE_PROBE_DIR/symlink-entry.err"; then
  echo 'Release entry symlink probe unexpectedly completed' >&2
  exit 1
fi
if [ -e "$SYMLINK_ENTRY_MARKER" ]; then
  echo 'Release entry followed an invocation symlink into an adjacent fake tree' >&2
  exit 1
fi

sed 's#^CANONICAL_REPOSITORY=.*#CANONICAL_REPOSITORY=WrongOwner/WrongRepository#' \
  scripts/check-release-provenance.sh > "$SCOPE_PROBE_DIR/wrong-repository.sh"
if verify_source_identity_constants "$SCOPE_PROBE_DIR/wrong-repository.sh" >/dev/null 2>&1; then
  echo 'Source identity pin accepted the wrong production repository' >&2
  exit 1
fi
sed "s#^CANONICAL_REMOTE_URL=.*#CANONICAL_REMOTE_URL='https://github.com/WrongOwner/WrongRepository.git'#" \
  scripts/check-release-provenance.sh > "$SCOPE_PROBE_DIR/wrong-repository-url.sh"
if verify_source_identity_constants "$SCOPE_PROBE_DIR/wrong-repository-url.sh" >/dev/null 2>&1; then
  echo 'Source identity pin accepted the wrong production repository URL' >&2
  exit 1
fi
cp scripts/check-release-provenance.sh "$SCOPE_PROBE_DIR/overridden-repository-url.sh"
printf '%s\n' "CANONICAL_REMOTE_URL='https://github.com/WrongOwner/WrongRepository.git'" >> "$SCOPE_PROBE_DIR/overridden-repository-url.sh"
if verify_source_identity_constants "$SCOPE_PROBE_DIR/overridden-repository-url.sh" >/dev/null 2>&1; then
  echo 'Source identity pin accepted a later production repository URL override' >&2
  exit 1
fi

# Mutation controls prove the scope assertion fails closed if the inherited-env
# reset, non-export guarantee, or build-only binding is removed later.
sed '/^unset APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD$/d' scripts/release.sh > "$SCOPE_PROBE_DIR/no-credential-reset.sh"
if verify_credential_scope "$SCOPE_PROBE_DIR/no-credential-reset.sh" >/dev/null 2>&1; then
  echo 'Credential scope check accepted a release without the inherited-env reset' >&2
  exit 1
fi
sed 's/^APPLE_ID="$(security/export APPLE_ID="$(security/' scripts/release.sh > "$SCOPE_PROBE_DIR/exported-credential.sh"
if verify_credential_scope "$SCOPE_PROBE_DIR/exported-credential.sh" >/dev/null 2>&1; then
  echo 'Credential scope check accepted a globally exported Apple credential' >&2
  exit 1
fi
sed 's/^APPLE_TEAM_ID=.*/export APPLE_ID APPLE_APP_SPECIFIC_PASSWORD/' scripts/release.sh > "$SCOPE_PROBE_DIR/exported-names.sh"
if verify_credential_scope "$SCOPE_PROBE_DIR/exported-names.sh" >/dev/null 2>&1; then
  echo 'Credential scope check accepted bare exported Apple credential names' >&2
  exit 1
fi
awk '
  $0 == "unset APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD" {
    print "if false; then"
    print
    print "fi"
    next
  }
  { print }
' scripts/release.sh > "$SCOPE_PROBE_DIR/conditional-reset.sh"
if verify_credential_scope "$SCOPE_PROBE_DIR/conditional-reset.sh" >/dev/null 2>&1; then
  echo 'Credential scope check accepted an unreachable inherited-env reset' >&2
  exit 1
fi
sed 's/^APPLE_ID="$APPLE_ID" APPLE_TEAM_ID="$APPLE_TEAM_ID" APPLE_APP_SPECIFIC_PASSWORD="$APPLE_APP_SPECIFIC_PASSWORD" npm run build/npm run build/' scripts/release.sh > "$SCOPE_PROBE_DIR/unscoped-build.sh"
if verify_credential_scope "$SCOPE_PROBE_DIR/unscoped-build.sh" >/dev/null 2>&1; then
  echo 'Credential scope check accepted an unscoped Mac build' >&2
  exit 1
fi

verify_driver_success_trace() {
  local log_file=$1
  local guard_event guard_count first_guard_line final_guard_line
  local github_line build_line spctl_count last_spctl_line upload_line publish_line

  guard_event=$'bash\tscripts/check-release-provenance.sh '"$DRIVER_PROBE_VERSION"
  guard_count=$(grep -xcF -- "$guard_event" "$log_file" || true)
  first_guard_line=$(grep -nFx -- "$guard_event" "$log_file" | head -1 | cut -d: -f1 || true)
  final_guard_line=$(grep -nFx -- "$guard_event" "$log_file" | tail -1 | cut -d: -f1 || true)
  github_line=$(grep -nF -- $'gh\trelease view ' "$log_file" | cut -d: -f1 || true)
  build_line=$(grep -nFx -- $'npm\trun build' "$log_file" | cut -d: -f1 || true)
  spctl_count=$(grep -cF -- $'spctl\t-a -vvv -t install ' "$log_file" || true)
  last_spctl_line=$(grep -nF -- $'spctl\t-a -vvv -t install ' "$log_file" | tail -1 | cut -d: -f1 || true)
  upload_line=$(grep -nF -- $'bash\tscripts/upload-release-assets-by-id.sh ' "$log_file" | cut -d: -f1 || true)
  publish_line=$(grep -nF -- $'gh\trelease edit ' "$log_file" | cut -d: -f1 || true)

  if [ "$guard_count" -ne 2 ] || [ "$spctl_count" -ne 2 ]; then
    echo 'Mocked release must execute both provenance guards and both Gatekeeper checks' >&2
    return 1
  fi
  if [ -z "$first_guard_line" ] || [ -z "$final_guard_line" ] ||
    [ -z "$github_line" ] || [ -z "$build_line" ] ||
    [ -z "$last_spctl_line" ] || [ -z "$upload_line" ] ||
    [ -z "$publish_line" ]; then
    echo 'Mocked release trace is missing a protected transaction boundary' >&2
    return 1
  fi
  if (( first_guard_line >= github_line
     || first_guard_line >= build_line
     || final_guard_line <= build_line
     || final_guard_line <= last_spctl_line
     || final_guard_line >= upload_line
     || final_guard_line >= publish_line )); then
    echo 'Mocked release did not execute provenance guards at both required boundaries' >&2
    return 1
  fi
}

verify_first_guard_failure_trace() {
  local log_file=$1
  local guard_event guard_count

  guard_event=$'bash\tscripts/check-release-provenance.sh '"$DRIVER_PROBE_VERSION"
  guard_count=$(grep -xcF -- "$guard_event" "$log_file" || true)
  if [ "$guard_count" -ne 1 ]; then
    echo 'First-guard failure probe did not stop on the first provenance call' >&2
    return 1
  fi
  if grep -Eq $'^(gh|git|security|npm|spctl|cp|rm|mkdir)\t' "$log_file" ||
    grep -Fq -- $'bash\tscripts/upload-release-assets-by-id.sh ' "$log_file"; then
    echo 'First provenance guard failure did not abort before protected side effects' >&2
    return 1
  fi
}

verify_second_guard_failure_trace() {
  local log_file=$1
  local guard_event guard_count final_guard_line spctl_count last_spctl_line

  guard_event=$'bash\tscripts/check-release-provenance.sh '"$DRIVER_PROBE_VERSION"
  guard_count=$(grep -xcF -- "$guard_event" "$log_file" || true)
  final_guard_line=$(grep -nFx -- "$guard_event" "$log_file" | tail -1 | cut -d: -f1 || true)
  spctl_count=$(grep -cF -- $'spctl\t-a -vvv -t install ' "$log_file" || true)
  last_spctl_line=$(grep -nF -- $'spctl\t-a -vvv -t install ' "$log_file" | tail -1 | cut -d: -f1 || true)
  if [ "$guard_count" -ne 2 ] || [ "$spctl_count" -ne 2 ] ||
    [ -z "$final_guard_line" ] || [ -z "$last_spctl_line" ]; then
    echo 'Second-guard failure probe did not reach the final provenance boundary' >&2
    return 1
  fi
  if (( final_guard_line <= last_spctl_line )); then
    echo 'Second provenance guard ran before the mocked Gatekeeper checks completed' >&2
    return 1
  fi
  if grep -Fq -- $'bash\tscripts/upload-release-assets-by-id.sh ' "$log_file" ||
    grep -Fq -- $'gh\trelease edit ' "$log_file"; then
    echo 'Second provenance guard failure did not abort before upload or publication' >&2
    return 1
  fi
}

run_driver_probe() {
  local release_file=$1
  local log_file=$2
  local fail_guard_at=${3:-0}
  local guard_state="${log_file}.guard-state"

  : > "$log_file"
  : > "$guard_state"
  DRIVER_LOG="$log_file" \
  DRIVER_GUARD_STATE="$guard_state" \
  DRIVER_PROBE_VERSION="$DRIVER_PROBE_VERSION" \
    DRIVER_BASH_ENV_MARKER="$DRIVER_PROBE_DIR/bash-env-marker" \
    DRIVER_IMPORTED_FUNCTION_MARKER="$DRIVER_PROBE_DIR/imported-function-marker" \
    BASH_ENV="$DRIVER_PROBE_DIR/hostile-bash-env.sh" \
    POSIXLY_CORRECT=1 \
    FAIL_GUARD_AT="$fail_guard_at" \
    PATH="$DRIVER_PROBE_DIR/mock-bin" \
    /bin/bash -p "$release_file" >"${log_file}.out" 2>"${log_file}.err"
}

DRIVER_REPOSITORY_DIR="$DRIVER_PROBE_DIR/repository"
mkdir -p "$DRIVER_PROBE_DIR/mock-bin" "$DRIVER_REPOSITORY_DIR/scripts"
printf '%s\n' 'printf reached > "$DRIVER_BASH_ENV_MARKER"' > "$DRIVER_PROBE_DIR/hostile-bash-env.sh"
hostile_release_child() {
  printf imported > "$DRIVER_IMPORTED_FUNCTION_MARKER"
}
export -f hostile_release_child
DRIVER_RELEASE_FILE="$DRIVER_REPOSITORY_DIR/scripts/release.sh"
sed \
  -e "s#/tmp/rel-gate.log#$DRIVER_PROBE_DIR/rel-gate.log#g" \
  -e "s#/tmp/rel-mac.log#$DRIVER_PROBE_DIR/rel-mac.log#g" \
  -e 's#^/bin/bash -p scripts/check-release-provenance.sh "$V"$#bash scripts/check-release-provenance.sh "$V"#' \
  scripts/release.sh > "$DRIVER_RELEASE_FILE"
cat > "$DRIVER_PROBE_DIR/mock-bin/mock-command" <<'MOCK_COMMAND'
#!/bin/bash
set -euo pipefail

command_name=${0##*/}
printf '%s\t%s\n' "$command_name" "$*" >> "$DRIVER_LOG"
if declare -F hostile_release_child >/dev/null 2>&1; then
  hostile_release_child
fi

case "$command_name" in
  bash)
    if [ "${1:-}" = 'scripts/check-release-provenance.sh' ]; then
      guard_count=0
      if [ -s "$DRIVER_GUARD_STATE" ]; then
        read -r guard_count < "$DRIVER_GUARD_STATE"
      fi
      guard_count=$((guard_count + 1))
      printf '%s\n' "$guard_count" > "$DRIVER_GUARD_STATE"
      if [ "${FAIL_GUARD_AT:-0}" = "$guard_count" ]; then
        exit 91
      fi
    fi
    ;;
  node)
    if [ "${1:-}" = '-p' ]; then
      printf '%s\n' "$DRIVER_PROBE_VERSION"
    fi
    ;;
  gh)
    if [ "${1:-}" = 'release' ] && [ "${2:-}" = 'view' ]; then
      printf 'true\t123\thttps://uploads.github.com/repos/Base1520/Sermon-Study-Tool/releases/123/assets{?name,label}\tThe-Operator-windows.exe\x1flatest.yml\x1fwindows-source.json\n'
    fi
    ;;
  git)
    if [ "${1:-}" = 'rev-parse' ] && [ "${2:-}" = 'HEAD' ]; then
      printf '0123456789abcdef0123456789abcdef01234567\n'
    fi
    ;;
  security)
    if [[ " $* " == *' -w '* ]]; then
      printf 'synthetic-app-password\n'
    else
      printf '    "acct"<blob>="synthetic@example.invalid"\n'
    fi
    ;;
  spctl)
    printf 'source=Notarized Developer ID\n'
    ;;
esac
MOCK_COMMAND
chmod +x "$DRIVER_PROBE_DIR/mock-bin/mock-command"
for command_name in bash node gh git security npm spctl cp rm mkdir; do
  cp "$DRIVER_PROBE_DIR/mock-bin/mock-command" "$DRIVER_PROBE_DIR/mock-bin/$command_name"
done
for command_name in awk dirname grep tail; do
  command_path=$(command -v "$command_name")
  ln -s "$command_path" "$DRIVER_PROBE_DIR/mock-bin/$command_name"
done

SUCCESS_LOG="$DRIVER_PROBE_DIR/success.log"
if ! run_driver_probe "$DRIVER_RELEASE_FILE" "$SUCCESS_LOG"; then
  echo 'Mocked release driver rejected the valid two-guard transaction' >&2
  exit 1
fi
verify_driver_success_trace "$SUCCESS_LOG"
if [ -e "$DRIVER_PROBE_DIR/bash-env-marker" ] || [ -e "$DRIVER_PROBE_DIR/imported-function-marker" ]; then
  echo 'Privileged release entry propagated caller shell startup code to a Bash child' >&2
  exit 1
fi
unset -f hostile_release_child

FIRST_FAILURE_LOG="$DRIVER_PROBE_DIR/first-guard-failure.log"
if run_driver_probe "$DRIVER_RELEASE_FILE" "$FIRST_FAILURE_LOG" 1; then
  echo 'Mocked release driver ignored a failing first provenance guard' >&2
  exit 1
fi
verify_first_guard_failure_trace "$FIRST_FAILURE_LOG"

SECOND_FAILURE_LOG="$DRIVER_PROBE_DIR/second-guard-failure.log"
if run_driver_probe "$DRIVER_RELEASE_FILE" "$SECOND_FAILURE_LOG" 2; then
  echo 'Mocked release driver ignored a failing final provenance guard' >&2
  exit 1
fi
verify_second_guard_failure_trace "$SECOND_FAILURE_LOG"

awk -v guard="$PROVENANCE_GUARD_COMMAND" '
  !changed && $0 == guard { print "# " $0; changed=1; next }
  { print }
' scripts/release.sh > "$DRIVER_PROBE_DIR/commented-first-guard.sh"
if verify_guard_structure "$DRIVER_PROBE_DIR/commented-first-guard.sh" >/dev/null 2>&1; then
  echo 'Guard structure check accepted a commented provenance call' >&2
  exit 1
fi

awk -v guard="$PROVENANCE_GUARD_COMMAND" '
  !changed && $0 == guard { print "true || " $0; changed=1; next }
  { print }
' scripts/release.sh > "$DRIVER_PROBE_DIR/short-circuited-first-guard.sh"
if verify_guard_structure "$DRIVER_PROBE_DIR/short-circuited-first-guard.sh" >/dev/null 2>&1; then
  echo 'Guard structure check accepted a short-circuited provenance call' >&2
  exit 1
fi

awk '
  $0 == "echo \"--- final provenance check ---\"" { print "if false; then"; print; next }
  $0 == "echo \"--- completing and publishing $TAG ---\"" { print; print "fi"; next }
  { print }
' scripts/release.sh > "$DRIVER_PROBE_DIR/unreachable-final-guard.sh"
if verify_guard_structure "$DRIVER_PROBE_DIR/unreachable-final-guard.sh" >/dev/null 2>&1; then
  echo 'Guard structure check accepted an unreachable final provenance call' >&2
  exit 1
fi

awk '
  $0 == "echo \"--- final provenance check ---\"" {
    print "if [ \"${SKIP_FINAL_PROVENANCE:-0}\" != 1 ]; then"
    print
    next
  }
  $0 == "echo \"--- completing and publishing $TAG ---\"" { print; print "fi"; next }
  { print }
' scripts/release.sh > "$DRIVER_PROBE_DIR/environment-conditional-final-guard.sh"
if verify_guard_structure "$DRIVER_PROBE_DIR/environment-conditional-final-guard.sh" >/dev/null 2>&1; then
  echo 'Guard structure check accepted an environment-conditional final provenance call' >&2
  exit 1
fi

awk '
  $0 == "echo \"--- final provenance check ---\"" {
    print ":; if [ \"${SKIP_FINAL_PROVENANCE:-0}\" != 1 ]; then"
    print
    next
  }
  $0 == "echo \"--- completing and publishing $TAG ---\"" { print; print ":; fi"; next }
  { print }
' scripts/release.sh > "$DRIVER_PROBE_DIR/list-prefixed-conditional-final-guard.sh"
if verify_guard_structure "$DRIVER_PROBE_DIR/list-prefixed-conditional-final-guard.sh" >/dev/null 2>&1; then
  echo 'Guard structure check accepted a list-prefixed conditional final provenance call' >&2
  exit 1
fi

awk '
  $0 == "echo \"--- final provenance check ---\"" {
    print "i\\"
    print "f [ \"${SKIP_FINAL_PROVENANCE:-0}\" != 1 ]; then"
    print
    next
  }
  $0 == "echo \"--- completing and publishing $TAG ---\"" {
    print
    print "f\\"
    print "i"
    next
  }
  { print }
' scripts/release.sh > "$DRIVER_PROBE_DIR/continued-token-final-guard.sh"
if verify_guard_structure "$DRIVER_PROBE_DIR/continued-token-final-guard.sh" >/dev/null 2>&1; then
  echo 'Guard structure check accepted a continued-token conditional final provenance call' >&2
  exit 1
fi

# The production guard pins the public GitHub source. Replace only that expected
# URL in this isolated fixture so every identity check still executes against a
# local bare remote without contacting GitHub.
sed "s#^CANONICAL_REMOTE_URL=.*#CANONICAL_REMOTE_URL='$REMOTE_DIR'#" \
  scripts/check-release-provenance.sh > "$PROBE_DIR/scripts/check-release-provenance.sh"
printf '{"version":"1.4.2"}\n' > "$PROBE_DIR/package.json"
mkdir -p "$PROBE_DIR/src"
printf 'export const releaseInput = "reviewed";\n' > "$PROBE_DIR/src/release-input.js"
git -C "$PROBE_DIR" init -q
git -C "$PROBE_DIR" add package.json scripts/check-release-provenance.sh src/release-input.js
git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' commit -qm 'fixture'
git init --bare -q "$REMOTE_DIR"
git -C "$PROBE_DIR" branch -M main
git -C "$PROBE_DIR" remote add origin "$REMOTE_DIR"
git -C "$PROBE_DIR" push -qu origin main

if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >"$(dirname "$REMOTE_DIR")/missing-tag.out" 2>"$(dirname "$REMOTE_DIR")/missing-tag.err"; then
  echo 'Release provenance guard accepted a release with no remote version tag' >&2
  exit 1
fi
grep -Fq 'Remote release tag v1.4.2 does not exist' "$(dirname "$REMOTE_DIR")/missing-tag.err"

git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' tag -am 'annotated fixture tag' v1.4.2
git -C "$PROBE_DIR" push -q origin refs/tags/v1.4.2
if ! bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null; then
  echo 'Release provenance guard rejected a correct annotated release tag' >&2
  exit 1
fi

CDPATH_ACTUAL_DIR="$SCOPE_PROBE_DIR/cdpath-actual"
mkdir -p "$CDPATH_ACTUAL_DIR/scripts"
cp "$PROBE_DIR/scripts/check-release-provenance.sh" "$CDPATH_ACTUAL_DIR/scripts/check-release-provenance.sh"
printf '{"version":"9.9.8"}\n' > "$CDPATH_ACTUAL_DIR/package.json"
if (
  cd "$CDPATH_ACTUAL_DIR"
  CDPATH="$PROBE_DIR" bash scripts/check-release-provenance.sh 1.4.2 >/dev/null 2>&1
); then
  echo 'Release provenance guard let CDPATH redirect source binding into another checkout' >&2
  exit 1
fi
BASH_ENV_FILE="$SCOPE_PROBE_DIR/redirect-bash-env.sh"
BASH_ENV_MARKER="$SCOPE_PROBE_DIR/bash-env-ran"
printf '%s\n' \
  'printf reached > "$BASH_ENV_MARKER"' \
  'cd() { builtin cd "$BASH_ENV_REDIRECT"; }' > "$BASH_ENV_FILE"
if (
  cd "$CDPATH_ACTUAL_DIR"
  BASH_ENV="$BASH_ENV_FILE" \
    BASH_ENV_MARKER="$BASH_ENV_MARKER" \
    BASH_ENV_REDIRECT="$PROBE_DIR" \
    /bin/bash -p scripts/check-release-provenance.sh 1.4.2 >/dev/null 2>&1
); then
  echo 'Privileged provenance shell let BASH_ENV redirect source binding' >&2
  exit 1
fi
if [ -e "$BASH_ENV_MARKER" ]; then
  echo 'Privileged provenance shell executed caller-controlled BASH_ENV' >&2
  exit 1
fi

# Official-source identity is independent of byte equality. Each adversarial
# fixture below points at the same commit and tag as the valid control; only the
# repository context, remote identity, canonical branch, or URL resolution is
# wrong. The guard must reject all of them before trusting that source.
if GIT_DIR="$PROBE_DIR/.git" GIT_WORK_TREE="$PROBE_DIR" \
  bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted caller-controlled Git repository context' >&2
  exit 1
fi

git -C "$PROBE_DIR" remote add mirror "$REMOTE_DIR"
git -C "$PROBE_DIR" fetch -q mirror '+refs/heads/main:refs/remotes/mirror/main'
git -C "$PROBE_DIR" branch --set-upstream-to=mirror/main main >/dev/null
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted main tracking a noncanonical upstream' >&2
  exit 1
fi
git -C "$PROBE_DIR" branch --set-upstream-to=origin/main main >/dev/null
if RELEASE_REMOTE=mirror \
  bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted an ambient alternate release remote' >&2
  exit 1
fi
git -C "$PROBE_DIR" branch --unset-upstream
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted canonical main without an upstream' >&2
  exit 1
fi
git -C "$PROBE_DIR" branch --set-upstream-to=origin/main main >/dev/null

git -C "$PROBE_DIR" checkout -qb release-candidate
git -C "$PROBE_DIR" push -qu origin release-candidate
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted a noncanonical release branch' >&2
  exit 1
fi
git -C "$PROBE_DIR" checkout -q main

ALTERNATE_REMOTE_URL="$REMOTE_DIR/../${REMOTE_DIR##*/}"
git -C "$PROBE_DIR" remote set-url origin "$ALTERNATE_REMOTE_URL"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted an alternate URL for the official remote name' >&2
  exit 1
fi
git -C "$PROBE_DIR" remote set-url origin "$REMOTE_DIR"

git -C "$PROBE_DIR" remote set-url --add origin "$ALTERNATE_REMOTE_URL"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted multiple configured official-remote URLs' >&2
  exit 1
fi
git -C "$PROBE_DIR" config --local --unset-all remote.origin.url
git -C "$PROBE_DIR" config --local --add remote.origin.url "$REMOTE_DIR"

git -C "$PROBE_DIR" config --local "url.$ALTERNATE_REMOTE_URL.insteadOf" "$REMOTE_DIR"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted a rewritten effective remote URL' >&2
  exit 1
fi
git -C "$PROBE_DIR" config --local --unset-all "url.$ALTERNATE_REMOTE_URL.insteadOf"

git -C "$PROBE_DIR" remote set-url --push origin "$ALTERNATE_REMOTE_URL"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted a separate noncanonical push URL' >&2
  exit 1
fi
git -C "$PROBE_DIR" config --local --unset-all remote.origin.pushurl

git -C "$PROBE_DIR" config --local remote.origin.vcs audit
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted a repository-local remote helper override' >&2
  exit 1
fi
git -C "$PROBE_DIR" config --local --unset-all remote.origin.vcs

if GIT_SSH_COMMAND=/bin/false GIT_SSH_VARIANT=ssh \
  bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted a caller-controlled SSH transport' >&2
  exit 1
fi
if GIT_EXEC_PATH=/private/tmp/noncanonical-git-helpers \
  bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard accepted a caller-controlled Git helper path' >&2
  exit 1
fi

# A malicious fetch mapping can make the local origin/main tracking ref look
# current while the official remote main has advanced. The release decision
# must query refs/heads/main directly rather than trusting that cached mapping.
git -C "$PROBE_DIR" checkout -qb remote-main-ahead
printf 'export const releaseInput = "official main moved";\n' > "$PROBE_DIR/src/release-input.js"
git -C "$PROBE_DIR" add src/release-input.js
git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' commit -qm 'advance official main'
git -C "$PROBE_DIR" push -q origin HEAD:main
git -C "$PROBE_DIR" checkout -q main
git -C "$PROBE_DIR" config --local --unset-all remote.origin.fetch
git -C "$PROBE_DIR" config --local --add remote.origin.fetch \
  '+refs/heads/release-candidate:refs/remotes/origin/main'
git -C "$PROBE_DIR" fetch -q origin
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >/dev/null 2>&1; then
  echo 'Release provenance guard trusted a poisoned tracking ref instead of official main' >&2
  exit 1
fi
git -C "$PROBE_DIR" config --local --unset-all remote.origin.fetch
git -C "$PROBE_DIR" config --local --add remote.origin.fetch \
  '+refs/heads/*:refs/remotes/origin/*'
git -C "$PROBE_DIR" push -qf origin main:main
git -C "$PROBE_DIR" fetch -q origin

printf 'export const releaseInput = "unreviewed";\n' > "$PROBE_DIR/src/release-input.js"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >"$(dirname "$REMOTE_DIR")/dirty-tracked.out" 2>"$(dirname "$REMOTE_DIR")/dirty-tracked.err"; then
  echo 'Release provenance guard accepted an uncommitted tracked build input' >&2
  exit 1
fi
grep -Fq 'Working tree is not clean' "$(dirname "$REMOTE_DIR")/dirty-tracked.err"
git -C "$PROBE_DIR" restore src/release-input.js

printf 'export const releaseInput = "staged but unreviewed";\n' > "$PROBE_DIR/src/release-input.js"
git -C "$PROBE_DIR" add src/release-input.js
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >"$(dirname "$REMOTE_DIR")/dirty-staged.out" 2>"$(dirname "$REMOTE_DIR")/dirty-staged.err"; then
  echo 'Release provenance guard accepted a staged build input' >&2
  exit 1
fi
grep -Fq 'Working tree is not clean' "$(dirname "$REMOTE_DIR")/dirty-staged.err"
git -C "$PROBE_DIR" restore --staged --worktree src/release-input.js

printf 'export const untrackedReleaseInput = true;\n' > "$PROBE_DIR/src/untracked-release-input.js"
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.2 >"$(dirname "$REMOTE_DIR")/dirty-untracked.out" 2>"$(dirname "$REMOTE_DIR")/dirty-untracked.err"; then
  echo 'Release provenance guard accepted an untracked build input' >&2
  exit 1
fi
grep -Fq 'Working tree is not clean' "$(dirname "$REMOTE_DIR")/dirty-untracked.err"
rm "$PROBE_DIR/src/untracked-release-input.js"

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
git -C "$PROBE_DIR" tag v1.4.3
git -C "$PROBE_DIR" push -q origin refs/tags/v1.4.3
if ! bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null; then
  echo 'Release provenance guard rejected a correct lightweight release tag' >&2
  exit 1
fi

printf 'export const releaseInput = "reviewed after tag";\n' > "$PROBE_DIR/src/release-input.js"
git -C "$PROBE_DIR" add src/release-input.js
git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' commit -qm 'same version after tag'
git -C "$PROBE_DIR" push -q
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >"$(dirname "$REMOTE_DIR")/stale-tag.out" 2>"$(dirname "$REMOTE_DIR")/stale-tag.err"; then
  echo 'Release provenance guard accepted a stale same-version release tag' >&2
  exit 1
fi
grep -Fq 'Remote release tag v1.4.3 does not resolve to the release commit' "$(dirname "$REMOTE_DIR")/stale-tag.err"

git -C "$PROBE_DIR" tag -f v1.4.3 >/dev/null
git -C "$PROBE_DIR" push -qf origin refs/tags/v1.4.3
bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null

git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' tag -fam 'annotated replacement tag' v1.4.3 >/dev/null
git -C "$PROBE_DIR" push -qf origin refs/tags/v1.4.3
bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null

printf 'export const releaseInput = "reviewed after annotated tag";\n' > "$PROBE_DIR/src/release-input.js"
git -C "$PROBE_DIR" add src/release-input.js
git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' commit -qm 'same version after annotated tag'
git -C "$PROBE_DIR" push -q
if bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >"$(dirname "$REMOTE_DIR")/stale-annotated-tag.out" 2>"$(dirname "$REMOTE_DIR")/stale-annotated-tag.err"; then
  echo 'Release provenance guard accepted a stale same-version annotated release tag' >&2
  exit 1
fi
grep -Fq 'Remote release tag v1.4.3 does not resolve to the release commit' "$(dirname "$REMOTE_DIR")/stale-annotated-tag.err"

git -C "$PROBE_DIR" -c user.name='Release Guard Test' -c user.email='release-guard@example.invalid' tag -fam 'annotated current tag' v1.4.3 >/dev/null
git -C "$PROBE_DIR" push -qf origin refs/tags/v1.4.3
bash "$PROBE_DIR/scripts/check-release-provenance.sh" 1.4.3 >/dev/null

echo 'Release provenance guard passed'
