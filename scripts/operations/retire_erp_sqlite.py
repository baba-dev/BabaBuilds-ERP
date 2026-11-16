#!/usr/bin/env python3
"""Retire only ERP's legacy local SQLite database, after PostgreSQL recovery proof.

Default mode is read-only. --apply is an explicitly destructive, one-shot
operator action. Never touches MenuMinute, ClubKeep, encrypted remote Restic
snapshots, or the active Node22 standalone release.
"""
import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import urlsplit, unquote

LIVE = Path("/var/www/bababuilds-erp")
PG_ENV = Path("/etc/bababuilds-erp/production-database.env")
PM2 = Path("/root/.nvm/versions/node/v24.14.1/lib/node_modules/pm2/bin/pm2")
PM2_HOME = "/root/.pm2"
NODE = Path("/opt/bababuilds-erp/node22/bin/node")
ACTIVE = Path("/opt/bababuilds-erp-cutover/cut1611b/app/.next/standalone")
LEGACY_BACKUPS = Path("/var/www/bababuilds-erp-db-backups")
CUTOVER = Path("/var/lib/bababuilds-erp/cutover/cut1611b")
RESTIC = Path("/usr/local/sbin/menuminute-restic")
EXPECTED_TABLES = 185
SNAPSHOT_RE = re.compile(r"[a-f0-9]{64}")
ENV_KEY = re.compile(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$")

def call(args, *, timeout=90, env=None):
    proc = subprocess.run(
        list(map(str, args)), capture_output=True, text=True,
        timeout=timeout, env=env, check=False
    )
    if proc.returncode != 0:
        raise RuntimeError("Required operator check failed: " + str(args[0]))
    return proc.stdout.strip()

def ensure_private_file(path):
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("Protected file missing or symlinked: " + str(path))
    meta = path.stat()
    if meta.st_uid != 0 or stat.S_IMODE(meta.st_mode) != 0o600:
        raise RuntimeError("Expected root-owned mode-0600: " + str(path))

def clean_env_text(text):
    """Return sanitized content and count, without logging secret values."""
    removed = 0
    output = []
    for line in text.splitlines(keepends=True):
        match = ENV_KEY.match(line)
        if not match:
            output.append(line)
            continue
        name, raw = match.groups()
        value = raw.strip().strip("'\"").lower()
        sqlite_url = name == "DATABASE_URL" and value.startswith(("file:", "sqlite:"))
        sqlite_var = name.startswith("SQLITE_")
        provider = name in ("DB_PROVIDER", "DB_DIALECT") and value == "sqlite"
        if sqlite_url or sqlite_var or provider:
            removed += 1
        else:
            output.append(line)
    return "".join(output), removed

def postgres_database():
    ensure_private_file(PG_ENV)
    lines = PG_ENV.read_text(encoding="utf-8").splitlines()
    matches = [line.partition("=")[2].strip().strip("'\"")
               for line in lines if line.startswith("DATABASE_URL=")]
    if len(matches) != 1:
        raise RuntimeError("Expected one protected PostgreSQL DATABASE_URL")
    uri = urlsplit(matches[0])
    if (uri.scheme not in ("postgres", "postgresql")
        or unquote(uri.path.lstrip("/")) != "bababuilds_erp"
        or uri.hostname not in ("127.0.0.1", "localhost")):
        raise RuntimeError("Protected production database URL is not the expected PostgreSQL DB")
    query = (
        "SELECT (SELECT count(*) FROM pg_database WHERE datname='bababuilds_erp')::text "
        "|| ':' || (SELECT count(*) FROM pg_tables WHERE schemaname='public' "
        "AND tablename <> '_prisma_migrations')::text;"
    )
    result = call(["/usr/sbin/runuser", "-u", "postgres", "--",
                   "psql", "-X", "-At", "-d", "bababuilds_erp", "-c", query])
    if result != f"1:{EXPECTED_TABLES}":
        raise RuntimeError("Expected PostgreSQL production database / table inventory changed")
    return True

def verify_pm2():
    if not PM2.is_file() or not NODE.is_file():
        raise RuntimeError("Reviewed root PM2 or isolated Node22 binary missing")
    processes = json.loads(call([PM2, "jlist"], timeout=30,
        env={**os.environ, "PM2_HOME": PM2_HOME, "HOME": "/root"}))
    apps = [p for p in processes if p.get("name") == "erp"]
    if len(apps) != 1:
        raise RuntimeError("Expected exactly one production ERP PM2 process")
    app = apps[0]
    env = app.get("pm2_env", {})
    if (env.get("status") != "online"
        or env.get("pm_exec_path") != str(NODE)
        or env.get("pm_cwd") != str(ACTIVE)):
        raise RuntimeError("ERP not running in the reviewed Node22 standalone release")
    args = env.get("args", [])
    if isinstance(args, str):
        args = [args]
    args_text = " ".join(str(a) for a in args)
    if (str(PG_ENV) not in args_text
        or str(ACTIVE / "server.js") not in args_text):
        raise RuntimeError("ERP process arguments do not include the protected PostgreSQL env and standalone server")
    # Never print PM2 environment. An inherited SQLite DATABASE_URL could
    # override Node's --env-file and must block deletion until resolved.
    inherited = env.get("env", {}).get("DATABASE_URL", env.get("DATABASE_URL", ""))
    if isinstance(inherited, str) and inherited.lower().startswith(("file:", "sqlite:")):
        raise RuntimeError("ERP PM2 process still inherits a SQLite DATABASE_URL")
    if app.get("pid", 0) <= 0:
        raise RuntimeError("ERP process has no active PID")
    return app["pid"]

def restic_proof(snapshot_id):
    if not SNAPSHOT_RE.fullmatch(snapshot_id):
        raise RuntimeError("Full verified 64-character PG Restic snapshot ID required")
    if not RESTIC.is_file() or RESTIC.is_symlink():
        raise RuntimeError("Trusted off-host Restic helper missing")
    items = json.loads(call([RESTIC, "snapshots", "--json"], timeout=180))
    if not any(item.get("id") == snapshot_id for item in items):
        raise RuntimeError("Verified PostgreSQL off-host recovery snapshot not found")
    # The operator's independent restore proof is an external prerequisite:
    # existence of a snapshot alone does not prove its contents are restorable.
    return True

def candidates():
    paths = [LIVE / "prisma" / suffix for suffix in
             ("dev.db", "dev.db-wal", "dev.db-shm", "dev.db-journal")]
    for pat in ("*.sqlite", "*.sqlite3", "*.sqlite-wal", "*.sqlite-shm", "*.sqlite-journal"):
        paths.extend((LIVE / "prisma").glob(pat))
    if LEGACY_BACKUPS.is_dir() and not LEGACY_BACKUPS.is_symlink():
        for pat in ("dev-*.db", "dev-*.db-wal", "dev-*.db-shm",
                    "dev-*.db-journal", "dev-*.sqlite", "dev-*.sqlite3"):
            paths.extend(LEGACY_BACKUPS.glob(pat))
    return sorted(set(p for p in paths if p.exists() or p.is_symlink()))

def no_open_handles(paths):
    inode_set = set()
    for p in paths:
        if p.is_symlink() or not p.is_file():
            raise RuntimeError("Refusing nonregular/symlink SQLite path: " + str(p))
        st = p.stat()
        inode_set.add((st.st_dev, st.st_ino))
    for pid_dir in Path("/proc").iterdir():
        if not pid_dir.name.isdigit():
            continue
        try:
            for fd in (pid_dir / "fd").iterdir():
                try:
                    st = fd.stat()
                    if (st.st_dev, st.st_ino) in inode_set:
                        raise RuntimeError("SQLite file still open by process " + pid_dir.name)
                except (FileNotFoundError, PermissionError, OSError):
                    continue
        except (FileNotFoundError, PermissionError, OSError):
            continue

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Delete only the approved ERP local SQLite candidates")
    parser.add_argument("--verified-snapshot", required=True,
                        help="Full previously independently restored encrypted off-host PostgreSQL snapshot ID")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError("Root operator required")
    if not LIVE.is_dir() or LIVE.is_symlink():
        raise RuntimeError("ERP legacy application directory unavailable or symlinked")
    if not ACTIVE.is_dir() or ACTIVE.is_symlink():
        raise RuntimeError("Do not touch missing or symlinked active standalone release")
    if not (ACTIVE / "server.js").is_file():
        raise RuntimeError("Running ERP standalone release missing")
    postgres_database()
    pid = verify_pm2()
    restic_proof(args.verified_snapshot)
    env_path = LIVE / ".env"
    ensure_private_file(env_path)
    old_text = env_path.read_text(encoding="utf-8")
    new_text, removed = clean_env_text(old_text)
    planned = candidates()
    no_open_handles(planned)
    if not (CUTOVER / "backups/finalrestore1/restic-restore-evidence.json").is_file():
        raise RuntimeError("Original frozen SQLite/media off-host restore evidence missing")
    result = {
        "status": "PASS", "mode": "apply" if args.apply else "report",
        "erp_pid": pid, "postgres_tables": EXPECTED_TABLES,
        "verified_pg_snapshot_prefix": args.verified_snapshot[:12],
        "sqlite_env_entries_to_remove": removed,
        "local_sqlite_files_to_remove": [str(p) for p in planned],
        "encrypted_cutover_snapshots_preserved": True,
        "active_standalone_release_preserved": True,
        "other_applications_untouched": True,
    }
    if not args.apply:
        print(json.dumps(result, indent=2))
        print("REPORT_ONLY_NO_CHANGES")
        return
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    state = Path("/var/lib/bababuilds-erp/sqlite-retirement") / stamp
    state.mkdir(parents=True, mode=0o700, exist_ok=False)
    os.chmod(state, 0o700)
    if new_text != old_text:
        original = state / "original-env.0600"
        fd = os.open(original, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(old_text)
        target = env_path.with_name(".env.pg-only-new")
        if target.exists() or target.is_symlink():
            raise RuntimeError("Refusing to overwrite pending production env file")
        fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(new_text)
        os.replace(target, env_path)
        os.chmod(env_path, 0o600)
    # No recursive deletes, no wildcard deletions outside these named ERP roots.
    for path in planned:
        path.unlink()
    (state / "result.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    os.chmod(state / "result.json", 0o600)
    print("ERP_SQLITE_LOCAL_RETIREMENT_PASS")
    print(json.dumps({**result, "local_sqlite_files_to_remove": len(planned)}, indent=2))

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print("ERP_SQLITE_RETIREMENT_BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
