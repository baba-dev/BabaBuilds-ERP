#!/usr/bin/env bash
# One-time, reviewed installation of release-management code. It does NOT
# activate a release, touch PM2, enable auto-deploy or manufacture backup proof.
set -Eeuo pipefail
umask 077
(( EUID == 0 )) || { echo 'Run as authorized root operator' >&2; exit 1; }
[[ "$(uname -m)" == aarch64 ]] || { echo 'ERP release manager requires ARM64 host' >&2; exit 1; }
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd -- "$source_dir/../.." && pwd)"
install -d -o root -g root -m 0755 /usr/local/lib/bababuilds-erp-release
install -d -o root -g root -m 0700 /var/lib/bababuilds-erp/release-manager
install -d -o root -g root -m 0755 /opt/bababuilds-erp/releases
install -o root -g root -m 0644 "$source_dir/promote.py" /usr/local/lib/bababuilds-erp-release/promote.py
install -o root -g root -m 0644 "$source_dir/package.py" /usr/local/lib/bababuilds-erp-release/package.py
cat > /usr/local/sbin/bababuilds-erp-promote <<'EOF'
#!/bin/sh
exec /usr/bin/python3 /usr/local/lib/bababuilds-erp-release/promote.py "$@"
EOF
chown root:root /usr/local/sbin/bababuilds-erp-promote
chmod 0755 /usr/local/sbin/bababuilds-erp-promote
for unit in erp-node26-candidate@.service erp-release-watchdog.service erp-release-watchdog.timer; do
  install -o root -g root -m 0644 "$root/ops/systemd/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
echo 'ERP_RELEASE_OPERATOR_INSTALLED; no runtime activation or timer enablement performed'
echo 'Review docs/erp-node26-release-activation.md and provide protected config/backup proof before preflight.'
