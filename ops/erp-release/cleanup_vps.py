#!/usr/bin/env python3
"""One-time strictly scoped ERP VPS bloat cleanup.

No DB/media modification, Node removal, systemd restart, or cross-app cleanup.
Runs only on ARM64 with healthy Node26 systemd ERP and no active ERP promoter.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
from datetime import datetime, timezone

NODE26 = Path("/opt/bababuilds-erp/node26/bin/node")
RELEASES = Path("/opt/bababuilds-erp/releases")
CURRENT = RELEASES / "current"
STATE = Path("/var/lib/bababuilds-erp/deployment")
LOCK = STATE / "systemd-deploy.lock"
PROTECTED = (
    Path("/var/lib/postgresql"), Path("/var/lib/menuminute"),
    Path("/var/www/menuminute"), Path("/var/www/clubkeep"),
    Path("/var/www/bababuilds-erp/private_uploads"),
    Path("/var/www/bababuilds-erp/backups"),
)
OLD_CUTOVERS = ("cut1611b", "dry1611a", "cut1611a")
OLD_STAGING = ("20261116a",)
CACHE_PATHS = (
    Path("/var/www/bababuilds-erp/.next/cache"),
    Path("/var/www/bababuilds-erp/.next/standalone/.next/cache"),
    Path("/root/.npm/_cacache"),
    Path("/root/.npm/_npx"),
    Path("/root/.cache/prisma"),
    Path("/root/.cache/swc-native-0"),
)
REL_RE = re.compile(r"^sha-[a-f0-9]{40}-[0-9]{8}T[0-9]{6}Z$")

def fail(reason):
    raise RuntimeError(reason)

def command(*args, timeout=30, must=True):
    try:
        p = subprocess.run([str(x) for x in args], capture_output=True,
                           text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        fail("Required process unavailable: " + Path(str(args[0])).name)
    if must and p.returncode:
        fail("Required process failed: " + Path(str(args[0])).name)
    return p.returncode, p.stdout.strip()

def path_bytes(p):
    rc, out = command("/usr/bin/du", "-sxB1", p, must=False, timeout=80)
    if rc:
        return None
    try:
        return int(out.split()[0])
    except (IndexError, ValueError):
        return None

def real_path(path):
    path = Path(path)
    if path.is_symlink():
        fail("Symlink passed as cleanup target: " + path.name)
    if not path.exists():
        return None
    if not path.is_dir() or os.path.ismount(path):
        fail("Unexpected cleanup target type or mountpoint: " + path.name)
    if path.stat().st_uid != 0:
        fail("Unexpected non-root cleanup target: " + path.name)
    if path.resolve(strict=True) != path:
        fail("Symlink in cleanup target ancestry: " + path.name)
    for protected in PROTECTED:
        if path == protected or protected in path.parents or path in protected.parents:
            fail("Attempted to touch protected application or media path")
    return path

def live_erp():
    if os.geteuid() != 0:
        fail("Root required")
    if command("/usr/bin/uname", "-m")[1] != "aarch64":
        fail("Expected ARM64 VPS")
    if command(NODE26, "--version")[1] != "v26.13.1":
        fail("Expected pinned Node26")
    if Path("/opt/bababuilds-erp/node22/bin/node").exists():
        fail("Node22 retirement not yet complete")
    for name in ("bababuilds-erp.service", "postgresql@17-main.service",
                 "menuminute-web.service", "menuminute-worker.service",
                 "clubkeep-web.service"):
        if command("/usr/bin/systemctl", "is-active", name)[1] != "active":
            fail("Required VPS service not active: " + name)
    if command("/usr/bin/systemctl", "is-enabled",
               "bababuilds-erp.service")[1] != "enabled":
        fail("ERP systemd boot startup not enabled")
    pid = command("/usr/bin/systemctl", "show", "--value",
                  "--property=MainPID", "bababuilds-erp.service")[1]
    if not pid.isdecimal() or int(pid) < 1:
        fail("ERP systemd PID not available")
    if str((Path("/proc") / pid / "exe").resolve(strict=True)) != str(NODE26):
        fail("ERP is not executing pinned Node26")
    if not CURRENT.is_symlink():
        fail("Current ERP immutable release pointer missing")
    runtime = CURRENT.resolve(strict=True)
    if runtime.parent != RELEASES / runtime.parent.name:
        fail("Unexpected current release location")
    if runtime.name != "runtime" or not REL_RE.fullmatch(runtime.parent.name):
        fail("Current release outside reviewed immutable layout")
    if not (runtime / "server.js").is_file() or not (runtime / "public/sw.js").is_file():
        fail("Current ERP runtime incomplete")
    if command("/usr/bin/systemctl", "is-active",
               "erp-release-watchdog.timer", must=False)[1] == "active":
        fail("Retired PM2 ERP watchdog still active")
    rc, units = command("/usr/bin/systemctl", "list-unit-files", "--no-legend",
                        "--no-pager", "erp-postgres-staging@*.service", must=False)
    if rc == 0:
        for line in units.splitlines():
            columns = line.split()
            if len(columns) >= 2 and columns[1].startswith(("enabled", "linked")):
                fail("Old isolated staging service enabled at boot")
    rc, active = command("/usr/bin/systemctl", "list-units", "--plain",
                         "--no-legend", "--state=active",
                         "erp-postgres-staging@*.service", must=False)
    if rc == 0 and active:
        fail("Old isolated ERP staging service currently active")
    # Node24/global PM2 are deliberately retained; their users are not audited
    # for removal by this ERP-only cleanup.
    return runtime

def process_references(target):
    """Does any process have a cwd, executable or open fd inside target?"""
    name = str(target) + "/"
    for proc in Path("/proc").iterdir():
        if not proc.name.isdecimal():
            continue
        for relative in ("cwd", "exe"):
            try:
                path = os.readlink(proc / relative)
            except OSError:
                continue
            if path == str(target) or path.startswith(name):
                return True
        fdpath = proc / "fd"
        try:
            fds = fdpath.iterdir()
            for fd in fds:
                try:
                    path = os.readlink(fd)
                except OSError:
                    continue
                if path == str(target) or path.startswith(name):
                    return True
        except OSError:
            pass
    return False

def candidates(current_runtime):
    # Exact releases only. Preserve current even when multiple commits arrive.
    for release in sorted(RELEASES.iterdir(), key=lambda p: p.name):
        if not REL_RE.fullmatch(release.name):
            continue
        if release == current_runtime.parent:
            continue
        yield "obsolete_erp_release", release
    for name in OLD_CUTOVERS:
        yield "retired_node22_cutover", Path("/opt/bababuilds-erp-cutover") / name
    for name in OLD_STAGING:
        yield "disabled_erp_staging", Path("/opt/bababuilds-erp-staging") / name
    for path in CACHE_PATHS:
        yield "regenerable_cache", path

def check_target(category, path, current):
    path = real_path(path)
    if path is None:
        return None
    if path == current or path in current.parents or path in (RELEASES, CURRENT):
        fail("Active ERP release selected for cleanup")
    if category == "obsolete_erp_release":
        if path.parent != RELEASES or not REL_RE.fullmatch(path.name):
            fail("Unexpected ERP release deletion request")
    elif category == "retired_node22_cutover":
        if path.parent != Path("/opt/bababuilds-erp-cutover") or path.name not in OLD_CUTOVERS:
            fail("Unexpected legacy cutover deletion request")
    elif category == "disabled_erp_staging":
        if path.parent != Path("/opt/bababuilds-erp-staging") or path.name not in OLD_STAGING:
            fail("Unexpected staging deletion request")
    elif category == "regenerable_cache":
        if path not in CACHE_PATHS:
            fail("Unexpected cache deletion request")
    else:
        fail("Unknown cleanup category")
    return path

def execute(apply):
    runtime = live_erp()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = LOCK.open("a+")
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        fail("Systemd release activation currently owns deployment lock")
    before = shutil.disk_usage("/").free
    results = []
    for category, expected in candidates(runtime):
        path = check_target(category, expected, runtime)
        if path is None:
            continue
        if process_references(path):
            results.append({"category": category, "entry": path.name,
                            "status": "skipped_active_reference"})
            continue
        bytes_before = path_bytes(path)
        if bytes_before is None:
            fail("Could not establish cleanup target size; refusing deletion")
        if apply:
            # Recheck current process + service while retaining deploy lock.
            current = live_erp()
            if current != runtime:
                fail("ERP release changed mid-cleanup")
            if process_references(path):
                results.append({"category": category, "entry": path.name,
                                "status": "skipped_new_reference"})
                continue
            shutil.rmtree(path)
        results.append({"category": category, "entry": path.name,
                        "bytes": bytes_before,
                        "status": "deleted" if apply else "eligible"})
    after = shutil.disk_usage("/").free
    report = {
        "mode": "apply" if apply else "dry_run",
        "active_erp_release": str(runtime), "items": results,
        "free_bytes_before": before, "free_bytes_after": after,
        "free_bytes_change": after - before, "read_only": not apply,
        "protected": ["PostgreSQL", "ERP customer media", "MenuMinute",
                      "ClubKeep", "Node26", "shared Node24 and system Node"],
        "completed_at": datetime.now(timezone.utc).isoformat()
    }
    print("ERP_VPS_LEAN_CLEANUP=" + json.dumps(report,sort_keys=True))
    print("ERP_VPS_LEAN_CLEANUP_PASS mode=" + report["mode"])

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--plan", action="store_true")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--confirm-erp-only", action="store_true")
    args=p.parse_args()
    if args.plan == args.apply:
        fail("Specify exactly one mode: --plan or --apply")
    if args.apply and not args.confirm_erp_only:
        fail("Live removal requires --apply --confirm-erp-only")
    execute(apply=args.apply)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("ERP_VPS_LEAN_CLEANUP_BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(1)
