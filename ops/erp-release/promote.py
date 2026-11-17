#!/usr/bin/env python3
"""Root-owned ERP release operator. Install manually; NEVER invoke a repo checkout as root.

Commands: preflight, promote, rollback, monitor. A promotion requires a reviewed,
fresh recovery attestation and isolated ARM64 candidate; every failure aborts or
restores the exact previous PM2 artifact + interpreter, not the database.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import tarfile
import time
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse

from package import verify, SHA_RE, VERSION

CONFIG = Path("/etc/bababuilds-erp/release-manager.json")
RECOVERY = Path("/var/lib/bababuilds-erp/release-manager/recovery.json")
STATE = Path("/var/lib/bababuilds-erp/release-manager")
RELEASES = Path("/opt/bababuilds-erp/releases")
PM2_NAME = "erp"
MEDIA_TARGETS = (
    "private_uploads", "public/logos", "public/invoices", "public/receipts",
    "public/signatures", "public/products", "public/uploads",
    "public/partner-kit", "backups", "tmp/share-target",
)
NAME_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")
RESTIC_RE = re.compile(r"^[a-f0-9]{64}$")
CHECKS = (
    "recurring_backup", "independent_database_restore", "media_restore",
    "existing_media", "new_private_upload", "pdf_report",
    "service_worker", "authentication_rbac", "payment_idempotency",
    "webhooks", "scheduled_jobs",
)

def fail(reason):
    raise RuntimeError(reason)

def now():
    return datetime.now(timezone.utc)

def parse_time(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Timezone missing")
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Invalid UTC attestation timestamp") from exc

def read_protected(path, *, mode=0o600):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        fail("Protected operator file missing or is symlink")
    details = path.stat()
    if details.st_uid != 0 or stat.S_IMODE(details.st_mode) != mode:
        fail("Expected root-owned protected operator file")
    return path.read_text()

def json_protected(path):
    return json.loads(read_protected(path))

def recovery_checks(report, *, clock=None):
    clock = clock or now()
    if not RESTIC_RE.fullmatch(str(report.get("snapshot", ""))):
        fail("Off-host restic snapshot ID must be a complete SHA")
    if any(report.get("checks", {}).get(k) is not True for k in CHECKS):
        fail("Production handoff attestation incomplete")
    backup = parse_time(report.get("backup_at"))
    restore = parse_time(report.get("restore_at"))
    if not timedelta(0) <= clock - backup <= timedelta(hours=36):
        fail("Last encrypted off-host backup too old or in future")
    if not timedelta(0) <= clock - restore <= timedelta(days=7):
        fail("Last independently tested restore too old or in future")
    return True

def valid_pg_url(url, *, production):
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql") or parsed.hostname not in (
        "localhost", "127.0.0.1", "::1"
    ):
        fail("PostgreSQL URL is not localhost-only")
    db = parsed.path.lstrip("/")
    if production:
        if db != "bababuilds_erp":
            fail("Production database is not the ERP PostgreSQL 17 database")
    elif not re.fullmatch(r"bababuilds_erp_staging_[a-z0-9_]+", db):
        fail("Canary database must be disposable and separated from production")

def read_env(path, *, mode=0o600):
    lines = read_protected(path, mode=mode).splitlines()
    values = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            fail("Malformed protected env file")
        key, value = stripped.split("=", 1)
        key = key.removeprefix("export ").strip()
        if not NAME_RE.fullmatch(key):
            fail("Malformed environment variable name")
        if key in values:
            fail("Duplicate environment variable in protected file")
        values[key] = value.strip().strip("\"'")
    return values

def check_config():
    cfg = json_protected(CONFIG)
    if (cfg.get("pm2_name") != PM2_NAME or
        cfg.get("live_port") != 3000 or cfg.get("canary_port") != 3101 or
        cfg.get("node26") != "/opt/bababuilds-erp/node26/bin/node" or
        cfg.get("legacy_node") != "/opt/bababuilds-erp/node22/bin/node" or
        cfg.get("legacy_release") != "/opt/bababuilds-erp-cutover/cut1611b/app/.next/standalone"):
        fail("Unexpected production paths or PM2 process identity")
    if set(cfg.get("media_map", {})) != set(MEDIA_TARGETS):
        fail("Every private/public ERP media mapping requires operator verification")
    for relative, location in cfg["media_map"].items():
        source = Path(location)
        if not source.is_absolute() or source.is_symlink() or not source.is_dir():
            fail("Media directory absent or unsafe: " + relative)
        if source.resolve().is_relative_to(RELEASES) or source.resolve().is_relative_to(Path("/opt/bababuilds-erp-cutover")):
            fail("Media must live outside immutable release trees")
    for binary in ("node26", "legacy_node", "pm2_node", "pm2_cli"):
        value = Path(cfg[binary])
        if not value.is_absolute() or not value.is_file() or value.is_symlink():
            fail("Missing trusted runtime binary: " + binary)
    if run([cfg["node26"], "--version"]) != "v" + VERSION:
        fail("Node 26 interpreter version mismatch")
    if not run([cfg["legacy_node"], "--version"]).startswith("v22."):
        fail("Retained Node 22 rollback interpreter missing")
    reviewed = [
        "/var/www/bababuilds-erp/.env",
        "/etc/bababuilds-erp/production-database.env",
    ]
    if cfg.get("production_env_files") != reviewed:
        fail("Production must reuse the verified cutover environment files in order")
    production = {}
    for protected in reviewed:
        production.update(read_env(protected))
    candidate = read_env(cfg["canary_env"])
    if not production.get("NEXTAUTH_SECRET") or not production.get("DATABASE_URL"):
        fail("Incomplete protected production environment")
    valid_pg_url(production["DATABASE_URL"], production=True)
    if candidate.get("AUTH_GOOGLE_ENABLED") != "false" or candidate.get("AUTH_EMAIL_ENABLED") != "false":
        fail("Canary must have external auth disabled")
    valid_pg_url(candidate.get("DATABASE_URL", ""), production=False)
    if candidate.get("NEXTAUTH_URL") != "http://127.0.0.1:3101":
        fail("Canary URL must stay loopback only")
    for key, desired in {
        "PORT": "3101", "HOSTNAME": "127.0.0.1",
        "NODE_ENV": "production", "ERP_STAGING_MODE": "1",
    }.items():
        if key in candidate and candidate[key] != desired:
            fail("Canary environment must not override isolated runtime: " + key)
    if cfg["canary_env"] != "/etc/bababuilds-erp/canary.env":
        fail("Canary env path differs from isolated systemd unit")
    return cfg

def run(argv, *, env=None, timeout=60, checked=True):
    result = subprocess.run([str(x) for x in argv], capture_output=True, text=True,
                            env=env, timeout=timeout, check=False)
    if checked and result.returncode:
        fail("Trusted process command failed: " + Path(str(argv[0])).name)
    return result.stdout.strip()

def pm2(cfg, *args, checked=True):
    env = {**os.environ, "HOME": "/root", "PM2_HOME": "/root/.pm2"}
    return run([cfg["pm2_node"], cfg["pm2_cli"], *args], env=env, checked=checked, timeout=45)

def current_app(cfg):
    apps = [app for app in json.loads(pm2(cfg, "jlist")) if app.get("name") == PM2_NAME]
    if len(apps) != 1:
        fail("Expected precisely one ERP PM2 process; no other process may be changed")
    app = apps[0]
    if app.get("pm2_env", {}).get("status") != "online" or int(app.get("pid", 0)) <= 0:
        fail("ERP PM2 process is not healthy")
    return app

def snapshot_app(app, cfg):
    e = app["pm2_env"]
    executable, cwd = Path(e["pm_exec_path"]), Path(e["pm_cwd"])
    old_release = (str(cwd) == cfg["legacy_release"] or
                   re.fullmatch(r"/opt/bababuilds-erp/releases/sha-[a-f0-9]{40}-[0-9]{8}T[0-9]{6}Z/runtime", str(cwd)) is not None)
    valid_legacy = str(executable) == cfg["legacy_node"] and old_release
    valid_managed = (str(executable) == cfg["node26"] and cwd.parent == RELEASES and
                     SHA_RE.fullmatch(cwd.name) is not None)
    if not (valid_legacy or valid_managed):
        fail("Existing ERP PM2 process is not an approved standalone release")
    args = e.get("args") or []
    if isinstance(args, str):
        args = [args]
    if not isinstance(args, list) or any(not isinstance(x, str) for x in args):
        fail("Unsupported PM2 argument representation")
    # Saved root-only to allow exact Node22 interpreter/command restoration.
    env = e.get("env") or {}
    if not isinstance(env, dict):
        fail("Unsupported PM2 environment representation")
    safe_env = {k: str(v) for k, v in env.items() if NAME_RE.fullmatch(k) and isinstance(v, (str, int, bool))}
    return {"exec": str(executable), "cwd": str(cwd), "args": args, "env": safe_env}

def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(data, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    os.chmod(path, 0o600)

@contextmanager
def locked():
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(STATE, 0o700)
    fd = os.open(STATE / "release.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)

def health(port, *, retries=5, check_sw=True):
    for attempt in range(retries):
        try:
            started = time.monotonic()
            with urlopen(f"http://127.0.0.1:{port}/login", timeout=8) as response:
                if response.status != 200 or "text/html" not in response.headers.get("Content-Type", ""):
                    raise RuntimeError("Login unhealthy")
            with urlopen(f"http://127.0.0.1:{port}/api/auth/session", timeout=8) as response:
                if response.status != 200 or "json" not in response.headers.get("Content-Type", ""):
                    raise RuntimeError("Session unhealthy")
            if check_sw:
                with urlopen(f"http://127.0.0.1:{port}/sw.js", timeout=8) as response:
                    if response.status != 200 or "javascript" not in response.headers.get("Content-Type", ""):
                        raise RuntimeError("Service worker unhealthy")
            duration = round((time.monotonic() - started) * 1000)
            if duration > 8000:
                raise RuntimeError("Health latency exceeded")
            return duration
        except (URLError, HTTPError, RuntimeError, TimeoutError):
            if attempt + 1 == retries:
                raise RuntimeError("ERP candidate/live health failed")
            time.sleep(2)

def pm2_start(cfg, spec, *, env=None):
    # Never use shell=True or a PR-provided command. Only the ERP PM2 app is managed.
    if spec["exec"] == cfg["node26"]:
        # Clean env is mandatory: inherited root/PM2 secrets override Node's
        # --env-file semantics. Load the existing protected cutover files only.
        inherited = {
            "HOME": "/root", "PM2_HOME": "/root/.pm2",
            "PATH": "/opt/bababuilds-erp/node26/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            **spec.get("env", {})
        }
    else:
        inherited = {**os.environ, **spec.get("env", {})}
        if env:
            inherited.update(env)
        inherited.update({"HOME": "/root", "PM2_HOME": "/root/.pm2"})
    args = [
        cfg["pm2_node"], cfg["pm2_cli"], "start", spec["exec"],
        "--name", PM2_NAME, "--interpreter", "none", "--cwd", spec["cwd"],
        "--", *spec["args"],
    ]
    run(args, env=inherited, timeout=60)

def restore(cfg, previous):
    pm2(cfg, "delete", PM2_NAME, checked=False)
    pm2_start(cfg, previous)
    health(3000)
    running = snapshot_app(current_app(cfg), cfg)
    if running["exec"] != previous["exec"] or running["cwd"] != previous["cwd"]:
        fail("Restored PM2 release/interpreter mismatch")
    pm2(cfg, "save", "--force")
    return True

def check_schema_contract(expected):
    # The legacy Node22 deploy operator enforced this exact PostgreSQL safety
    # check. Node26 promotion must never trigger an implicit schema migration.
    query = ('SELECT migration_name, checksum FROM public."_prisma_migrations" '
             'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL '
             'ORDER BY migration_name')
    result = run([
        "/usr/sbin/runuser", "-u", "postgres", "--",
        "psql", "-X", "-At", "-F", "|", "-d", "bababuilds_erp", "-c", query
    ], timeout=60)
    lines = result.splitlines()
    if any(line.count("|") != 1 for line in lines):
        fail("Unrecognized PostgreSQL migration inventory")
    actual = dict(line.split("|", 1) for line in lines)
    if actual != expected:
        fail("PostgreSQL migration checksums differ from release; schema change must be reviewed separately")
    return True

def materialize(cfg, archive, manifest, sha):
    verify(archive, manifest, expected_sha=sha)
    dest = RELEASES / sha
    if dest.exists():
        if dest.is_symlink() or not (dest / "server.js").is_file():
            fail("Existing release path is not a valid immutable release")
        stored = dest / "release-manifest.json"
        if stored.is_symlink() or not stored.is_file():
            fail("Existing release has no protected manifest")
        if json.loads(stored.read_text()) != json.loads(Path(manifest).read_text()):
            fail("Existing immutable release manifest differs from requested artifact")
        return dest
    RELEASES.mkdir(mode=0o755, parents=True, exist_ok=True)
    if shutil.disk_usage(RELEASES).free < 12 * 1024**3:
        fail("Less than 12 GiB available for safe immutable release and rollback")
    staging = RELEASES / (".incoming-" + sha)
    if staging.exists():
        fail("Partial release present; operator intervention required")
    staging.mkdir(mode=0o700)
    try:
        with tarfile.open(archive, "r:gz") as bundle:
            # package.verify has already rejected links and traversal before extraction
            bundle.extractall(staging, filter="data")
        inner = staging / "release"
        if not (inner / "server.js").is_file():
            fail("Extracted server missing")
        # Unmapped immutable candidate must NEVER see or modify live customer media.
        # Media is linked only AFTER the isolated systemd canary is stopped.
        (inner / "release-manifest.json").write_text(Path(manifest).read_text())
        os.chmod(inner / "release-manifest.json", 0o444)
        shutil.move(inner, dest)
        os.chmod(dest, 0o755)
        return dest
    finally:
        shutil.rmtree(staging, ignore_errors=True)

def attach_media(cfg, release):
    for rel, source in cfg["media_map"].items():
        target = release / rel
        if target.is_symlink():
            fail("Existing media symlink in candidate; manual review required")
        if target.is_dir():
            # Generated tracked assets are superseded by verified persistent media.
            shutil.rmtree(target)
        elif target.exists():
            fail("Artifact media target conflicts with a file")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(source, target_is_directory=True)
    for rel, source in cfg["media_map"].items():
        if (release / rel).resolve() != Path(source).resolve():
            fail("Persistent media mapping verification failed")

def canary(cfg, sha):
    name = f"erp-node26-candidate@{sha}.service"
    # Unit is an independently installed, root-reviewed sandbox: erpstaging
    # identity, loopback-only egress, isolated PostgreSQL 17, port 3101.
    try:
        run(["/usr/bin/systemctl", "start", name], timeout=60)
        # ERP_STAGING_MODE disables SW; only validate it on real production.
        health(cfg["canary_port"], retries=12, check_sw=False)
        if run(["/usr/bin/systemctl", "is-active", name]) != "active":
            fail("Isolated canary unit not active")
    finally:
        run(["/usr/bin/systemctl", "stop", name], checked=False)

def validate_running(cfg, release):
    app = current_app(cfg)
    env = app["pm2_env"]
    if env.get("pm_exec_path") != cfg["node26"] or env.get("pm_cwd") != str(release):
        fail("PM2 still points to previous runtime/release")
    exe = Path(f"/proc/{app['pid']}/exe").resolve()
    if exe != Path(cfg["node26"]).resolve():
        fail("Actual live PID does not run Node 26 binary")
    return app

def preflight(cfg):
    recovery_checks(json_protected(RECOVERY))
    current_app(cfg)
    # Do not accidentally activate while other SaaS processes are in the ERP slot.
    for port in (cfg["canary_port"],):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                fail("Canary port is occupied")
        except (OSError, ConnectionRefusedError):
            pass

def promote(cfg, *, archive, manifest, sha):
    if not SHA_RE.fullmatch(sha):
        fail("Invalid requested commit")
    preflight(cfg)
    release_info = verify(archive, manifest, expected_sha=sha)
    check_schema_contract(release_info["migrations"])
    previous = snapshot_app(current_app(cfg), cfg)
    dest = materialize(cfg, archive, manifest, sha)
    if previous["cwd"] == str(dest):
        print("ERP_RELEASE_ALREADY_ACTIVE sha=" + sha)
        return
    if any((dest / rel).is_symlink() for rel in MEDIA_TARGETS):
        fail("Release already links live media; cannot rerun isolated canary")
    canary(cfg, sha)
    attach_media(cfg, dest)
    atomic_json(STATE / "rollback.json", previous)
    # The initial Node 22 cutover release and interpreter are preserved.
    args = [
        *["--env-file=" + value for value in cfg["production_env_files"]],
        str(dest / "server.js"),
    ]
    next_spec = {"exec": cfg["node26"], "cwd": str(dest), "args": args, "env": {
        "NODE_ENV": "production", "PORT": "3000", "HOSTNAME": "127.0.0.1",
        "PRIVATE_UPLOADS_DIR": cfg["media_map"]["private_uploads"]
    }}
    try:
        pm2(cfg, "delete", PM2_NAME)
        pm2_start(cfg, next_spec)
        for _ in range(3):
            health(3000)
            validate_running(cfg, dest)
            time.sleep(2)
        pm2(cfg, "save", "--force")
        atomic_json(STATE / "status.json", {
            "sha": sha, "release": str(dest), "node": VERSION,
            "promoted_at": now().isoformat(),
            "watchdog_until": (now() + timedelta(minutes=45)).isoformat(),
            "failures": 0, "status": "active"
        })
    except Exception:
        try:
            restore(cfg, previous)
            atomic_json(STATE / "status.json", {"status": "rolled-back", "failed_sha": sha, "at": now().isoformat()})
        except Exception:
            (STATE / "EMERGENCY_REVIEW_REQUIRED").touch(mode=0o600, exist_ok=True)
            raise RuntimeError("Promotion and rollback failed; EMERGENCY_REVIEW_REQUIRED")
        raise RuntimeError("Promotion failed; previous artifact and interpreter restored")
    print("ERP_RELEASE_PROMOTED sha=" + sha + " node=" + VERSION)

def rollback(cfg, *, expected_sha=None):
    state = json_protected(STATE / "rollback.json")
    status = json_protected(STATE / "status.json")
    if expected_sha and status.get("sha") != expected_sha:
        fail("Rollback guard: active SHA changed")
    restore(cfg, state)
    atomic_json(STATE / "status.json", {"status": "rolled-back", "at": now().isoformat(), "from": status.get("sha")})
    print("ERP_RELEASE_ROLLED_BACK retained-postgresql=true")

def monitor(cfg):
    status_file = STATE / "status.json"
    if not status_file.exists():
        print("ERP_RELEASE_MONITOR_NOT_ACTIVATED")
        return
    status = json_protected(status_file)
    if status.get("status") != "active":
        print("ERP_RELEASE_MONITOR_" + status.get("status", "UNKNOWN").upper())
        return
    try:
        dest = Path(status["release"])
        app = validate_running(cfg, dest)
        latency = health(3000, retries=2)
        rss_kib = int(Path(f"/proc/{app['pid']}/status").read_text().split("VmRSS:")[1].split()[0])
        if rss_kib > 1_500_000:
            fail("ERP memory threshold exceeded")
        if app["pm2_env"].get("restart_time", 0) > 5:
            fail("ERP restart threshold exceeded")
        status["failures"] = 0
        status["last_healthy_at"] = now().isoformat()
        status["latency_ms"] = latency
        status["rss_kib"] = rss_kib
        atomic_json(status_file, status)
        print("ERP_RELEASE_MONITOR_PASS")
    except Exception:
        status["failures"] = int(status.get("failures", 0)) + 1
        atomic_json(status_file, status)
        if status["failures"] < 3:
            print("ERP_RELEASE_MONITOR_RETRY")
            return
        # A late rollback might mask a long-running application problem: require
        # explicit operator intervention after the fresh deployment window.
        (STATE / "AUTODEPLOY_FROZEN").touch(mode=0o600, exist_ok=True)
        if now() <= parse_time(status["watchdog_until"]):
            rollback(cfg, expected_sha=status["sha"])
            print("ERP_RELEASE_WATCHDOG_ROLLBACK")
        else:
            fail("ERP unhealthy beyond rollback window; auto deploy frozen")

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    action = ap.add_subparsers(dest="command", required=True)
    action.add_parser("preflight")
    promote_parser = action.add_parser("promote")
    promote_parser.add_argument("--archive", required=True)
    promote_parser.add_argument("--manifest", required=True)
    promote_parser.add_argument("--sha", required=True)
    action.add_parser("monitor")
    action.add_parser("rollback").add_argument("--expected-sha")
    args = ap.parse_args()
    if os.geteuid() != 0:
        fail("ERP release operator must be root-owned and run as root")
    os.umask(0o077)
    with locked():
        cfg = check_config()
        if (STATE / "AUTODEPLOY_FROZEN").exists() or (STATE / "EMERGENCY_REVIEW_REQUIRED").exists():
            if args.command not in ("rollback", "monitor"):
                fail("Release automation frozen; operator must investigate")
        if args.command == "preflight":
            preflight(cfg)
            print("ERP_RELEASE_PREFLIGHT_PASS")
        elif args.command == "promote":
            promote(cfg, archive=args.archive, manifest=args.manifest, sha=args.sha)
        elif args.command == "rollback":
            rollback(cfg, expected_sha=args.expected_sha)
        else:
            monitor(cfg)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("ERP_RELEASE_OPERATOR_FAILED: " + str(exc), file=sys.stderr)
        sys.exit(1)
