#!/usr/bin/env python3
"""Read-only production ERP runtime/storage audit. Prints no secrets or file contents.

Operates on the LIVE SQLite-backed ERP while it remains online. This does NOT
prepare a database, change PM2, change cron, build code, copy media or start a
process. Treat missing evidence as BLOCKED, never as permission to cut over.
"""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

LIVE = Path("/var/www/bababuilds-erp")
NODE22 = Path("/opt/bababuilds-erp/node22/bin/node")
PM2_CLI = Path("/root/.nvm/versions/node/v24.14.1/lib/node_modules/pm2/bin/pm2")
MEDIA = (
    "private_uploads", "public/logos", "public/receipts", "public/invoices",
    "public/signatures", "public/products", "public/uploads",
    "public/partner-kit", "tmp/share-target", "backups",
)
CRON_PATTERNS = (
    "/var/www/bababuilds-erp/scripts/run-cron.sh",
    "erp.bababuilds.com/api/cron/",
    "127.0.0.1:3000/api/cron/",
)
KEY_NAMES = ("DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL",
             "CRON_SECRET", "PRIVATE_UPLOADS_DIR")


def run(args, *, timeout=15, env=None):
    p = subprocess.run(args, capture_output=True, text=True,
                       timeout=timeout, env=env, check=False)
    if p.returncode:
        raise RuntimeError("Read-only tool failed (output redacted)")
    return p.stdout


def env_keys(path):
    """Parse only key names; never return secret values or env-file contents."""
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("Production .env missing or a symbolic link")
    if not stat.S_ISREG(path.stat().st_mode):
        raise RuntimeError("Production .env is not a regular file")
    keys = set()
    for row in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=", row)
        if match:
            keys.add(match.group(1))
    return keys


def entries_from_pm2(raw):
    items = json.loads(raw)
    if not isinstance(items, list):
        raise RuntimeError("Unexpected PM2 response")
    erp = [item for item in items if isinstance(item, dict) and item.get("name") == "erp"]
    if len(erp) != 1:
        raise RuntimeError("Expected exactly one ERP process in root PM2")
    item = erp[0]
    env = item.get("pm2_env", {})
    if not isinstance(env, dict):
        raise RuntimeError("Unexpected ERP PM2 metadata")
    return {
        "pm2_process_count": len(items),
        "erp_online": env.get("status") == "online",
        "erp_working_directory_is_live": env.get("pm_cwd") == str(LIVE),
        "erp_entrypoint_is_existing_npm": env.get("pm_exec_path") == "/usr/bin/npm",
        "erp_interpreter_is_node20_path": env.get("exec_interpreter") == "/usr/bin/node",
    }


def cron_counts(raw):
    entries = [line.strip() for line in raw.splitlines()
               if line.strip() and not line.lstrip().startswith("#")]
    erp = [line for line in entries if any(pattern in line for pattern in CRON_PATTERNS)]
    return len(erp), len(entries)


def media_summary():
    result = {}
    for rel in MEDIA:
        root = LIVE / rel
        if root.is_symlink():
            result[rel] = "SYMLINK_REQUIRES_REVIEW"
        elif root.is_dir():
            result[rel] = "DIRECTORY"
        elif not root.exists():
            result[rel] = "ABSENT"
        else:
            result[rel] = "NON_DIRECTORY_REQUIRES_REVIEW"
    return result


def main():
    if os.geteuid() != 0:
        raise RuntimeError("Root required for confidential process metadata")
    keys = env_keys(LIVE / ".env")
    if not PM2_CLI.is_file() or PM2_CLI.is_symlink():
        raise RuntimeError("Expected reviewed root PM2 CLI not found")
    pm2 = entries_from_pm2(run([str(PM2_CLI), "jlist"], timeout=30, env={
        **os.environ, "PM2_HOME": "/root/.pm2",
        "PATH": "/root/.nvm/versions/node/v24.14.1/bin:/usr/bin:/bin",
    }))
    service = run(["systemctl", "is-active", "pm2-root.service"]).strip()
    current = run(["crontab", "-l"])
    erp_cron, all_cron = cron_counts(current)
    path_states = media_summary()
    sqlite_path = LIVE / "prisma/dev.db"
    if sqlite_path.is_symlink():
        raise RuntimeError("Live SQLite file is a symlink")
    private_uploads = "PRIVATE_UPLOADS_DIR" in keys
    result = {
        "audit": "ERP_PRODUCTION_RUNTIME_READ_ONLY",
        "production_changed": False,
        "root_pm2_service_active": service == "active",
        **pm2,
        "isolated_node22_present": NODE22.is_file(),
        "production_sqlite_present": sqlite_path.is_file(),
        "production_env_file_present": True,
        "required_env_keys_present": {
            key: (key in keys) for key in KEY_NAMES
        },
        "private_uploads_env_override_present": private_uploads,
        "relative_private_uploads_default_requires_standalone_fix": not private_uploads,
        "erp_cron_enabled": erp_cron,
        "root_cron_enabled_total": all_cron,
        "media_directories": path_states,
        "go_no_go": "INSPECTION_ONLY_NO_CUTOVER",
    }
    print(json.dumps(result, sort_keys=True, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        # Never print any sensitive path contents or provider credentials.
        print("ERP RUNTIME AUDIT BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
