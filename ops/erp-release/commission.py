#!/usr/bin/env python3
"""Non-destructive ERP Node 26 host inventory and verified side-by-side Node install.

No credentials, environment values, PM2 dumps, media filenames or database records
are printed. This is a commissioning aid, NOT production approval.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import urlopen

NODE = "26.13.1"
NPM = "11.20.0"
EXPECTED_SHA256 = "89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd"
URL = f"https://nodejs.org/dist/v{NODE}/node-v{NODE}-linux-arm64.tar.xz"
INSTALL = Path("/opt/bababuilds-erp/node26")
LEGACY = Path("/opt/bababuilds-erp/node22/bin/node")
PM2_JS = Path("/root/.nvm/versions/node/v24.14.1/lib/node_modules/pm2/bin/pm2")
PM2_NODE = Path("/root/.nvm/versions/node/v24.14.1/bin/node")
RECOVERY = Path("/var/lib/bababuilds-erp/release-manager/recovery.json")
MAPS = [
    "private_uploads", "public/logos", "public/invoices", "public/receipts",
    "public/signatures", "public/products", "public/uploads", "public/partner-kit",
    "backups", "tmp/share-target"
]
RELEASES = Path("/opt/bababuilds-erp/releases")

def run(args, timeout=20, env=None):
    try:
        p = subprocess.run([str(x) for x in args], capture_output=True,
                           text=True, timeout=timeout, env=env, check=False)
        return (p.returncode, p.stdout.strip())
    except (OSError, subprocess.TimeoutExpired):
        return (127, "")

def present_file(path):
    path = Path(path)
    if not path.is_file() or path.is_symlink():
        return "missing"
    md = path.stat()
    return ("root0600" if md.st_uid == 0 and stat.S_IMODE(md.st_mode) == 0o600
            else "present-unreviewed-permissions")

def audit():
    services = {}
    for service in ["pm2-root", "postgresql@17-main", "menuminute-web",
                    "menuminute-worker", "clubkeep-web", "erp-release-watchdog.timer"]:
        services[service] = "active" if run(["/usr/bin/systemctl", "is-active", "--quiet", service])[0] == 0 else "inactive"
    process = {"status": "not-inspected"}
    if PM2_JS.is_file() and PM2_NODE.is_file():
        code, payload = run([PM2_NODE, PM2_JS, "jlist"], timeout=25,
                            env={**os.environ, "HOME": "/root", "PM2_HOME": "/root/.pm2"})
        if code == 0:
            try:
                matches = [p for p in json.loads(payload) if p.get("name") == "erp"]
                if len(matches) == 1:
                    e = matches[0].get("pm2_env") or {}
                    process = {
                        "status": e.get("status", "unknown"),
                        "cwd": e.get("pm_cwd", ""),
                        "interpreter": e.get("pm_exec_path", ""),
                        "pid_present": int(matches[0].get("pid") or 0) > 0,
                    }
                else:
                    process = {"status": f"unexpected-count:{len(matches)}"}
            except (ValueError, TypeError):
                process = {"status": "unparseable"}
    db = "unverified"
    if Path("/usr/sbin/runuser").is_file():
        code, out = run(["/usr/sbin/runuser", "-u", "postgres", "--", "psql",
                         "-X", "-At", "-d", "bababuilds_erp",
                         "-c", "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations';"])
        if code == 0 and out.isdecimal():
            db = "present-app-tables-" + out
    media = {}
    for rel in MAPS:
        p = Path("/var/www/bababuilds-erp") / rel
        media[rel] = "directory" if p.is_dir() and not p.is_symlink() else "missing-or-symlink"
    paths = {
        "node22": "present" if LEGACY.is_file() and not LEGACY.is_symlink() else "missing",
        "node26": "v" + NODE if run([INSTALL / "bin/node", "--version"])[1] == "v" + NODE else "not-installed",
        "pm2_cli": "present" if PM2_JS.is_file() else "missing",
        "release_operator": "present" if Path("/usr/local/sbin/bababuilds-erp-promote").is_file() else "missing",
        "backup_helper": "present" if Path("/usr/local/sbin/bababuilds-erp-backup").is_file() else "missing",
        "production_app_env": present_file("/etc/bababuilds-erp/production-app.env"),
        "canary_env": present_file("/etc/bababuilds-erp/canary.env"),
        "release_manager_config": present_file("/etc/bababuilds-erp/release-manager.json"),
        "recovery_attestation": present_file(RECOVERY),
        "old_app_env": present_file("/var/www/bababuilds-erp/.env"),
        "old_postgres_env": present_file("/etc/bababuilds-erp/production-database.env")
    }
    # Only report existence of recovery evidence, never print secrets/snapshot ID.
    if paths["recovery_attestation"] == "root0600":
        try:
            data = json.loads(RECOVERY.read_text())
            paths["recovery_proof_complete"] = (all(v is True for v in data.get("checks", {}).values())
                                               and len(data.get("checks", {})) == 11)
        except (OSError, ValueError):
            paths["recovery_proof_complete"] = False
    total, used, free = shutil.disk_usage("/opt")
    result = {
        "host_arch": platform.machine(), "host_os": platform.system(),
        "disk_free_gib": round(free / 1024**3, 1),
        "services": services, "erp_pm2": process, "postgres": db,
        "media": media, "paths": paths,
        "read_only_audit": True,
    }
    print("ERP_NODE26_HOST_AUDIT=" + json.dumps(result, sort_keys=True))
    return result

def install():
    if os.geteuid() != 0:
        raise RuntimeError("Root required for side-by-side install")
    if platform.system() != "Linux" or platform.machine() != "aarch64":
        raise RuntimeError("Refuse non-ARM64/Linux host")
    if not LEGACY.is_file() or LEGACY.is_symlink():
        raise RuntimeError("Refuse installation without protected Node22 rollback binary")
    services = ["pm2-root", "postgresql@17-main", "menuminute-web", "menuminute-worker", "clubkeep-web"]
    if any(run(["/usr/bin/systemctl", "is-active", "--quiet", x])[0] != 0 for x in services):
        raise RuntimeError("A protected shared VPS service is inactive")
    if shutil.disk_usage("/opt").free < 12 * 1024**3:
        raise RuntimeError("Less than 12 GiB free; no unattended installation")
    if INSTALL.is_symlink():
        raise RuntimeError("Existing Node26 path is symlink; refuse")
    if INSTALL.exists():
        code, version = run([INSTALL / "bin/node", "--version"])
        code2, npm = run([INSTALL / "bin/node", INSTALL / "lib/node_modules/npm/bin/npm-cli.js", "--version"])
        if code != 0 or version != "v" + NODE or code2 != 0 or npm != NPM:
            raise RuntimeError("Existing Node26 is not the requested version; no overwrite")
        print("ERP_NODE26_SIDE_BY_SIDE_PRESENT")
        return
    parent = INSTALL.parent
    parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=".node26-install-", dir=str(parent)))
    try:
        archive = temp / "node.tar.xz"
        digest = hashlib.sha256()
        with urlopen(URL, timeout=60) as response, archive.open("wb") as output:
            while True:
                data = response.read(1024 * 1024)
                if not data:
                    break
                digest.update(data)
                output.write(data)
        if digest.hexdigest() != EXPECTED_SHA256:
            raise RuntimeError("Official Node26 ARM64 SHA256 failed; refusing install")
        extracted = temp / "package"
        extracted.mkdir()
        with tarfile.open(archive, mode="r:xz") as tar:
            tar.extractall(path=extracted, filter="data")
        source = extracted / f"node-v{NODE}-linux-arm64"
        if not (source / "bin/node").is_file():
            raise RuntimeError("Verified Node archive lacks binary")
        # Atomic publish: Node22, Nginx, PM2 and other apps are untouched.
        os.rename(source, INSTALL)
        os.chmod(INSTALL, 0o755)
        code, version = run([INSTALL / "bin/node", "--version"])
        code2, npm = run([INSTALL / "bin/node", INSTALL / "lib/node_modules/npm/bin/npm-cli.js", "--version"])
        if (code, version, code2, npm) != (0, "v" + NODE, 0, NPM):
            raise RuntimeError("Node26 installed but runtime cannot start; verify libatomic1")
        print("ERP_NODE26_SIDE_BY_SIDE_INSTALL_PASS")
    finally:
        shutil.rmtree(temp, ignore_errors=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["audit", "install-node"])
    args = parser.parse_args()
    if args.action == "audit":
        audit()
    else:
        install()
