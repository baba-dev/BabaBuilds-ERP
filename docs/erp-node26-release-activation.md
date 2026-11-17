# ERP Node 26: immutable auto-deploy, guardrails and rollback (Stage 2)

**Implementation:** `.github/workflows/deploy.yml`, `ops/erp-release/`, and `ops/systemd/erp-*`.

This is intentionally an **opt-in automated release system**. Merging the code by itself must not switch Node 22 production. GitHub CI has no SSH key or database credential. No checkout or untrusted pull-request code runs on the production runner.

## Architecture

1. A completed, successful CI workflow for the **latest** `main` SHA triggers the release workflow. Provenance checks the exact run, its repository/branch/event, and all six required jobs (including non-advisory browser smoke).
2. A GitHub-hosted **Ubuntu 24.04 ARM64** runner installs Node 26.13.1/npm 11.20.0, builds with **disposable PostgreSQL 17**, starts the actual packaged standalone server, and uploads a SHA-256-manifested release artifact. Never promote x64 or another runtime.
3. After opt-in, the existing GitHub Actions SSH route from PR #643 securely copies the tested ARM64 artifact into an isolated incoming directory on the ERP VPS. The reviewed, root-owned `/usr/local/sbin/bababuilds-erp-promote` operator is invoked with `sudo -n` and the original Node 22 rollback remains available.
4. The root operator validates runtime, PM2 process `erp`, PostgreSQL-only production and staging environment files, **fresh recovery proof**, media inventory and artifact hash/path safety.
5. A sandboxed `erp-node26-candidate@<sha>.service` runs as `erpstaging`, restricted to localhost with its own disposable PG17 database on port 3101. **It does not mount production media.** Service-worker checks are intentionally performed on the production process because staging mode disables the worker. Production media symlinks are attached only after the canary passes and stops.
6. The operator snapshots the exact existing PM2 command and environment (mode 0600), switches only `erp` to Node 26 and the immutable release on port 3000, checks HTTP session/login and the **actual process executable**, then saves root PM2 state.
7. Failures during promotion automatically restore the saved **old artifact + interpreter**, without rewinding PostgreSQL. The 1-minute systemd watchdog monitors login, authentication-session and service-worker HTTP health, PID, memory and restart count. Three failures within 45 minutes cause automatic rollback and freeze future auto-deploy; later failures freeze and alert through failed systemd/journal status for operator action.
8. Each deployment is serialized; stale CI SHA, missing operator, incomplete backup attestation, missing stage database, missing media mapping, or unavailable SSH access or missing protected operator **blocks deployment**.

### Prerequisites to enable the opt-in

**Do all of these on the VPS as an authorized operator; this PR cannot attest to the VPS by itself.**

- Independently inventory `pm2 jlist`, the Node 22 binary and its exact `erp` command, `/root/.pm2`, current PostgreSQL 17 URL, Nginx port 3000, all existing media including the previously verified DB references, and two `alerts` cron launcher entries. Confirm MenuMinute and ClubKeep are managed separately and untouched.
- Finish issue #640's unverified production acceptance tests: existing and new private media, document/PDF/report operations, service worker, real OAuth/passkeys/login, webhook signature/idempotency/reconciliation, cron and scheduled job behavior.
- Install scheduled **encrypted off-host PostgreSQL + media** backups and independently restore a recent backup into a **separate** PG17 database; verify representative media. Do not infer success from a Restic snapshot merely existing.
- Retain the existing repository `HOST`, `USERNAME` and `SSH_KEY` secrets used by the reviewed PR #643 deployment route. Require an unprivileged SSH login and restrict its sudoers grants to the trusted release operator and approved setup actions. The CI and ARM64 build stay on GitHub-hosted runners; never run pull-request code on the VPS.
- Configure GitHub environment `erp-production` with branch restriction `main`. The production job uses the existing SSH secrets; a new self-hosted runner is not required. Configure any required audit/approval policy separately; fully automatic promotion requires no manual reviewer at each deployment.
- Install Node 26.13.1 Linux ARM64 under `/opt/bababuilds-erp/node26` **alongside** `/opt/bababuilds-erp/node22`, never replacing Node 22 or a shared global `node`.

### Secure runtime installation example

Official Node 26.13.1 ARM64 archive SHA-256 is `89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd`.

