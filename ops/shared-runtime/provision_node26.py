#!/usr/bin/env python3
"""Verify and install one immutable Node.js 26.13.1 ARM64 runtime, side-by-side.

This Phase A installer never edits units, restarts services, changes application
files, removes Node24/ERP Node26, or touches databases, caches and user media.
CI verifies the Node.js GPG-signed checksums before delivering the tarball.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import posixpath
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile

VERSION = "26.13.1"
ARCHIVE_NAME = "node-v26.13.1-linux-arm64.tar.xz"
ARCHIVE_SHA256 = "89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd"
ROOT = Path("/opt/bababuilds/runtimes")
DEST = ROOT / "node-v26.13.1-linux-arm64"
MARKER = ".bababuilds-runtime.json"
LOCK = Path("/run/lock/bababuilds-node26-bootstrap.lock")
SERVICES = (
    "bababuilds-erp.service", "postgresql@17-main.service",
    "menuminute-web.service", "menuminute-worker.service",
    "clubkeep-web.service", "clubkeep-redis.service",
)
OLD_RUNTIMES = ("/opt/bababuilds-erp/node26/bin/node",
                "/opt/menuminute/node24/bin/node")


def fail(message: str) -> None:
    raise RuntimeError(message)


def run(*args: str, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, check=False, timeout=20, env=env)
    if result.returncode != 0:
        fail("Required command failed: " + Path(args[0]).name)
    return result.stdout.strip()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as reader:
        for block in iter(lambda: reader.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def trusted_directory(path: Path) -> None:
    if path.is_symlink() or not path.is_dir():
        fail("Expected real directory, not link: " + str(path))
    s = path.stat()
    if s.st_uid != 0 or s.st_mode & (stat.S_IWGRP | stat.S_IWOTH):
        fail("Runtime directory must be root-owned and not group/world-writable")


def verify_runtime() -> dict[str, str] | None:
    if not DEST.exists() and not DEST.is_symlink():
        return None
    for path in (Path("/opt"), ROOT.parent, ROOT, DEST):
        trusted_directory(path)
    if not (DEST / MARKER).is_file() or (DEST / MARKER).is_symlink():
        fail("Existing shared Node runtime lacks reviewed installation manifest")
    try:
        marker = json.loads((DEST / MARKER).read_text())
    except (ValueError, OSError):
        fail("Shared Node runtime manifest invalid")
    if (marker.get("version") != VERSION or
        marker.get("archive_sha256") != ARCHIVE_SHA256 or
        marker.get("arch") != "linux-arm64"):
        fail("Shared Node runtime manifest does not match pinned release")
    node = DEST / "bin/node"
    npm = DEST / "bin/npm"
    if node.is_symlink() or not node.is_file() or not os.access(node, os.X_OK):
        fail("Shared Node binary missing, replaced, or non-executable")
    if not npm.exists() or not os.access(npm, os.X_OK):
        fail("Bundled npm CLI missing")
    if sha256(node) != marker.get("node_sha256"):
        fail("Shared Node binary checksum differs from verified install")
    if run(str(node), "-p", "process.version + ':' + process.platform + ':' + process.arch") != "v26.13.1:linux:arm64":
        fail("Shared Node runtime is not exactly Linux ARM64 v26.13.1")
    env = dict(os.environ, PATH=f"{DEST / 'bin'}:/usr/bin:/bin")
    if run(str(npm), "--version", env=env) != "11.20.0":
        fail("Bundled npm version differs from Node 26.13.1 release")
    return {"state": "verified", "version": VERSION, "architecture": "linux-arm64",
            "path": str(DEST), "node_sha256": marker["node_sha256"],
            "archive_sha256": ARCHIVE_SHA256}


def services() -> dict[str, dict[str, str]]:
    snapshot = {}
    for unit in SERVICES:
        status = run("/usr/bin/systemctl", "is-active", unit)
        command = run("/usr/bin/systemctl", "show", unit, "--value", "--property=ExecStart")
        snapshot[unit] = {"state": status, "exec_start": command}
    return snapshot


def ensure_services_untouched(before: dict[str, dict[str, str]],
                              after: dict[str, dict[str, str]]) -> None:
    if before != after:
        fail("One or more systemd services changed during runtime provisioning")
    if any(v["state"] != "active" for v in before.values()):
        fail("All ERP, MenuMinute, ClubKeep and DB services must be active")
    for unit, details in after.items():
        if str(DEST) in details["exec_start"]:
            fail("Phase A is inventory-only: a live service already uses shared runtime: " + unit)


def member_safe(member: tarfile.TarInfo) -> bool:
    prefix = ARCHIVE_NAME.removesuffix(".tar.xz")
    name = member.name.removeprefix("./")
    pieces = PurePosixPath(name).parts
    if (not pieces or pieces[0] != prefix or
        name.startswith("/") or ".." in pieces or
        not (member.isdir() or member.isfile() or member.issym())):
        return False
    if member.issym():
        link = member.linkname
        if not link or link.startswith("/"):
            return False
        normalized = posixpath.normpath(posixpath.join(posixpath.dirname(name), link))
        if normalized != prefix and not normalized.startswith(prefix + "/"):
            return False
    return True


def validate_archive(archive: Path) -> None:
    if archive.is_symlink() or not archive.is_file():
        fail("Archive must be a regular non-symlink file")
    if archive.stat().st_size > 75 * 1024 * 1024:
        fail("Unexpectedly large Node.js distribution archive")
    if sha256(archive) != ARCHIVE_SHA256:
        fail("Pinned official Node.js Linux ARM64 archive digest mismatch")
    with tarfile.open(archive, mode="r:xz") as tf:
        members = tf.getmembers()
        if not members or len(members) > 15000:
            fail("Node.js archive member count outside expected range")
        if sum(m.size for m in members) > 450 * 1024 * 1024:
            fail("Node.js archive expanded size outside expected range")
        if not all(member_safe(m) for m in members):
            fail("Node.js archive contains unsupported or unsafe entries")


def install(archive: Path) -> dict[str, str]:
    if os.geteuid() != 0 or platform.machine() != "aarch64":
        fail("Root on Linux ARM64 is required")
    if run("/usr/bin/uname", "-s") != "Linux":
        fail("Linux is required")
    found = verify_runtime()
    if found is not None:
        return {**found, "action": "already_installed"}
    if shutil.disk_usage("/opt").free < 2 * 1024**3:
        fail("At least 2 GiB free space required for guarded installation")
    before = services()
    ensure_services_untouched(before, before)
    validate_archive(archive)
    trusted_directory(Path("/opt"))
    ROOT.parent.mkdir(mode=0o755, parents=False, exist_ok=True)
    trusted_directory(ROOT.parent)
    ROOT.mkdir(mode=0o755, exist_ok=True)
    trusted_directory(ROOT)
    stage = Path(tempfile.mkdtemp(prefix=".node26-stage-", dir=ROOT))
    try:
        with tarfile.open(archive, "r:xz") as tf:
            tf.extractall(path=stage, filter="data")
        source = stage / ARCHIVE_NAME.removesuffix(".tar.xz")
        if not source.is_dir() or source.is_symlink():
            fail("Extracted archive missing expected Node root")
        for dirpath, dirnames, filenames in os.walk(source, followlinks=False):
            for name in dirnames + filenames:
                p = Path(dirpath) / name
                if p.is_symlink():
                    continue
                mode = stat.S_IMODE(p.stat().st_mode) & ~0o6022
                os.chmod(p, mode)
        os.chmod(source, 0o755)
        node = source / "bin/node"
        npm = source / "bin/npm"
        if node.is_symlink() or not node.is_file() or not os.access(node, os.X_OK):
            fail("Verified Node archive contains no executable Node binary")
        if not npm.exists():
            fail("Verified Node archive contains no bundled npm")
        if run(str(node), "-p", "process.version + ':' + process.platform + ':' + process.arch") != "v26.13.1:linux:arm64":
            fail("Extracted Node does not match the expected runtime")
        env = dict(os.environ, PATH=f"{source / 'bin'}:/usr/bin:/bin")
        if run(str(npm), "--version", env=env) != "11.20.0":
            fail("Extracted bundled npm is not 11.20.0")
        manifest = {"version": VERSION, "arch": "linux-arm64",
                    "archive_sha256": ARCHIVE_SHA256, "node_sha256": sha256(node)}
        (source / MARKER).write_text(json.dumps(manifest, sort_keys=True) + "\n")
        (source / MARKER).chmod(0o644)
        after = services()
        ensure_services_untouched(before, after)
        if DEST.exists() or DEST.is_symlink():
            fail("Shared destination appeared during staging; refusing overwrite")
        source.rename(DEST)  # Atomic rename on same filesystem; no application switch.
    finally:
        shutil.rmtree(stage)
    verified = verify_runtime()
    if verified is None:
        fail("Shared runtime not present after atomic installation")
    ensure_services_untouched(before, services())
    return {**verified, "action": "installed"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--inventory", action="store_true")
    group.add_argument("--install", action="store_true")
    parser.add_argument("--archive", type=Path)
    opts = parser.parse_args()
    if os.geteuid() != 0:
        fail("Root is required")
    if platform.machine() != "aarch64":
        fail("ARM64 VPS required")
    with LOCK.open("a+") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        if opts.inventory:
            if opts.archive is not None:
                fail("Inventory does not accept archive")
            runtime = verify_runtime() or {"state": "not_installed"}
            live = services()
            legacy = {path: Path(path).is_file() for path in OLD_RUNTIMES}
            print("BABABUILDS_SHARED_NODE26_INVENTORY=" + json.dumps({
                "shared_runtime": runtime,
                "legacy_runtimes_present": legacy,
                "services": {k: {"state": v["state"],
                                 "uses_shared_runtime": str(DEST) in v["exec_start"]}
                             for k, v in live.items()},
                "read_only": True}, sort_keys=True))
            return
        if opts.archive is None:
            fail("--install requires --archive of reviewed Node distribution")
        result = install(opts.archive)
        print("BABABUILDS_SHARED_NODE26_PROVISION=" + json.dumps(result, sort_keys=True))
        print("BABABUILDS_SHARED_NODE26_PASS action=" + result["action"])


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("BABABUILDS_SHARED_NODE26_BLOCKED: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
