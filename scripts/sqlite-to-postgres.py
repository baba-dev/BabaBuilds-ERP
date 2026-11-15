#!/usr/bin/env python3
"""Data-only SQLite -> PostgreSQL transfer. Only for a fresh isolated ERP DB.

Python 3.11+ stdlib and PostgreSQL 17 psql. No third-party Python dependencies.
Source is read-only; target import, including FK revalidation, is one transaction.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
from urllib.parse import unquote, urlsplit

DENIED = {"postgres", "template0", "template1", "menuminute", "clubkeep"}


def q(value):
    return '"' + value.replace('"', '""') + '"'


def env_for(name):
    parsed = urlsplit(os.environ.get("DATABASE_URL", ""))
    db = unquote(parsed.path.lstrip("/"))
    if (parsed.scheme not in ("postgres", "postgresql") or db != name
            or name.lower() in DENIED
            or not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name)
            or parsed.hostname not in ("localhost", "127.0.0.1", "::1")):
        raise RuntimeError("DATABASE_URL must target the explicit isolated ERP database on loopback")
    env = dict(os.environ)
    env.update(PGHOST=parsed.hostname, PGPORT=str(parsed.port or 5432),
               PGUSER=unquote(parsed.username or ""), PGPASSWORD=unquote(parsed.password or ""),
               PGDATABASE=name, PGCONNECT_TIMEOUT="5",
               PGOPTIONS="-c search_path=public")
    return env


def query_pg(env, sql):
    res = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
                         env=env, capture_output=True, text=True)
    if res.returncode:
        raise RuntimeError("PostgreSQL query failed (output suppressed)")
    return res.stdout.strip()


def pg_columns(env):
    sql = """
SELECT COALESCE(json_agg(json_build_object(
 'table', c.relname, 'column', a.attname, 'type', format_type(a.atttypid,a.atttypmod)
) ORDER BY c.relname,a.attnum), '[]'::json)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='';
"""
    out = {}
    for item in json.loads(query_pg(env, sql)):
        out.setdefault(item["table"], {})[item["column"]] = item["type"]
    return out


def serialize(v, typ):
    if v is None:
        return r"\N"
    if isinstance(v, bytes):
        if typ != "bytea":
            raise RuntimeError("Binary data for non-bytea target")
        value = r"\x" + v.hex()
    elif typ.startswith(("timestamp", "date")) and isinstance(v, (float, int)):
        value = dt.datetime.fromtimestamp(v / 1000, tz=dt.timezone.utc).isoformat(timespec="milliseconds")
    elif isinstance(v, float):
        if not math.isfinite(v):
            raise RuntimeError("Nonfinite SQLite float cannot be imported")
        value = repr(v)
    else:
        value = str(v)
    return value.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def transfer(args):
    if not args.acknowledge_empty_target:
        raise RuntimeError("--acknowledge-empty-target required")
    if not Path(args.sqlite).is_absolute() or not Path(args.sqlite).is_file():
        raise RuntimeError("--sqlite must be an absolute path to an offline SQLite snapshot")
    env = env_for(args.target_db)
    # BEGIN fixes a source-side read snapshot; do not import from a moving live DB.
    src = sqlite3.connect(Path(args.sqlite).as_uri() + "?mode=ro", uri=True)
    src.execute("PRAGMA query_only=ON")
    src.execute("BEGIN")
    if src.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise RuntimeError("SQLite integrity_check failed")
    if src.execute("PRAGMA foreign_key_check").fetchone():
        raise RuntimeError("SQLite foreign_key_check failed (row details suppressed)")
    tables = [x[0] for x in src.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    columns = pg_columns(env)
    missing = sorted(set(tables) - set(columns) - {"_prisma_migrations"})
    if missing:
        raise RuntimeError("Target missing source tables: " + ", ".join(missing))
    if "_prisma_migrations" not in columns:
        raise RuntimeError("Target must first have PostgreSQL Prisma baseline migrations")
    counts = {t: src.execute("SELECT count(*) FROM " + q(t)).fetchone()[0]
              for t in tables if t != "_prisma_migrations"}
    # No target truncation or schema reset is ever performed. Guard is inside the transaction.
    begin = """
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE t record; n bigint;
BEGIN
  FOR t IN SELECT cls.relname FROM pg_class cls
    JOIN pg_namespace ns ON ns.oid=cls.relnamespace
    WHERE ns.nspname='public' AND cls.relkind='r'
      AND cls.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',t.relname) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'Target database already contains user data'; END IF;
  END LOOP;
END $$;
CREATE TEMP TABLE phase_b_fks ON COMMIT DROP AS
SELECT n.nspname,c.relname,f.conname,pg_get_constraintdef(f.oid) AS definition
FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND f.contype='f';
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT * FROM phase_b_fks LOOP
  EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',f.nspname,f.relname,f.conname);
 END LOOP;
END $$;
"""
    proc = subprocess.Popen(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
                             "-v", "VERBOSITY=terse"],
                            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, text=True, env=env)
    try:
        proc.stdin.write(begin)
        for table in tables:
            if table == "_prisma_migrations":
                continue
            src_cols = [x[1] for x in src.execute("PRAGMA table_info(" + q(table) + ")")]
            if set(src_cols) != set(columns[table]):
                raise RuntimeError("Column mismatch for table " + table)
            quoted = ",".join(map(q, src_cols))
            proc.stdin.write("COPY public." + q(table) + " (" + quoted + ") FROM STDIN;\n")
            for row in src.execute("SELECT " + quoted + " FROM " + q(table)):
                proc.stdin.write("\t".join(serialize(v, columns[table][col])
                                           for col, v in zip(src_cols, row)) + "\n")
            proc.stdin.write("\\.\n")
        proc.stdin.write("""
DO $$
DECLARE f record;
BEGIN
 FOR f IN SELECT * FROM phase_b_fks LOOP
  EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
                 f.nspname,f.relname,f.conname,f.definition);
 END LOOP;
END $$;
COMMIT;
""")
        proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError("Import aborted; PostgreSQL transaction rolled back")
    except BaseException:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        raise
    finally:
        src.close()
    expressions = ",".join("'" + t + "',(SELECT count(*) FROM public." + q(t) + ")"
                           for t in counts)
    actual = json.loads(query_pg(env, "SELECT json_build_object(" + expressions + ");"))
    bad = [t for t in counts if actual[t] != counts[t]]
    if bad:
        raise RuntimeError("Post-import row parity failure: " + ", ".join(bad))
    digest = hashlib.file_digest(open(args.sqlite, "rb"), "sha256").hexdigest()
    print(json.dumps({"result": "PASS", "database": args.target_db,
                      "source_sha256": digest, "tables": len(counts),
                      "rows": sum(counts.values()), "row_parity": "PASS"}))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sqlite", required=True)
    p.add_argument("--target-db", required=True)
    p.add_argument("--acknowledge-empty-target", action="store_true")
    try:
        transfer(p.parse_args())
    except (RuntimeError, OSError, sqlite3.Error, ValueError) as error:
        print("IMPORT FAILED: " + str(error), file=sys.stderr)
        sys.exit(1)
