#!/usr/bin/env bash
# Read-only supply-chain preflight for the exact reviewed Node.js v26.13.1
# Linux ARM64 release. Runs without VPS secrets on PR and again on trusted main.
set -Eeuo pipefail
umask 077

expected='89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd'
archive='node-v26.13.1-linux-arm64.tar.xz'
base='https://nodejs.org/dist/v26.13.1'
key='ops/shared-runtime/nodejs-release-key-5BE8A3F6.asc'
expected_signer='5BE8A3F6C8A5C01D106C0AD820B1A390B168D356'

test "$#" -eq 0 || { echo 'No arguments permitted' >&2; exit 2; }
test -f "$key" && test ! -L "$key" || exit 1
actual_signer="$(gpg --batch --with-colons --show-keys "$key" | awk -F: '$1=="fpr"{print $10; exit}')"
test "$actual_signer" = "$expected_signer" || {
  echo 'NODE26_REJECT: release signing key fingerprint mismatch' >&2; exit 1;
}

private="$(mktemp -d)"
trap 'rm -rf -- "$private"' EXIT
export GNUPGHOME="$private/gpg"
mkdir -m 0700 "$GNUPGHOME"
gpg --batch --quiet --import "$key"
curl --fail --location --proto '=https' --tlsv1.2 --retry 4 --max-time 120 \
  "$base/SHASUMS256.txt" --output "$private/SHASUMS256.txt"
curl --fail --location --proto '=https' --tlsv1.2 --retry 4 --max-time 120 \
  "$base/SHASUMS256.txt.sig" --output "$private/SHASUMS256.txt.sig"
gpgv --keyring "$GNUPGHOME/pubring.kbx" \
  "$private/SHASUMS256.txt.sig" "$private/SHASUMS256.txt"
test "$(grep -Fxc "$expected  $archive" "$private/SHASUMS256.txt")" = 1 || {
  echo 'NODE26_REJECT: pinned digest not in signed upstream manifest' >&2; exit 1;
}

mkdir -p runtime-artifacts
curl --fail --location --proto '=https' --tlsv1.2 --retry 4 --max-time 300 \
  "$base/$archive" --output "runtime-artifacts/$archive"
printf '%s  %s\n' "$expected" "runtime-artifacts/$archive" | sha256sum --check --status

python3 - <<'PY'
from pathlib import Path
import importlib.util
source = Path("ops/shared-runtime/provision_node26.py")
spec = importlib.util.spec_from_file_location("node26_installer", source)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
installer.validate_archive(Path("runtime-artifacts/node-v26.13.1-linux-arm64.tar.xz"), require_root_owned=False)
print("NODE26_ARCHIVE_MEMBER_VALIDATION_PASS")
PY
echo 'NODE26_OFFICIAL_SIGNED_ARTIFACT_VERIFIED release=v26.13.1 arch=linux-arm64'
