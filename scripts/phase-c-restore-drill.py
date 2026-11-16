#!/usr/bin/env python3
"""Phase C: pg_dump/pg_restore rehearsal between two isolated PG17 databases.

Never creates, deletes, truncates or alters an existing application database.
Requires provisioned EMPTY bababuilds_erp_drill[_suffix] database. Data in the
drill database persists for operator examination; archive is securely deleted.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

STAGING = re.compile(r"^bababuilds_erp_(?:ci|staging(?:_[a-z0-9]+)?)$")
DRILL = re.compile(r"^bababuilds_erp_drill(?:_[a-z0-9]+)?$")


def environment(raw, name, pattern):
    u = urlsplit(raw)
    db = unquote(u.path.lstrip("/"))
    if (u.scheme not in ("postgres", "postgresql")
            or u.hostname not in ("127.0.0.1", "localhost", "::1")
            or name != db or not pattern.fullmatch(db)):
        raise RuntimeError("Refusing non-isolated or non-loopback PostgreSQL target")
    env = dict(os.environ)
    env.update(PGHOST=u.hostname, PGPORT=str(u.port or 5432),
               PGUSER=unquote(u.username or ""),
               PGPASSWORD=unquote(u.password or ""),
               PGDATABASE=db, PGCONNECT_TIMEOUT="5", PGOPTIONS="-c search_path=public")
    return env


def check(executable, arguments, env, read_only=False):
    opts = dict(env)
    if read_only:
        opts["PGOPTIONS"] = "-c default_transaction_read_only=on -c search_path=public"
    r = subprocess.run([executable, *arguments], env=opts, text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                       timeout=180, check=False)
    if r.returncode:
        raise RuntimeError(executable + " failed (sensitive output suppressed)")
    return r.stdout.strip()


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument("--source-db", required=True)
    a.add_argument("--drill-db", required=True)
    a.add_argument("--sqlite", required=True, help="Absolute path to same offline SQLite snapshot")
    a.add_argument("--evidence", required=True, help="New evidence JSON path, mode 0600")
    a.add_argument("--acknowledge-empty-drill", action="store_true")
    args = a.parse_args()
    if not args.acknowledge_empty_drill:
        raise RuntimeError("Explicit --acknowledge-empty-drill required")
    if args.source_db == args.drill_db:
        raise RuntimeError("Refusing source/restore database collision")
    source = environment(os.environ.get("DATABASE_URL", ""), args.source_db, STAGING)
    restore = environment(os.environ.get("RESTORE_DATABASE_URL", ""), args.drill_db, DRILL)
    empty = check("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", """
SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
"""], restore, read_only=True)
    if int(empty) != 0:
        raise RuntimeError("Restore target not empty: refusing to drop/overwrite any objects")
    # Do not allow cloning an already-unmigrated staging database.
    count = check("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c",
                          'SELECT count(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL'],
                  source, read_only=True)
    if int(count) < 1:
        raise RuntimeError("Source has no applied PostgreSQL migration baseline")
    with tempfile.TemporaryDirectory(prefix="erp-phase-c-") as directory:
        archive = Path(directory) / "erp-restore-drill.dump"
        check("pg_dump", ["-Fc", "--no-owner", "--no-acl", "-f", str(archive)], source, read_only=True)
        if archive.stat().st_size < 512:
            raise RuntimeError("Generated backup too small to be credible")
        check("pg_restore", ["-l", str(archive)], source, read_only=True)
        check("pg_restore", ["-e", "--single-transaction", "--no-owner", "--no-acl",
                             "-d", args.drill_db, str(archive)], restore)
        # Full table/finance/identity fingerprint parity against the SAME SQLite source.
        verifier = Path(__file__).with_name("phase-c-verify.py")
        evidence_env = dict(os.environ)
        evidence_env["DATABASE_URL"] = os.environ["RESTORE_DATABASE_URL"]
        result = subprocess.run([sys.executable, str(verifier), "--sqlite", args.sqlite,
                                 "--target-db", args.drill_db, "--evidence", args.evidence],
                                env=evidence_env, text=True, capture_output=True, timeout=240)
        if result.returncode:
            raise RuntimeError("Restored PostgreSQL table and financial parity FAILED")
        verification = json.loads(result.stdout.strip())
        print(json.dumps({"status": "PASS", "source": args.source_db,
                          "restored": args.drill_db,
                          "restore_verified": True,
                          "tables": verification["table_count"],
                          "rows": verification["row_count"]}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as e:
        print("RESTORE DRILL FAILED: " + str(e), file=sys.stderr)
        sys.exit(1)
