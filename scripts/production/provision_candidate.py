#!/usr/bin/env python3
"""Provision a fresh ERP PostgreSQL cutover CANDIDATE and disposable restore drill.

Creates only bababuilds_erp_staging_SUFFIX and bababuilds_erp_drill_SUFFIX.
The importer and parity verifier remain strictly non-production-only.
Never changes the live SQLite source or an existing PostgreSQL database.
"""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys

SUFFIX = re.compile(r"^[a-z0-9]{4,12}$")
BASE = Path("/var/lib/bababuilds-erp/cutover")


def names(suffix):
    if not SUFFIX.fullmatch(suffix):
        raise RuntimeError("Suffix must contain 4-12 lowercase letters/digits")
    return (f"bababuilds_erp_staging_{suffix}",
            f"bababuilds_erp_drill_{suffix}",
            f"erp_cut_{suffix}_m", f"erp_cut_{suffix}_r")


def pg(sql, database="postgres"):
    p = subprocess.run(
        ["runuser", "-u", "postgres", "--", "psql", "-X", "-qAt",
         "-v", "ON_ERROR_STOP=1", "-d", database, "-f", "-"],
        input=sql, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, timeout=60)
    if p.returncode:
        raise RuntimeError("PostgreSQL operation refused; no details or credentials printed")
    return p.stdout.strip()


def write_private(path, value):
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(value)


def main():
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument("--suffix", required=True)
    cli = arg.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError("Root operator required")
    candidate, drill, migrator, runtime = names(cli.suffix)
    state = BASE / cli.suffix
    if state.exists() or state.is_symlink():
        raise RuntimeError("Cutover state already exists; never reuse")
    if pg("SHOW server_version_num;")[:2] != "17":
        raise RuntimeError("Expected PostgreSQL 17")
    existing = pg(f"""
SELECT count(*) FROM pg_database
 WHERE datname IN ('{candidate}','{drill}','bababuilds_erp');
SELECT count(*) FROM pg_roles
 WHERE rolname IN ('{migrator}','{runtime}');
""").splitlines()
    if existing != ["0", "0"]:
        raise RuntimeError("Candidate, restore drill, production database or roles already exist")
    if pg("""
SELECT datname FROM pg_database
WHERE datname IN ('clubkeep', 'menuminute')
  AND (datacl IS NULL OR EXISTS (
     SELECT 1 FROM aclexplode(datacl) acl
     WHERE acl.grantee = 0 AND acl.privilege_type='CONNECT'));
"""):
        raise RuntimeError("Other application database has PUBLIC CONNECT; no changes made")
    if not BASE.is_dir() or BASE.is_symlink() or BASE.stat().st_uid != 0 or stat.S_IMODE(BASE.stat().st_mode) != 0o700:
        raise RuntimeError("Prepare root-owned mode-0700 /var/lib/bababuilds-erp/cutover")
    pw_m, pw_r = secrets.token_hex(32), secrets.token_hex(32)
    # Role names are strictly generated; passwords are hex-only.
    pg(f"""
BEGIN;
CREATE ROLE "{migrator}" LOGIN PASSWORD '{pw_m}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE "{runtime}" LOGIN PASSWORD '{pw_r}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
COMMIT;
""")
    pg(f'CREATE DATABASE "{candidate}" OWNER "{migrator}" ENCODING \'UTF8\';')
    pg(f'CREATE DATABASE "{drill}" OWNER "{migrator}" ENCODING \'UTF8\';')
    for db in (candidate, drill):
        pg(f'REVOKE ALL ON DATABASE "{db}" FROM PUBLIC;')
    pg(f'GRANT CONNECT ON DATABASE "{candidate}" TO "{runtime}";')
    pg(f"""
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "{runtime}";
ALTER DEFAULT PRIVILEGES FOR ROLE "{migrator}" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "{runtime}";
ALTER DEFAULT PRIVILEGES FOR ROLE "{migrator}" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "{runtime}";
""", candidate)
    if pg(f"""
SELECT datname FROM pg_database
 WHERE datname IN ('menuminute','clubkeep')
 AND (has_database_privilege('{runtime}',datname,'CONNECT')
 OR has_database_privilege('{migrator}',datname,'CONNECT')); 
"""):
        raise RuntimeError("ERP candidate roles can access other app databases; do not proceed")
    state.mkdir(mode=0o700)
    credentials = state / "credentials"
    credentials.mkdir(mode=0o700)
    murl = f"postgresql://{migrator}:{pw_m}@127.0.0.1:5432/{candidate}"
    rurl = f"postgresql://{runtime}:{pw_r}@127.0.0.1:5432/{candidate}"
    durl = f"postgresql://{migrator}:{pw_m}@127.0.0.1:5432/{drill}"
    write_private(credentials / "migration.env", "DATABASE_URL=" + murl + "\n")
    write_private(credentials / "runtime.env", "DATABASE_URL=" + rurl + "\n")
    write_private(credentials / "restore.env", "RESTORE_DATABASE_URL=" + durl + "\n")
    write_private(state / "provision.json", json.dumps({
        "candidate": candidate, "drill": drill, "migrator": migrator,
        "runtime": runtime, "status": "PROVISIONED"
    }, indent=2) + "\n")
    print(json.dumps({"status": "PROVISIONED", "candidate": candidate,
                      "drill": drill, "credentials": "protected", "production_changed": False}))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        print("CUTOVER PROVISION BLOCKED: " + str(error), file=sys.stderr)
        sys.exit(1)