```bash
curl -fsSLO https://nodejs.org/dist/v26.13.1/node-v26.13.1-linux-arm64.tar.xz
echo '89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd  node-v26.13.1-linux-arm64.tar.xz' | sha256sum -c -
sudo apt-get install -y libatomic1
sudo install -d -o root -g root -m 0755 /opt/bababuilds-erp/node26
sudo tar -xJf node-v26.13.1-linux-arm64.tar.xz -C /opt/bababuilds-erp/node26 --strip-components=1
/opt/bababuilds-erp/node26/bin/node --version  # v26.13.1
/opt/bababuilds-erp/node26/bin/npm --version   # 11.20.0
```

Use `sudo` for extraction too if running as a non-root shell. Install the root-owned operator **from a reviewed, tagged source checkout**, not from a dynamically downloaded PR artifact:

```bash
sudo install -d -o root -g root -m 0755 /usr/local/lib/bababuilds-erp-release
sudo install -d -o root -g root -m 0700 /var/lib/bababuilds-erp/release-manager
sudo install -d -o root -g root -m 0755 /opt/bababuilds-erp/releases
sudo install -o root -g root -m 0644 ops/erp-release/{promote,package}.py /usr/local/lib/bababuilds-erp-release/
# Create a root-owned, mode-0755 shell wrapper, with exact command:
# exec /usr/bin/python3 /usr/local/lib/bababuilds-erp-release/promote.py "$@"
sudo install -o root -g root -m 0644 ops/systemd/erp-node26-candidate@.service /etc/systemd/system/
sudo install -o root -g root -m 0644 ops/systemd/erp-release-watchdog.service /etc/systemd/system/
sudo install -o root -g root -m 0644 ops/systemd/erp-release-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

No production data, credentials or interpreter changes occur while installing these files.

### Protected configuration

Review `ops/erp-release/release-manager.example.json`. Place the modified configuration at `/etc/bababuilds-erp/release-manager.json` (root:root 0600). Its ten **required media mappings** must point to the verified real persistent directories outside any release tree. Do not create empty placeholders over missing production media. Confirm generated `public/partner-kit` assets are present in its persistent mapping.

**Reuse the two verified production environment files in their existing order**: `/var/www/bababuilds-erp/.env` and `/etc/bababuilds-erp/production-database.env`, both root:root 0600. The Node 26 operator reads and validates their PostgreSQL configuration and launches with both `--env-file` flags, matching the existing Node 22 cutover release. Never copy production credentials to CI or add a new unreviewed file. The promoter starts from a clean environment so inherited root/PM2 values cannot override these protected files.

Create `/etc/bababuilds-erp/canary.env` (root:root 0600) for the isolated PG17 database named `bababuilds_erp_staging_<suffix>`. Required: `DATABASE_URL`, `NEXTAUTH_URL=http://127.0.0.1:3101`, `NEXTAUTH_SECRET`, `AUTH_GOOGLE_ENABLED=false`, `AUTH_EMAIL_ENABLED=false`. No real payment/SMTP, customer secrets or production credentials. The systemd service adds `PORT=3101`, `ERP_STAGING_MODE=1`, `NODE_ENV=production`; do not override them. Ensure `erpstaging` user, database and filesystem permissions exist and prove its packet-filter egress denial independently.

Create `/var/lib/bababuilds-erp/release-manager/recovery.json` (root:root 0600) using the **all-false** template `ops/erp-release/recovery.example.json`. Set every check to true only after the corresponding production safety test has genuinely passed. Record a real verified Restic snapshot SHA (64 hex), the last completed **encrypted remote** PG17+media backup UTC time (must be within 36 hours), and the last independent restore UTC time (must be within 7 days). These fields must be refreshed by a verified operator process as backup and restore drills recur. Fabricated or stale evidence must block promotion.

### Review, activate, monitor

Before enabling automation:

```bash
sudo -n /usr/local/sbin/bababuilds-erp-promote preflight
sudo systemctl enable --now erp-release-watchdog.timer
sudo systemctl list-timers erp-release-watchdog.timer
```

Run an isolated canary rehearsal and a **full artifact + interpreter rollback** using an approved ARM64 release artifact before first activation. Before calling the promoter, compare the SHA256 manifest and the packaged PostgreSQL migration history with the current PostgreSQL 17 `_prisma_migrations` checksums; the promoter rejects mismatches without applying database migrations. Inspect `/proc/<erp-pid>/exe`, PM2 path/args, persistent media paths, auth/session, payment webhooks, scheduled jobs and Nginx public behavior. Keep the original Node 22 cutover directory and binary.

