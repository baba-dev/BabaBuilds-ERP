#!/usr/bin/env python3
"""Back up an existing consistent ERP SQLite snapshot and approved media off-host;
restore the exact new encrypted Restic snapshot into a PRIVATE scratch directory.

Operator-only, one-shot: never deletes/prunes remote backups, never touches
MenuMinute data, never writes the live SQLite file or starts/stops processes.
The authenticated restic wrapper and repository are provided by the VPS.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import subprocess
import sys

STATE_ROOT = Path("/var/lib/bababuilds-erp/cutover")
MEDIA_ROOT = Path("/var/www/bababuilds-erp")
RESTIC = Path("/usr/local/sbin/menuminute-restic")
MEDIA = (
    "private_uploads",
    "public/logos",
    "public/receipts",
    "public/invoices",
    "public/signatures",
    "public/products",
    "public/uploads",
)
NAME = re.compile(r"^[a-z0-9]{4,12}$")
RUN = re.compile(r"^[a-z][a-z0-9]{3,15}$")


def file_hash(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def protected(path, directory=False):
    if path.is_symlink():
        raise RuntimeError("A protected path is a symbolic link")
    info = path.stat()
    kind = stat.S_ISDIR if directory else stat.S_ISREG
    if not kind(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise RuntimeError("Expected root-owned private 0700 directory or 0600 file")


def checked(args, timeout=900):
    result = subprocess.run(
        args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, timeout=timeout,
        env=os.environ.copy(),
        check=False)
    if result.returncode:
        raise RuntimeError("Protected Restic backup/restore command failed (output suppressed)")
    return result.stdout


def snapshots(tag):
    entries = json.loads(checked([str(RESTIC), "snapshots", "--json", "--tag", tag], timeout=120))
    if not isinstance(entries, list):
        raise RuntimeError("Invalid remote snapshot listing")
    return {item["id"]: item for item in entries
            if isinstance(item, dict) and isinstance(item.get("id"), str)
            and re.fullmatch(r"[a-f0-9]{64}", item["id"])}


def walk_media():
    originals = []
    for rel in MEDIA:
        base = MEDIA_ROOT / rel
        if not base.exists() and not base.is_symlink():
            continue
        if not base.is_dir() or base.is_symlink():
            raise RuntimeError("Media root is not a real directory")
        originals.append(base)
        for current, dirs, filenames in os.walk(base, followlinks=False):
            for directory in dirs:
                path = Path(current) / directory
                if path.is_symlink():
                    raise RuntimeError("Media contains symlink directory")
            for filename in filenames:
                path = Path(current) / filename
                if path.is_symlink() or not path.is_file():
                    raise RuntimeError("Media contains nonregular or symlink file")
                originals.append(path)
    return originals


def inventory(paths):
    return {str(p): {"size": p.stat().st_size, "sha256": file_hash(p)}
            for p in paths if p.is_file()}


def verify_restored(roots, expected, target):
    expected_files = set(expected)
    restored_files = set()
    for source in roots:
        dest = target / source.relative_to("/")
        if source.is_file():
            if not dest.is_file() or dest.is_symlink():
                raise RuntimeError("Off-host restore missing a required file")
            restored_files.add(str(source))
        else:
            if not dest.is_dir() or dest.is_symlink():
                raise RuntimeError("Off-host restore missing a media directory")
            for current, dirs, files in os.walk(dest, followlinks=False):
                for directory in dirs:
                    if (Path(current) / directory).is_symlink():
                        raise RuntimeError("Off-host restore included symbolic link")
                for name in files:
                    path = Path(current) / name
                    if not path.is_file() or path.is_symlink():
                        raise RuntimeError("Off-host restore included nonregular file")
                    restored_files.add(str(source / path.relative_to(dest)))
    if restored_files != expected_files:
        raise RuntimeError("Restored media file inventory differs from source")
    for original, meta in expected.items():
        candidate = target / original.lstrip("/")
        if candidate.stat().st_size != meta["size"] or file_hash(candidate) != meta["sha256"]:
            raise RuntimeError("Restored file checksum differs from source")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suffix", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--acknowledge-shared-encrypted-repository", action="store_true")
    options = parser.parse_args()
    if os.geteuid() != 0 or not options.acknowledge_shared_encrypted_repository:
        raise RuntimeError("Root and explicit shared Restic repository approval required")
    if not NAME.fullmatch(options.suffix) or not RUN.fullmatch(options.run_id):
        raise RuntimeError("Invalid suffix or run ID")
    state = STATE_ROOT / options.suffix
    protected(state, directory=True)
    run = state / "backups" / options.run_id
    protected(run, directory=True)
    snapshot = Path(options.snapshot)
    if snapshot not in (run / "source.sqlite", state / "final-sqlite.db"):
        raise RuntimeError("Use a run-local online snapshot or the immutable final frozen SQLite snapshot")
    protected(snapshot)
    manifest_file = Path(str(snapshot) + ".manifest.json")
    protected(manifest_file)
    manifest = json.loads(manifest_file.read_text())
    if manifest.get("status") != "PASS" or file_hash(snapshot) != manifest.get("snapshot_sha256"):
        raise RuntimeError("SQLite online snapshot and manifest do not agree")
    with sqlite3.connect("file:" + str(snapshot) + "?mode=ro", uri=True) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or db.execute("PRAGMA foreign_key_check").fetchone():
            raise RuntimeError("Consistent SQLite snapshot integrity/FK check failed")
    if (RESTIC.is_symlink() or not RESTIC.is_file() or
        RESTIC.stat().st_uid != 0 or RESTIC.stat().st_mode & 0o022
        or not RESTIC.stat().st_mode & stat.S_IXUSR):
        raise RuntimeError("Expected trusted root-owned Restic wrapper")
    restore = run / "restored"
    evidence = run / "restic-restore-evidence.json"
    if evidence.exists() or evidence.is_symlink() or restore.exists() or restore.is_symlink():
        raise RuntimeError("Refusing to overwrite previous restore/evidence")
    roots = [snapshot, manifest_file]
    media_files = walk_media()
    media_roots = [p for p in media_files if p.is_dir()]
    roots.extend(media_roots)
    checksums = inventory([snapshot, manifest_file] + media_files)
    required_space = sum(meta["size"] for meta in checksums.values())
    # An independent restore consumes disk in addition to original data.
    if shutil.disk_usage(run).free < required_space + 8 * 1024 ** 3:
        raise RuntimeError("Insufficient disk for independent restored media and 8 GiB reserve")
    tag = f"erp-cutover-{options.suffix}-{options.run_id}"
    before = snapshots(tag)
    checked([str(RESTIC), "backup", "--tag", "bababuilds-erp",
             "--tag", tag, *map(str, roots)], timeout=3600)
    after = snapshots(tag)
    newer = [(sid, obj) for sid, obj in after.items() if sid not in before]
    if len(newer) != 1:
        raise RuntimeError("Expected exactly one NEW remote ERP snapshot")
    sid, item = newer[0]
    if set(map(str, roots)) != set(item.get("paths", [])):
        raise RuntimeError("Remote snapshot did not include all ERP roots")
    restore.mkdir(mode=0o700)
    checked([str(RESTIC), "restore", sid, "--target", str(restore)], timeout=3600)
    verify_restored(roots, checksums, restore)
    # Detect source media changes during the remote backup/restore window;
    # a rehearsal is not a writer-freeze, so a mutation is a hard failure.
    for name, attrs in checksums.items():
        current = Path(name)
        if not current.is_file() or current.stat().st_size != attrs["size"] or file_hash(current) != attrs["sha256"]:
            raise RuntimeError("Source media changed during backup; schedule a fresh rehearsal")
    report = {"status": "PASS", "source_sqlite_sha256": manifest["snapshot_sha256"],
              "remote_snapshot_id_prefix": sid[:12], "media_files": len(checksums) - 2,
              "media_roots": len(media_roots),
              "remote_restore_verified": True, "production_changed": False,
              "note": "Point-in-time SQLite snapshot plus contemporaneous media; repeat after write-freeze"}
    descriptor = os.open(evidence, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(report, output, sort_keys=True)
        output.write("\n")
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.TimeoutExpired) as error:
        print("ERP ENCRYPTED OFF-HOST BACKUP/RESTORE BLOCKED: " + str(error), file=sys.stderr)
        sys.exit(1)
