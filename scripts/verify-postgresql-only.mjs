#!/usr/bin/env node
// Ensure the active ERP source remains PostgreSQL-only after the 2026 cutover.
// This runs on GitHub-hosted CI; it never connects to a production database.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const fail = (message) => { console.error('POSTGRES_ONLY_FAIL: ' + message); process.exitCode = 1; };
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const retiredFiles = tracked.filter((path) =>
  /(^|\/)sqlite-history\//i.test(path) ||
  /(?:^|\/)(?:sqlite-to-postgres\.py|snapshot_sqlite\.py)$/i.test(path) ||
  /\.(?:sqlite|sqlite3|db)(?:-(?:wal|shm|journal))?$/i.test(path) ||
  /^(?:scripts\/staging\/|scripts\/production\/(?:activate_fast_cutover|prepare_fast_cutover|promote_candidate|provision_candidate|backup_restore_rehearsal|rehearse_integration)\.)/.test(path)
);
if (retiredFiles.length) fail('Retired SQLite artifacts tracked: ' + retiredFiles.join(', '));
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const lock = readFileSync('prisma/migrations/migration_lock.toml', 'utf8');
if (!/datasource\s+db\s*\{[^}]*provider\s*=\s*"postgresql"/s.test(schema)) fail('Prisma datasource is not PostgreSQL');
if (!/^provider\s*=\s*"postgresql"\s*$/m.test(lock)) fail('Prisma migration history is not PostgreSQL');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const banned = /(?:^|[/@-])(?:better-sqlite3|sqlite3|sqlite|libsql|sqlcipher|sql\.js)(?:$|[/@-])/i;
for (const name of [
  ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {}),
  ...Object.keys(lockfile.packages || {})
]) {
  if (banned.test(name)) fail('SQLite package dependency: ' + name);
}
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
if (/Create isolated SQLite fixture|scripts\/sqlite-to-postgres\.py|prisma\/sqlite-history/.test(ci)) fail('Obsolete SQLite importer CI job remains');
if (!process.exitCode) console.log('POSTGRESQL_ONLY_REPOSITORY_PASS');
