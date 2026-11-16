# Phase D1-D4 — ERP real-data PostgreSQL 17 staging

**Development status:** This is a stacked PR based on Phase C (#624), which is stacked on Phase B (#623). The production ERP still uses SQLite. These changes are not deployed to the VPS by GitHub CI or a routine merge.

## Acceptance criteria

- **D1:** Verify the actual live ERP SQLite path from the running Prisma/PM2 configuration. Create a private SQLite online backup snapshot using a read-only source connection. Provision a fresh isolated PostgreSQL 17 database bababuilds_erp_staging_SUFFIX with separate migration and runtime roles, no access to MenuMinute or ClubKeep.
- **D2:** Apply PostgreSQL baseline, import the snapshot, compare all 183 Prisma tables using field-level fingerprints, DateTime/Decimal/JSON/binary normalization, and exact financial totals per workspace and currency. Check per-invoice payments, payroll nets, workspace memberships and local media references.
- **D3:** Build an independent Next.js staging checkout, run under a dedicated erpstaging Unix user on 127.0.0.1:3101, verify private login, business pages, document access and permissions. Use a distinct auth secret, no OAuth/email provider credentials, and a systemd egress sandbox (IPAddressDeny=any; IPAddressAllow=localhost). No public vhost.
- **D4:** Run 16 racing same-key financial transactions and 2 different-key transactions using synthetic workspace/invoice records. Check exactly one payment per invoice, record p95 query latency and PG connection count, then delete test records and recheck full source parity.

CI performs all automated checks with **synthetic data**, including a real PG17 import, a second-database restore, financial tamper detection, D2 accounting checks and D4 synthetic concurrency. It cannot assert that the real host's 692 previous records or actual media are valid.

## Production safety

Do not execute from /var/www/bababuilds-erp or use the live ERP PostgreSQL database name. The one-shot operator runner refuses an existing staging suffix. It cannot merge/cut over production or reset/drop databases. It creates a staging database, stage roles, sensitive snapshot, local media clone and staging-only systemd unit. It does not back up or restart production services.

Root/OS restrictions: Snapshot, credentials, and evidence are stored under /var/lib/bababuilds-erp/staging/SUFFIX mode 0700 with sensitive files 0600. The Next.js staging process runs as erpstaging, not root. No outgoing payment, email, push or webhook processing may be permitted. Verify systemd network BPF restrictions are actually supported on the host before starting the staging service.

Even copied customer records remain confidential. Do not upload source snapshots, logs with customer records, password hashes, Stripe credentials, or raw detailed financial data to GitHub or chat.

## Operator preparation (VPS, privileged session)

Prerequisites: Ubuntu 24.04, PostgreSQL 17, Node 22, npm, Python 3.11+, Git, rsync, psql, runuser and systemd. Confirm free disk headroom and port 3101 free. Confirm the *actual live* SQLite file path, rather than relying on repository defaults.

Prepare a **separate clone**, using a new 4-12 character suffix such as 20261116a:

    sudo install -d -m 0755 /opt/bababuilds-erp-staging/20261116a
    sudo git clone https://github.com/baba-dev/BabaBuilds-ERP.git /opt/bababuilds-erp-staging/20261116a/app
    sudo git -C /opt/bababuilds-erp-staging/20261116a/app checkout feature/phase-d1-d4-postgresql-realdata-staging

Verify the checkout HEAD matches the reviewed PR SHA, and that the clone does not contain a production .env file. The original app checkout is never checked out to a new branch or reset.

Enter a root shell, set the exact paths and run once:

    sudo -i
    export ERP_STAGING_SUFFIX=20261116a
    export ERP_LIVE_SQLITE=/absolute/verified/erp/live.db
    export ERP_STAGING_CHECKOUT=/opt/bababuilds-erp-staging/20261116a/app
    export ERP_LIVE_MEDIA_ROOT=/var/www/bababuilds-erp
    bash "$ERP_STAGING_CHECKOUT/scripts/staging/deploy.sh"

Every phase fails closed, retaining sensitive staging state for operator inspection on failure rather than deleting an existing DB. If a business invariant is already inconsistent in source, correct the root issue before scheduling cutover; do not invent SQL rewrites.

## Access the isolated staging app

Use a private SSH tunnel from your own workstation:

    ssh -N -L 3101:127.0.0.1:3101 ubuntu@YOUR_VPS_HOST

Open http://127.0.0.1:3101 in the browser. Sign in with an existing test account or an approved staged user identity. Check:

- Login, role permissions, workspace switching and demo accounts
- Clients, invoices, recorded payments, expenses, retainers, proposals and payroll
- Reporting and tax totals per workspace and currency
- Documents, receipts, invoices, branding assets and private storage authorization
- Idempotent payment recording (synthetic data only), cross-workspace denial and no external settlement
- HTTP-only staging security: /api/webhooks/ and /api/cron/ must be denied

The script runs an automated local HTTP smoke, but the logged-in end-to-end browser review must be performed explicitly on the private copy. A custom domain/public web route is intentionally not created.

## Evidence directory

    /var/lib/bababuilds-erp/staging/SUFFIX/erp-live-snapshot.db
    /var/lib/bababuilds-erp/staging/SUFFIX/erp-live-snapshot.db.manifest.json
    /var/lib/bababuilds-erp/staging/SUFFIX/full-parity.json
    /var/lib/bababuilds-erp/staging/SUFFIX/business-invariants.json
    /var/lib/bababuilds-erp/staging/SUFFIX/post-concurrency-parity.json
    /var/lib/bababuilds-erp/staging/SUFFIX/credentials/

Redacted summary only:

    sudo jq '{status,table_count,row_count,table_fingerprint_matches,financial_parity,table_mismatches}' /var/lib/bababuilds-erp/staging/SUFFIX/full-parity.json

## Limitations

1. No backup infrastructure is added by this phase. The consistent SQLite snapshot is the minimum necessary for the data-copy rehearsal, not an off-host recovery program.
2. Exact cross-database parity proves the migration preserved values, not that historical invoices were always correctly reconciled. D2 business invariants separately flag those.
3. D4 probes synthetic financial transactions on the isolated staging database, not live gateway captures or external integration services.
4. A green CI is **not** proof a real-data staging instance is running. It is only complete when the authorized VPS runner succeeds and the app is manually inspected through the tunnel.
5. The final SQLite-to-PostgreSQL production cutover requires a separate supervised maintenance/write-freeze, latest snapshot, financial reconciliation, rollback design and explicit approval.
