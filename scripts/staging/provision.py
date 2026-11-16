#!/usr/bin/env python3
"""D1: provision NEW isolated PostgreSQL 17 staging DB + least-privilege roles.

Operated locally by root via postgres peer auth. Does not touch ERP/ClubKeep/
MenuMinute databases or production filesystem. Never drops/resets anything.
Creates protected database credentials for staging only; no passwords in argv.
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


def names(suffix):
    if not SUFFIX.fullmatch(suffix):
        raise RuntimeError("Suffix must be 4-12 lowercase alphanumeric characters")
    return (f"bababuilds_erp_staging_{suffix}",
            f"erp_stg_{suffix}_m",
            f"erp_stg_{suffix}_r")


def pg(sql, db="postgres"):
    # SQL with randomly generated secrets is passed only on standard input.
    command = ["runuser", "-u", "postgres", "--",
               "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", "-"]
    run = subprocess.run(command, input=sql, text=True,
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         timeout=45)
    if run.returncode:
        raise RuntimeError("PostgreSQL provisioning statement failed (details suppressed)")
    return run.stdout.strip()


def private(path):
    if not path.is_absolute() or path.is_symlink():
        raise RuntimeError("Operator staging state path must be absolute and non-symlink")
    resolved = path.resolve(strict=True)
    if stat.S_IMODE(resolved.stat().st_mode) & 0o077:
        raise RuntimeError("State directory must be mode 0700")
    if str(resolved).startswith("/var/www/"):
        raise RuntimeError("Never place customer staging credentials in web root")
    return resolved


def create_secret(path, content):
    # No overwrite, no inherited group/world bits, and no shell eval.
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write(content)
    os.chmod(path, 0o600)


def main(args=None):
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--suffix", required=True, help="Approved unique ID, e.g. 20261116a")
    cli.add_argument("--state-dir", required=True, help="Existing private mode-0700 operator folder")
    cli.add_argument("--port", type=int, default=3101, help="Loopback-only Next staging port")
    opts = cli.parse_args(args)
    if os.geteuid() != 0:
        raise RuntimeError("Root operator required for postgres peer-auth provisioning")
    if not 3001 <= opts.port <= 65000 or opts.port in (5432, 3000):
        raise RuntimeError("Refusing reserved or invalid staging port")
    db, migrator, runtime = names(opts.suffix)
    base = private(Path(opts.state_dir))
    if any(base.iterdir()):
        raise RuntimeError("State directory must be empty and newly created for this rehearsal")
    version = int(pg("SHOW server_version_num;"))
    if not 170000 <= version < 180000:
        raise RuntimeError("Expected PostgreSQL 17")
    present = pg(f"""
SELECT count(*) FROM pg_database WHERE datname='{db}';
SELECT count(*) FROM pg_roles WHERE rolname IN ('{migrator}', '{runtime}');
""").splitlines()
    if present != ["0", "0"]:
        raise RuntimeError("Staging DB/roles already exist; never reuse or overwrite")
    pw_m = secrets.token_hex(24)
    pw_r = secrets.token_hex(24)
    auth_secret = secrets.token_urlsafe(48)
    # Roles created atomically; CREATE DATABASE must be separate (PG restriction).
    pg(f"""
BEGIN;
CREATE ROLE "{migrator}" LOGIN PASSWORD '{pw_m}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE "{runtime}" LOGIN PASSWORD '{pw_r}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
COMMIT;
CREATE DATABASE "{db}" OWNER "{migrator}" ENCODING 'UTF8';
REVOKE ALL ON DATABASE "{db}" FROM PUBLIC;
GRANT CONNECT ON DATABASE "{db}" TO "{runtime}";
""")
    pg(f"""
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "{runtime}";
ALTER DEFAULT PRIVILEGES FOR ROLE "{migrator}" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "{runtime}";
ALTER DEFAULT PRIVILEGES FOR ROLE "{migrator}" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "{runtime}";
""",db)
    # Reuse shared daemon but ensure staging login has no access to other apps.
    foreign = pg(f"""
SELECT datname FROM pg_database
WHERE datname IN ('menuminute','clubkeep')
  AND has_database_privilege('{runtime}',datname,'CONNECT');
""")
    murl = f"postgresql://{migrator}:{pw_m}@127.0.0.1:5432/{db}"
    rurl = f"postgresql://{runtime}:{pw_r}@127.0.0.1:5432/{db}"
    create_secret(base / "migration.env", "DATABASE_URL=" + murl + "\n")
    create_secret(base / "runtime.env", "\n".join([
        "DATABASE_URL=" + rurl,
        "NEXTAUTH_URL=http://127.0.0.1:" + str(opts.port),
        "NEXTAUTH_SECRET=" + auth_secret,
        "AUTH_GOOGLE_ENABLED=false",
        "AUTH_EMAIL_ENABLED=false",
        "ERP_STAGING_MODE=1",
        "NODE_ENV=production",
        "PORT=" + str(opts.port),
        "HOSTNAME=127.0.0.1",
        "NEXT_TELEMETRY_DISABLED=1",
        "",
    ]))
    report = {"status": "BLOCKED" if foreign else "PROVISIONED",
              "database": db, "migrator": migrator, "runtime": runtime,
              "port": opts.port, "unwanted_connect": foreign.splitlines() if foreign else []}
    create_secret(base / "provision.json", json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    if foreign:
        raise RuntimeError("Staging role can CONNECT to another app's DB: review existing database ACLs before proceeding")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print("D1 PROVISION REFUSED: " + str(exc), file=sys.stderr)
        sys.exit(1)
