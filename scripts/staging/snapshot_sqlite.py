#!/usr/bin/env python3
"""D1: take a consistent, read-only-source SQLite online snapshot of the LIVE ERP DB.

Creates exactly one new mode-0600 snapshot and one mode-0600 JSON manifest.
The source is opened mode=ro/query_only; the SQLite online backup API handles WAL
and concurrent writers. No app downtime, source schema alteration or PRAGMA write.
Requires the operator to supply the *verified live* absolute database path.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
import sys
import time

REQUIRED = {"User", "Workspace", "Invoice", "InvoicePayment"}
BASENAME_DENY = {"menuminute", "clubkeep"}
BYTES = 1024 * 1024


def sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as src:
        for chunk in iter(lambda: src.read(BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def assert_destination(src: Path, dst: Path):
    if not dst.is_absolute() or dst.name in ("", ".", ".."):
        raise RuntimeError("Absolute --output snapshot filename required")
    if dst.exists() or Path(str(dst) + ".manifest.json").exists():
        raise RuntimeError("Refusing to overwrite existing snapshot or manifest")
    if src == dst or dst.parent == src.parent:
        raise RuntimeError("Snapshot must use a separate private directory")
    if any(x in ("var", "www") for x in ()) or str(dst).startswith("/var/www/"):
        raise RuntimeError("Snapshot must not be created in a web-served directory")
    parent = dst.parent.resolve(strict=True)
    if stat.S_IMODE(parent.stat().st_mode) & 0o077:
        raise RuntimeError("Snapshot parent directory must be private (0700)")
    if parent.is_symlink() or dst.is_symlink():
        raise RuntimeError("Symlink destination not permitted")
    if dst.resolve(strict=False) == src:
        raise RuntimeError("Source/destination collision")


def inventory(con):
    names = {x[0] for x in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    if not REQUIRED.issubset(names):
        raise RuntimeError("Source is not a recognized ERP SQLite database")
    return names


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live-sqlite", required=True, help="Verified absolute path to active ERP SQLite file")
    parser.add_argument("--output", required=True, help="New absolute path under private operator-owned directory")
    parser.add_argument("--expect-source-sha256", help="Optional SHA256 from a quiescent source; never required for WAL DB")
    args = parser.parse_args(argv)
    src = Path(args.live_sqlite)
    if not src.is_absolute() or not src.is_file() or src.is_symlink():
        raise RuntimeError("Live SQLite must be an existing absolute regular file, not a symlink")
    src = src.resolve(strict=True)
    if src.stem.lower() in BASENAME_DENY:
        raise RuntimeError("Refusing to snapshot another application database")
    dst = Path(args.output)
    assert_destination(src, dst)
    original = src.stat()
    actual_before = sha256(src) if args.expect_source_sha256 else None
    if args.expect_source_sha256 and actual_before != args.expect_source_sha256:
        raise RuntimeError("Live SQLite file hash differs from operator expectation")

    # sqlite3 read-only URI prevents accidental writes; online backup reads a
    # transactionally consistent logical image even if source uses WAL.
    reader = sqlite3.connect(src.as_uri() + "?mode=ro", uri=True, timeout=15)
    reader.execute("PRAGMA query_only=ON")
    inventory(reader)
    journal = reader.execute("PRAGMA journal_mode").fetchone()[0]
    output_fd = os.open(dst, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(output_fd)
    try:
        writer = sqlite3.connect(str(dst), timeout=15)
        try:
            reader.backup(writer, pages=128, sleep=0.1)
            writer.commit()
        finally:
            writer.close()
        check = sqlite3.connect(dst.as_uri() + "?mode=ro", uri=True)
        try:
            tables = inventory(check)
            integrity = check.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError("Snapshot failed SQLite integrity_check")
            if check.execute("PRAGMA foreign_key_check").fetchone():
                raise RuntimeError("Snapshot has foreign-key violations")
            counts = {
                n: check.execute('SELECT count(*) FROM "' + n.replace('"', '""') + '"').fetchone()[0]
                for n in sorted(tables) if n != "_prisma_migrations"
            }
        finally:
            check.close()
        after = src.stat()
        data = {
            "status": "PASS",
            "source_size_bytes_before": original.st_size,
            "source_updated_during_capture": after.st_mtime_ns != original.st_mtime_ns,
            "source_journal_mode": journal,
            "snapshot_bytes": dst.stat().st_size,
            "snapshot_sha256": sha256(dst),
            "snapshot_path": str(dst),
            "tables": len(counts),
            "rows": sum(counts.values()),
            "utc_epoch": int(time.time()),
            "source_inode": original.st_ino,
            "source_device": original.st_dev,
        }
        manifest_path = Path(str(dst) + ".manifest.json")
        fd = os.open(manifest_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, sort_keys=True)
            handle.write("\n")
        print(json.dumps(data, sort_keys=True))
    except BaseException:
        # No incomplete sensitive snapshot should be left in an operator folder.
        dst.unlink(missing_ok=True)
        raise
    finally:
        reader.close()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, sqlite3.Error, ValueError) as exc:
        print("D1 SNAPSHOT REFUSED: " + str(exc), file=sys.stderr)
        sys.exit(1)
