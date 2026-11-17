#!/usr/bin/env python3
"""Read-only, sanitized ERP VPS runtime audit. Never changes processes or files.

Audit is intentionally executable before and after Node 26 systemd cutover.
Only a verified Node 26 systemd process, no Node 22 consumers and no stale
service startup references can make the old interpreter eligible for retirement.
"""
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess

NODE26 = Path("/opt/bababuilds-erp/node26/bin/node")
NODE22 = Path("/opt/bababuilds-erp/node22/bin/node")
PM2_RUNNER = Path("/root/.nvm/versions/node/v24.14.1/bin/node")
PM2_CLI = Path("/root/.nvm/versions/node/v24.14.1/lib/node_modules/pm2/bin/pm2")
SERVICES = (
    "bababuilds-erp.service", "pm2-root.service", "postgresql@17-main.service",
    "menuminute-web.service", "menuminute-worker.service", "clubkeep-web.service"
)

def run(*argv, timeout=15, env=None):
    try:
        result = subprocess.run(argv, check=False, capture_output=True, text=True,
                                timeout=timeout, env=env)
        return result.returncode, result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return -1, ""

def executable(pid):
    try:
        return str(Path("/proc") .joinpath(str(pid), "exe").resolve(strict=True))
    except (OSError, ValueError):
        return ""

def process_count_using_legacy():
    count = 0
    for item in Path("/proc").iterdir():
        if item.name.isdigit():
            target = executable(int(item.name))
            if target.startswith("/opt/bababuilds-erp/node22/"):
                count += 1
    return count

def active_services():
    result = {}
    for name in SERVICES:
        rc, _ = run("/usr/bin/systemctl", "is-active", "--quiet", name)
        result[name] = rc == 0
    return result

def erp_pm2():
    if not (PM2_RUNNER.is_file() and PM2_CLI.is_file()):
        return {"count": 0, "state": "cli-missing"}
    rc, data = run(str(PM2_RUNNER), str(PM2_CLI), "jlist", timeout=35,
                   env={**os.environ, "HOME": "/root", "PM2_HOME": "/root/.pm2"})
    if rc != 0:
        return {"count": -1, "state": "inspect-failed"}
    try:
        apps = [app for app in json.loads(data) if app.get("name") == "erp"]
        if len(apps) != 1:
            return {"count": len(apps), "state": "absent" if not apps else "duplicate"}
        app = apps[0]
        meta = app.get("pm2_env") or {}
        return {"count": 1, "state": str(meta.get("status", "unknown")),
                "runtime": str(meta.get("pm_exec_path", "")),
                "exe": executable(int(app.get("pid") or 0)),
                "release": str(meta.get("pm_cwd", ""))}
    except (ValueError, TypeError, KeyError):
        return {"count": -1, "state": "inspect-failed"}

def systemd_process():
    rc, text = run("/usr/bin/systemctl", "show", "bababuilds-erp.service",
                   "--property=MainPID,ActiveState", "--no-pager")
    props = dict(line.split("=", 1) for line in text.splitlines() if "=" in line)
    try:
        pid = int(props.get("MainPID", "0"))
    except ValueError:
        pid = 0
    return {"state": props.get("ActiveState", "unknown"),
            "pid_present": pid > 0,
            "runtime": executable(pid) if pid > 0 else ""}

def lingering_node22_units():
    # Check *configured* boot/service references, not historical docs.
    found = []
    root = Path("/etc/systemd/system")
    for p in root.rglob("*"):
        if p.is_file() and p.suffix in (".service", ".timer") and not p.is_symlink():
            try:
                if "/opt/bababuilds-erp/node22/" in p.read_text(errors="replace"):
                    found.append(p.name)
            except (OSError, PermissionError):
                found.append("unreadable-unit")
    return sorted(set(found))

def safe_to_retire(services, pm2, systemd, old_processes, legacy_units, node26_version):
    return (
        services.get("bababuilds-erp.service") is True and
        systemd.get("runtime") == str(NODE26) and
        systemd.get("pid_present") is True and
        pm2.get("count") == 0 and
        old_processes == 0 and not legacy_units and
        node26_version == "v26.13.1"
    )

def main():
    if os.geteuid() != 0:
        raise SystemExit("ERP_VPS_RUNTIME_AUDIT: root required for reliable process inspection")
    services = active_services()
    pm2 = erp_pm2()
    systemd = systemd_process()
    old_processes = process_count_using_legacy()
    legacy_units = lingering_node22_units()
    node26_version = run(str(NODE26), "--version")[1] if NODE26.is_file() else ""
    database_rc, table_count = run(
        "/usr/sbin/runuser", "-u", "postgres", "--",
        "psql", "-X", "-At", "-d", "bababuilds_erp",
        "-c", "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations';")
    if database_rc != 0 or not table_count.isdigit():
        table_count = "unverified"
    can_retire = safe_to_retire(services, pm2, systemd, old_processes, legacy_units, node26_version)
    report = {
        "host": {"arch": platform.machine(), "node26": node26_version,
                 "node22_installed": NODE22.is_file(),
                 "disk_free_gib": round(shutil.disk_usage("/opt").free / 1024**3, 1)},
        "services": services, "erp_pm2": pm2, "erp_systemd": systemd,
        "postgres": {"application_table_count": table_count},
        "legacy": {"node22_running_processes": old_processes,
                   "node22_service_unit_references": legacy_units,
                   "safe_to_retire_node22": can_retire},
        "read_only": True
    }
    print("ERP_VPS_RUNTIME_AUDIT=" + json.dumps(report, sort_keys=True))
    print("ERP_NODE22_RETIRE_GUARD=" + ("PASS" if can_retire else "BLOCKED"))
    if node26_version != "v26.13.1":
        raise SystemExit("Node26 installed binary mismatch")
    if database_rc != 0:
        raise SystemExit("PostgreSQL inventory unavailable")

if __name__ == "__main__":
    main()
