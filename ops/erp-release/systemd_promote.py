#!/usr/bin/env python3
"""Root-owned immutable Node26 systemd ERP promotion. No data migrations or backups.

Subcommands: preflight, promote, retire-node22. This is NOT a PM2 deployer.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, build_opener

sys.path.insert(0, "/usr/local/lib/bababuilds-erp-release")
from package import verify, validate_members, SHA_RE

NODE = Path("/opt/bababuilds-erp/node26/bin/node")
RELEASES = Path("/opt/bababuilds-erp/releases")
CURRENT = RELEASES / "current"
STATE = Path("/var/lib/bababuilds-erp/deployment")
APP = Path("/var/www/bababuilds-erp")
PG_ENV = Path("/etc/bababuilds-erp/production-database.env")
UNIT = "bababuilds-erp.service"
PACKAGE = Path("/usr/local/lib/bababuilds-erp-release/package.py")
AUDIT = Path("/usr/local/lib/bababuilds-erp-release/audit_vps.py")
EXPECTED_PACKAGE = "17ec4387ddd0608669c86859e53ee9d461d30c63"
EXPECTED_UNIT = "48bb6bd7a131e3430e36b3cb2b439f467c7a7e42"
MEDIA = (
    "private_uploads", "backups", "public/invoices", "public/receipts",
    "public/logos", "public/signatures", "public/products", "public/uploads",
    "public/partner-kit", "tmp/share-target",
)
RELEASE_RE = re.compile(r"^/opt/bababuilds-erp/releases/sha-[0-9a-f]{40}-[0-9]{8}T[0-9]{6}Z/runtime$")

def fail(message):
    raise RuntimeError(message)

def run(args, *, timeout=30, check=True):
    result = subprocess.run([str(a) for a in args], capture_output=True,
                            text=True, timeout=timeout, check=False)
    if check and result.returncode:
        fail("Trusted process failed: " + Path(str(args[0])).name)
    return result.stdout.strip()

def owned(path, *, mode=None):
    p = Path(path)
    if not p.is_file() or p.is_symlink() or p.stat().st_uid != 0:
        fail("Expected root-owned regular file: " + p.name)
    if mode is not None and stat.S_IMODE(p.stat().st_mode) != mode:
        fail("Protected file mode invalid: " + p.name)

def main_pid():
    pid = run(["/usr/bin/systemctl", "show", "--property=MainPID", "--value", UNIT])
    if not pid.isdecimal() or int(pid) < 1:
        fail("ERP systemd MainPID absent")
    exe = Path("/proc") / pid / "exe"
    if not exe.exists() or str(exe.resolve(strict=True)) != str(NODE):
        fail("ERP PID is not running exact Node26")
    return pid

def probe(path, port):
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = build_opener(NoRedirect)
    url = "http://127.0.0.1:" + str(port) + "/" + path
    try:
        response = opener.open(url, timeout=5)
        return response.status
    except HTTPError as error:
        return error.code
    except (URLError, TimeoutError, OSError):
        return 0

def health(port, *, staging=False, attempts=25):
    paths = ["login", "api/auth/session"]
    if not staging:
        paths.append("sw.js")
    for path in paths:
        ok = False
        for _ in range(attempts):
            code = probe(path, port)
            ok = code in (200, 302, 307, 308) if path == "login" else code == 200
            if ok:
                break
            time.sleep(2)
        if not ok:
            fail("ERP health probe failed: " + path)

def inspect_audit():
    owned(AUDIT)
    report = run(["/usr/bin/python3", AUDIT], timeout=50)
    line = next((v for v in report.splitlines() if v.startswith("ERP_VPS_RUNTIME_AUDIT=")), "")
    if not line:
        fail("No trusted VPS audit evidence")
    return json.loads(line.split("=", 1)[1])

def preflight():
    if os.geteuid() != 0:
        fail("Root is required")
    if run(["/usr/bin/uname", "-m"]) != "aarch64":
        fail("ERP host must be ARM64")
    if run([NODE, "--version"]) != "v26.13.1":
        fail("Production Node26 runtime mismatch")
    owned(PACKAGE)
    if run(["/usr/bin/git", "hash-object", PACKAGE]) != EXPECTED_PACKAGE:
        fail("Protected archive verifier changed unexpectedly")
    if not CURRENT.is_symlink():
        fail("Current release pointer must be an immutable symlink")
    previous = CURRENT.resolve(strict=True)
    if not RELEASE_RE.fullmatch(str(previous)):
        fail("Current ERP runtime outside trusted releases layout")
    if not (previous / "server.js").is_file() or not (previous / "public/sw.js").is_file():
        fail("Existing standalone release incomplete")
    owned(APP / ".env", mode=0o600)
    owned(PG_ENV, mode=0o600)
    owned(Path("/etc/systemd/system") / UNIT)
    unit_blob = run(["/usr/bin/git", "hash-object", "/etc/systemd/system/bababuilds-erp.service"])
    if unit_blob != EXPECTED_UNIT:
        fail("ERP systemd unit differs from reviewed Node26 template")
    for name in MEDIA:
        path = APP / name
        if not path.is_dir() or path.is_symlink():
            fail("Authoritative ERP media path missing: " + name)
        if not (previous / name).is_symlink() or (previous / name).resolve(strict=True) != path:
            fail("Current runtime media mapping differs: " + name)
    for service in (UNIT, "postgresql@17-main", "menuminute-web",
                    "menuminute-worker", "clubkeep-web"):
        if run(["/usr/bin/systemctl", "is-active", service]) != "active":
            fail("Required service unhealthy: " + service)
    if run(["/usr/bin/systemctl", "is-enabled", UNIT]) != "enabled":
        fail("ERP systemd boot persistence not enabled")
    if run(["/usr/bin/systemctl", "is-active", "erp-release-watchdog.timer"], check=False) == "active":
        fail("Obsolete PM2 watchdog still active")
    main_pid()
    state = inspect_audit()
    if state.get("erp_pm2", {}).get("count") != 0:
        fail("Unexpected registered ERP PM2 process")
    if state.get("erp_systemd", {}).get("runtime") != str(NODE):
        fail("VPS audit does not confirm Node26 systemd")
    health(3000, attempts=4)
    if shutil.disk_usage(RELEASES).free < 6 * 1024**3:
        fail("Less than 6 GiB of free release capacity")
    return previous

def check_db(manifest):
    meta = json.loads(Path(manifest).read_text())
    query = ('SELECT migration_name, checksum FROM public."_prisma_migrations" '
             'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')
    rows = run(["/usr/sbin/runuser", "-u", "postgres", "--", "psql",
                "-X", "-At", "-F", "|", "-d", "bababuilds_erp", "-c", query])
    actual = dict(line.split("|", 1) for line in rows.splitlines() if "|" in line)
    if not actual or actual != meta["migrations"]:
        fail("PostgreSQL applied migration history differs from release; no DB changes made")
    print("ERP_POSTGRES_MIGRATION_HISTORY_MATCH")

def latest_main():
    output = run(["/usr/bin/git", "ls-remote",
                  "https://github.com/baba-dev/BabaBuilds-ERP.git",
                  "refs/heads/main"], timeout=35)
    return output.split()[0] if output else ""

def stage(archive, sha):
    name = "sha-" + sha + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release = RELEASES / name
    release.mkdir(mode=0o700)
    with tarfile.open(archive, "r:gz") as bundle:
        validate_members(bundle.getmembers())
        bundle.extractall(release, filter="data")
    runtime = release / "runtime"
    (release / "release").rename(runtime)
    if not (runtime / "server.js").is_file() or not (runtime / "public/sw.js").is_file():
        fail("Candidate standalone app or service worker missing")
    for name in MEDIA:
        dest = runtime / name
        if dest.is_symlink() or (dest.exists() and not dest.is_dir()):
            fail("Unexpected media output in release " + name)
        if dest.is_dir():
            # Only new packaged static files are removed, never live customer media.
            shutil.rmtree(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.symlink_to(APP / name, target_is_directory=True)
    return runtime

def preview(runtime):
    if run(["/usr/bin/ss", "-H", "-lnt", "sport = :3199"], check=False):
        fail("Preview TCP port 3199 is busy")
    output = runtime.parent / "preview.log"
    env = {
        "PATH": "/usr/sbin:/usr/bin:/sbin:/bin",
        "HOME": "/root", "NODE_ENV": "production",
        "ERP_STAGING_MODE": "1", "PORT": "3199",
        "HOSTNAME": "127.0.0.1",
        "PRIVATE_UPLOADS_DIR": str(APP / "private_uploads"),
    }
    with output.open("w") as log:
        process = subprocess.Popen([
            str(NODE), "--env-file=" + str(APP / ".env"),
            "--env-file=" + str(PG_ENV), str(runtime / "server.js")],
            cwd=runtime, env=env, stdout=log, stderr=log, start_new_session=True)
        try:
            health(3199, staging=True)
        finally:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=8)

def switch(previous, runtime):
    pointer = RELEASES / (".current-switch-" + runtime.parent.name)
    pointer.symlink_to(runtime, target_is_directory=True)
    os.replace(pointer, CURRENT)
    try:
        run(["/usr/bin/systemctl", "restart", UNIT], timeout=50)
        health(3000)
        pid = main_pid()
        time.sleep(12)
        health(3000, attempts=3)
        main_pid()
    except Exception:
        restore = RELEASES / (".current-restore-" + runtime.parent.name)
        restore.symlink_to(previous, target_is_directory=True)
        os.replace(restore, CURRENT)
        try:
            run(["/usr/bin/systemctl", "restart", UNIT], timeout=50)
            health(3000)
            main_pid()
            print("ERP_PREVIOUS_NODE26_SYSTEMD_RELEASE_RESTORED")
        except Exception:
            print("ERP_CRITICAL_PREVIOUS_RELEASE_RESTART_FAILED", file=sys.stderr)
        raise
    return pid

def write_state(sha, runtime):
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name, value in (("active.sha", sha), ("active-path", str(runtime))):
        tmp = STATE / (name + ".new")
        tmp.write_text(value + "\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, STATE / name)

def retire_node22():
    preflight()
    report = inspect_audit()
    if not report["legacy"]["safe_to_retire_node22"]:
        fail("Node22 retirement guard still blocked")
    old = Path("/opt/bababuilds-erp/node22")
    if old.is_symlink() or not old.is_dir() or old.stat().st_uid != 0:
        fail("Node22 isolated runtime absent, symlink or not root-owned")
    if not (old / "bin/node").is_file():
        fail("Node22 expected binary missing")
    shutil.rmtree(old)
    print("ERP_NODE22_RETIRED after live Node26 systemd zero-consumer check")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    choices = parser.add_subparsers(dest="action", required=True)
    choices.add_parser("preflight")
    promote = choices.add_parser("promote")
    promote.add_argument("--archive", required=True)
    promote.add_argument("--manifest", required=True)
    promote.add_argument("--sha", required=True)
    choices.add_parser("retire-node22")
    args = parser.parse_args()
    if args.action == "retire-node22":
        retire_node22()
        return
    previous = preflight()
    if args.action == "preflight":
        print("ERP_SYSTEMD_PREFLIGHT_PASS current=" + str(previous))
        return
    if not SHA_RE.fullmatch(args.sha):
        fail("Invalid immutable SHA")
    archive, manifest = Path(args.archive), Path(args.manifest)
    if any(p.is_symlink() or not p.is_file() for p in (archive, manifest)):
        fail("Expected regular release artifacts")
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / "systemd-deploy.lock").open("w") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        verify(archive, manifest, expected_sha=args.sha)
        check_db(manifest)
        if latest_main() != args.sha:
            fail("Main advanced before staging; no ERP process changed")
        if (STATE / "active.sha").is_file() and (STATE / "active.sha").read_text().strip() == args.sha:
            print("ERP_SYSTEMD_ALREADY_CURRENT sha=" + args.sha)
            return
        runtime = stage(archive, args.sha)
        preview(runtime)
        check_db(manifest)
        if latest_main() != args.sha:
            fail("Main advanced during staging; existing ERP retained")
        main_pid()
        for service in ("postgresql@17-main", "menuminute-web", "menuminute-worker", "clubkeep-web"):
            if run(["/usr/bin/systemctl", "is-active", service]) != "active":
                fail("Sibling service unhealthy before activation: " + service)
        pid = switch(previous, runtime)
        write_state(args.sha, runtime)
        print("ERP_SYSTEMD_PRODUCTION_DEPLOYED sha=" + args.sha + " pid=" + pid)

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("[ERP systemd deploy] BLOCKED: " + str(error), file=sys.stderr)
        sys.exit(1)