Finally, after these prerequisites and independent human approval, set **both** GitHub repository variables to the exact strings:

- `ERP_RECOVERY_VERIFIED=true`
- `ERP_AUTODEPLOY_ENABLED=true`

With those variables enabled, every **new green main CI run** automatically builds an ARM64 release, transfers it using the existing SSH route, and attempts protected production promotion; missing preconditions fail closed. The variables are not set by this PR. Enabling is an operational action and must never happen on the strength of the PR merge alone.

### Emergency rollback

```bash
sudo -n /usr/local/sbin/bababuilds-erp-promote rollback --expected-sha <active-40-char-sha>
sudo journalctl -u erp-release-watchdog.service --since '1 hour ago' --no-pager
```

Rollback restores the saved prior PM2 **command and Node interpreter together**, and leaves the **current PostgreSQL data and external financial transactions untouched**. If the saved process cannot be restarted, the operator writes `EMERGENCY_REVIEW_REQUIRED` and fails. The separate Node 22 binary and cutover release remain protected.

For diagnosis, inspect `/var/lib/bababuilds-erp/release-manager/{status,rollback}.json` as root; **rollback.json may contain private environment variables** and must never be uploaded to GitHub, CI logs or artifacts. Check PM2 logs and `journalctl` without disclosing credentials.

### Release-specific cautions

- A green CI run alone does not prove that scheduled backups, finance/webhook checks and media mounts work on the VPS. This workflow also checks that the stored release migration checksums exactly equal the applied production PostgreSQL migration ledger; it never performs a production migration.
- The rollout involves a brief PM2 process replacement, not zero-downtime traffic switching; use an approved low-traffic window for the **first** migration and rehearse rollback.
- Never trigger `prisma migrate deploy` on the production database from this pipeline. No Node runtime schema changes are included.
- Do not run `deploy.sh`, reinstall global Node, or touch MenuMinute/ClubKeep process configuration.
- Backups are not automatically evidence of restore success; preserve the encrypted originals.
- GitHub Action failure and systemd journal are operational signals; configure your external alerting sink to watch failed promotion and watchdog units before enabling unattended deployment.

### One-time automated commissioning inventory

After this commissioning change merges to `main`, `.github/workflows/erp-node26-commission.yml` uses the existing restricted SSH connection to run a **sanitized read-only audit** (PM2 interpreter/path only, service status, PG table count, directory presence and protected configuration *permissions*, never secret values), then installs only the SHA256-verified official Node 26.13.1 ARM64 runtime **beside** Node 22 if the original services and disk-space guards pass. It never touches PM2, Nginx, PostgreSQL data, media, crons or auto-promotion flags. Inspect its GitHub Actions logs to see whether the VPS is ready for operator/config/canary commissioning. You can rerun it by choosing `Run workflow` and `install_node=true`. This audit does not imply production is already on Node 26.

A manual `workflow_dispatch` entry in the production deploy workflow provides a protected one-time release path: require confirmation, green CI for the *latest* `main` SHA, and all the same root-owned recovery, isolated canary, PostgreSQL migration and rollback checks. The operator still refuses promotion if any prerequisite is missing. Automatic activation remains gated by the two repository variables and independent VPS verification.

### Automated protected operator installation (no activation)

After the Node26 runtime commissioning succeeds, `.github/workflows/erp-node26-operator-bootstrap.yml` can install the reviewed root-owned `package.py`, `promote.py`, installer and systemd templates through the existing trusted SSH route. The workflow verifies each file's immutable Git blob SHA **after** copying it into a root-owned staging directory, then installs the operator and inactive units. It never restarts ERP or enables timers. It also installs the reviewed `bababuilds-erp-backup` helper **without running it**, creates an all-false `recovery.json` checklist if missing, and creates `release-manager.json` using verified media paths if missing. Existing protected config files are never overwritten.

The operator must still be supplied a **genuine isolated canary database/environment**, an independently verified off-host backup and restore, and all outstanding finance, authentication, media and cron acceptance evidence. An all-false recovery checklist is intentional and must not be automatically marked complete. The full production promotion remains blocked until these checks have passed and the systemd watchdog is commissioned. Do not infer production readiness from the operator installation alone.
