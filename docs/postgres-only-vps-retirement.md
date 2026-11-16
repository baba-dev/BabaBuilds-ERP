# ERP PostgreSQL 17 — retirement of local SQLite leftovers

The production cutover and the independent encrypted off-host PostgreSQL restore completed 2026-11-16. This cleanup affects **ERP only**, never MenuMinute or ClubKeep.

## Source code cleanup

The active Prisma datasource and migrations use PostgreSQL 17. The old SQLite migration tree, SQLite importer, pre-cutover staging scripts, and SQLite-based CI fixture were removed from the active branch. Historical code remains available in Git history. No SQLite npm dependencies are present in the current ERP package manifest or lock file. CI checks this contract.

## VPS operation

The production Node22 standalone release under \`/opt/bababuilds-erp-cutover/cut1611b/app/.next/standalone\` must remain intact. Do not erase that release, the protected production PostgreSQL credentials, or the root PM2 saved startup definition.

Use the verified PostgreSQL Restic snapshot from the operator's successful independent restore drill:

\`\`\`bash
sudo python3 scripts/operations/retire_erp_sqlite.py \
  --verified-snapshot cdc8b2711024073dc8c5d3ab157e92ce8fd6f25d2064e9e75fe31a2d6bd18c92
\`\`\`

The default is read-only: it checks PostgreSQL 17 schema, protected database URL, active Node22 PM2 process, off-host snapshot existence, and absence of open SQLite file handles. It prints a precise list of ERP-only files proposed for removal. **Do not run from the old live checkout unless the new script was first installed from the reviewed and passing cleanup branch.**

After reviewing its output, apply the retirement:

\`\`\`bash
sudo python3 scripts/operations/retire_erp_sqlite.py --apply \
  --verified-snapshot cdc8b2711024073dc8c5d3ab157e92ce8fd6f25d2064e9e75fe31a2d6bd18c92
\`\`\`

The apply mode removes only the known ERP database and limited legacy \`dev-*.db\` backup files, after verifying no processes have them open. It removes legacy SQLite URL/config entries from \`/var/www/bababuilds-erp/.env\`, preserving all unrelated keys. It writes a protected backup of the original env file and a private operation record under \`/var/lib/bababuilds-erp/sqlite-retirement/\`. It never changes the active \`/etc/bababuilds-erp/production-database.env\`.

**Retained by design:** all encrypted remote recovery snapshots, protected final cutover evidence under \`/var/lib/bababuilds-erp/cutover/cut1611b\`, and the live standalone app. Do not recursively delete \`/opt/bababuilds-erp-cutover/cut1611b\`: it contains the running Node22 ERP.

## Final operational validation

- Public ERP can authenticate with a real account, open invoices/documents, and perform an authorized PostgreSQL-backed read.
- Database diagnostics show the application role connecting to \`bababuilds_erp\`, never an SQLite path.
- \`prisma/schema.prisma\` and \`prisma/migrations/migration_lock.toml\` both declare \`postgresql\`.
- The scheduler and provider webhooks function after the cutover.
- Scheduled encrypted PostgreSQL plus media backups are installed and independently restorable. Tracking: #640.

Do not globally uninstall \`sqlite3\`, delete unrelated services' \`*.db\` files, remove PostgreSQL backup tools, or delete the off-host snapshots. SQLite retirement is unrelated to the future Node.js runtime standardization.
