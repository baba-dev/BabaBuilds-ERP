#!/usr/bin/env python3
"""Promote a fully reconciled, frozen SQLite -> PostgreSQL candidate by DB rename.

NO application restarts, symlinks, service changes or automated rollback.
The operator must confirm the write-freeze and independent off-host restore.
Never modifies production SQLite or any other application's database.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit

ROOT = Path("/var/lib/bababuilds-erp/cutover")
LIVE = Path("/var/www/bababuilds-erp/prisma/dev.db")


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as handle:
        for piece in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(piece)
    return h.hexdigest()


def assert_frozen_source_unchanged(path, manifest):
    """Verify the exact frozen live SQLite file, not backup-API output bytes.

    SQLite online backup can create a logically identical database whose
    physical SHA256 differs from the original file. The snapshot SHA256 is
    still independently checked against the off-host restore and parity data.
    """
    expected = manifest.get("frozen_source_sha256")
    if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise RuntimeError("Frozen live SQLite source hash missing from final manifest")
    if digest(path) != expected:
        raise RuntimeError("Live SQLite differs from frozen source: refuse promotion")
    st = path.stat()
    if (st.st_ino != manifest.get("source_inode")
        or st.st_dev != manifest.get("source_device")):
        raise RuntimeError("Live SQLite identity changed since snapshot")


def postgres(sql, database="postgres"):
    p = subprocess.run(
        ["runuser", "-u", "postgres", "--", "psql", "-X", "-qAt",
         "-v", "ON_ERROR_STOP=1", "-d", database, "-f", "-"],
        input=sql, text=True, capture_output=True, timeout=60)
    if p.returncode:
        raise RuntimeError("PostgreSQL validation/promotion failed; output suppressed")
    return p.stdout.strip()


def evidence(path):
    if not path.is_file() or path.is_symlink():
        raise RuntimeError("Required private evidence missing")
    return json.loads(path.read_text(encoding="utf-8"))


def private_marker(path, expected):
    if (not path.is_file() or path.is_symlink() or path.stat().st_uid != 0
        or stat.S_IMODE(path.stat().st_mode) != 0o600
        or path.read_text(encoding="utf-8").strip() != expected):
        raise RuntimeError("Required root-owned mode-0600 operator checkpoint absent")


def require_frozen_offhost_restore(record, snapshot_sha):
    """Require independently recovered FINAL source and media, not just a marker."""
    if (record.get("status") != "PASS"
        or record.get("source_sqlite_sha256") != snapshot_sha
        or record.get("remote_restore_verified") is not True
        or record.get("production_changed") is not False
        or not isinstance(record.get("media_files"), int)
        or record["media_files"] < 1
        or not re.fullmatch(r"[a-f0-9]{12}",
                            str(record.get("remote_snapshot_id_prefix", "")))):
        raise RuntimeError("Final frozen SQLite + media off-host recovery evidence invalid")


def assert_root_erp_cron_paused():
    """Require all root cron entries targeting ERP cron/webhook routes to be disabled.

    Never print the crontab; a route line may contain private authorization.
    """
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True, timeout=10)
    if result.returncode:
        raise RuntimeError("Cannot verify root cron is disabled for ERP")
    enabled = [line.strip() for line in result.stdout.splitlines()
               if line.strip() and not line.lstrip().startswith("#")]
    if any("/var/www/bababuilds-erp/scripts/run-cron.sh" in line
           or "erp.bababuilds.com/api/cron/" in line
           or "127.0.0.1:3000/api/cron/" in line
           for line in enabled):
        raise RuntimeError("Root ERP cron jobs still enabled; write-freeze is not complete")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--suffix", required=True)
    cli.add_argument("--acknowledge-final-database-rename", action="store_true")
    options = cli.parse_args()
    if os.geteuid() or not options.acknowledge_final_database_rename:
        raise RuntimeError("Root operator and explicit rename acknowledgement required")
    suffix = options.suffix
    if not re.fullmatch(r"[a-z0-9]{4,12}", suffix):
        raise RuntimeError("Invalid cutover suffix")
    state = ROOT / suffix
    candidate = f"bababuilds_erp_staging_{suffix}"
    drill = f"bababuilds_erp_drill_{suffix}"
    prod = "bababuilds_erp"
    if not state.is_dir() or state.is_symlink() or state.stat().st_uid != 0 or stat.S_IMODE(state.stat().st_mode) != 0o700:
        raise RuntimeError("Invalid protected cutover state")
    private_marker(state / "write-freeze-confirmed", "WRITE_FREEZE_CONFIRMED")
    private_marker(state / "offhost-restore-verified", "OFFHOST_DATABASE_AND_MEDIA_RESTORE_VERIFIED")
    assert_root_erp_cron_paused()
    snapshot = state / "final-sqlite.db"
    manifest = evidence(Path(str(snapshot) + ".manifest.json"))
    if not snapshot.is_file() or snapshot.is_symlink() or manifest.get("status") != "PASS":
        raise RuntimeError("Consistent offline SQLite backup/manifest required")
    source_sha = digest(snapshot)
    if manifest.get("snapshot_sha256") != source_sha:
        raise RuntimeError("Snapshot hash mismatch")
    require_frozen_offhost_restore(
        evidence(state / "backups" / "finalrestore1" / "restic-restore-evidence.json"),
        source_sha)
    if any(Path(str(LIVE) + ext).exists() for ext in ("-wal", "-shm", "-journal")):
        raise RuntimeError("Live SQLite journal/sidecar present; source not quiescent")
    if not LIVE.is_file() or LIVE.is_symlink():
        raise RuntimeError("Frozen live SQLite file missing or symlinked")
    assert_frozen_source_unchanged(LIVE, manifest)
    # A stopped TCP listener is not enough: background jobs can still hold
    # SQLite handles. Refuse promotion while any process has the live DB open.
    live_stat = LIVE.stat()
    db_holders = 0
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            for handle in (proc / "fd").iterdir():
                try:
                    opened = handle.stat()
                    if opened.st_dev == live_stat.st_dev and opened.st_ino == live_stat.st_ino:
                        db_holders += 1
                        break
                except (FileNotFoundError, PermissionError, OSError):
                    continue
        except (FileNotFoundError, PermissionError, OSError):
            continue
    if db_holders:
        raise RuntimeError("Active processes still hold the production SQLite file")
    # Nothing should be listening on the old ERP port while the freeze is active.
    sockets = subprocess.run(
        ["ss", "-H", "-lnt", "sport", "=", ":3000"],
        capture_output=True, text=True, timeout=10)
    if sockets.returncode != 0 or sockets.stdout.strip():
        raise RuntimeError("Port 3000 still listening; write-freeze not demonstrated")
    parity = evidence(state / "full-parity.json")
    restored = evidence(state / "restore-parity.json")
    invariants = evidence(state / "business-invariants.json")
    for report in (parity, restored, invariants):
        if report.get("status") != "PASS":
            raise RuntimeError("Required parity, restore or business validation did not PASS")
    if (parity.get("database") != candidate
        or parity.get("sqlite_sha256") != source_sha
        or restored.get("database") != drill
        or restored.get("sqlite_sha256") != source_sha
        or parity.get("table_fingerprint_matches") != parity.get("table_count")
        or restored.get("table_fingerprint_matches") != parity.get("table_count")
        or parity.get("row_count") != restored.get("row_count")
        or parity.get("financial_parity") != "PASS"
        or restored.get("financial_parity") != "PASS"
        or parity.get("pg_unvalidated_foreign_keys") != 0
        or invariants.get("database") != candidate
        or invariants.get("issue_counts") != {}):
        raise RuntimeError("Incomplete or mismatched accounting/restore evidence")
    m = invariants.get("media", {})
    if any(m.get(key, 0) for key in ("missing_local_file", "unsafe_media_path")):
        raise RuntimeError("Missing/unsafe production media references")
    if postgres(f"SELECT count(*) FROM pg_database WHERE datname IN ('{prod}','{candidate}','{drill}');") != "2":
        raise RuntimeError("Expected candidate and restore drill only; production must not already exist")
    if postgres(f"SELECT count(*) FROM pg_database WHERE datname='{candidate}';") != "1":
        raise RuntimeError("Candidate database missing")
    if postgres(f"""SELECT count(*) FROM pg_stat_activity
        WHERE datname='{candidate}' AND pid <> pg_backend_pid();""") != "0":
        raise RuntimeError("Candidate has active connections; refuse rename")
    if postgres("""SELECT count(*) FROM pg_constraint c JOIN pg_class r ON c.conrelid=r.oid
        JOIN pg_namespace n ON r.relnamespace=n.oid
        WHERE n.nspname='public' AND c.contype='f' AND NOT c.convalidated;""", candidate) != "0":
        raise RuntimeError("Unvalidated foreign keys")
    # Explicitly constrain runtime DML after the baseline/import and before
    # any role can access the renamed production database.
    runtime_role = f"erp_cut_{suffix}_r"
    if postgres(f"""SELECT count(*) FROM pg_roles WHERE rolname='{runtime_role}';""") != "1":
        raise RuntimeError("Expected runtime login role missing")
    postgres(f"""
BEGIN;
GRANT USAGE ON SCHEMA public TO "{runtime_role}";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{runtime_role}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "{runtime_role}";
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."_prisma_migrations" FROM "{runtime_role}";
GRANT SELECT ON TABLE public."_prisma_migrations" TO "{runtime_role}";
REVOKE CREATE ON SCHEMA public FROM "{runtime_role}";
COMMIT;
""", candidate)
    if postgres(f"""SELECT datname FROM pg_database
        WHERE datname IN ('menuminute','clubkeep')
          AND has_database_privilege('{runtime_role}',datname,'CONNECT');"""):
        raise RuntimeError("ERP runtime has cross-application database CONNECT")
    runtime = state / "credentials/runtime.env"
    if not runtime.is_file() or runtime.is_symlink():
        raise RuntimeError("Missing protected runtime credentials")
    line = runtime.read_text(encoding="utf-8").strip()
    if not line.startswith("DATABASE_URL="):
        raise RuntimeError("Invalid runtime credential format")
    uri = urlsplit(line.partition("=")[2])
    if uri.hostname != "127.0.0.1" or uri.path != "/" + candidate:
        raise RuntimeError("Runtime credential is not scoped to candidate")
    target = Path("/etc/bababuilds-erp/production-database.env")
    if target.exists() or target.is_symlink():
        raise RuntimeError("Production database environment already exists: refuse overwrite")
    if not target.parent.is_dir() or target.parent.is_symlink() or target.parent.stat().st_uid != 0:
        raise RuntimeError("Protected /etc/bababuilds-erp directory missing")
    revised = urlunsplit((uri.scheme, uri.netloc, "/" + prod, uri.query, uri.fragment))
    tmp = target.with_name(".production-database.env-" + suffix)
    descriptor = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write("DATABASE_URL=" + revised + "\n")
        # This changes only the empty-name production namespace; it never
        # touches existing databases or the preserved SQLite source.
        postgres(f'ALTER DATABASE "{candidate}" RENAME TO "{prod}";')
        os.replace(tmp, target)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    print(json.dumps({"status": "DATABASE_PROMOTED", "database": prod,
                      "sqlite_source_preserved": True, "app_switched": False,
                      "operator_next": "activate reviewed production ERP runtime"}))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print("PRODUCTION PROMOTION BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
