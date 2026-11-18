#!/usr/bin/env python3
"""Build and verify immutable, ARM64-only ERP standalone release artifacts.

No database credentials, .env, private media, Next cache or source checkout
are shipped; the output is the traced Next standalone server + public/static.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone

REPO = "baba-dev/BabaBuilds-ERP"
VERSION = "26.13.1"
NPM = "11.20.0"
ARCH = "aarch64"
SHA_RE = re.compile(r"^[a-f0-9]{40}$")
MAX_BYTES = 1_500_000_000

def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def assert_sha(sha):
    if not SHA_RE.fullmatch(sha):
        raise ValueError("Expected immutable 40-character lowercase git SHA")
    return sha

def validate_members(members):
    """Reject absolute/traversal paths, links, device nodes, duplicate names and huge archives."""
    seen, total = set(), 0
    for entry in members:
        raw = entry.name
        parts = Path(raw).parts
        if (not raw or raw.startswith("/") or "\\" in raw or
            not parts or parts[0] != "release" or
            any(p in ("", ".", "..") for p in parts)):
            raise ValueError("Unsafe release archive path")
        if entry.name in seen:
            raise ValueError("Duplicate release archive member")
        seen.add(entry.name)
        if not (entry.isfile() or entry.isdir()):
            raise ValueError("Links and special files are prohibited in release archives")
        total += entry.size
        if total > MAX_BYTES:
            raise ValueError("Release archive exceeds size limit")
    if "release/server.js" not in seen or "release/public/sw.js" not in seen or "release/erp-worker.mjs" not in seen:
        raise ValueError("Standalone server or production service worker missing")
    if any(name.startswith("release/.next/cache/") or
           name in ("release/.env", "release/.env.local", "release/.env.production") for name in seen):
        raise ValueError("Environment file or build cache leaked into artifact")
    return True

def verify(archive, manifest, *, expected_sha=None):
    meta = json.loads(Path(manifest).read_text())
    if (meta.get("schema") != 1 or meta.get("repo") != REPO or
        meta.get("node") != VERSION or meta.get("npm") != NPM or
        meta.get("arch") != ARCH or meta.get("platform") != "linux" or
        not SHA_RE.fullmatch(str(meta.get("sha", "")))):
        raise ValueError("Release manifest does not match pinned contract")
    if expected_sha and meta["sha"] != assert_sha(expected_sha):
        raise ValueError("Release SHA mismatch")
    migrations = meta.get("migrations")
    if not isinstance(migrations, dict) or not migrations:
        raise ValueError("Migration checksum contract missing")
    if any(not re.fullmatch(r"[a-zA-Z0-9_-]+", name) or
           not re.fullmatch(r"[a-f0-9]{64}", str(checksum))
           for name, checksum in migrations.items()):
        raise ValueError("Invalid PostgreSQL migration checksum contract")
    if digest(archive) != meta.get("sha256"):
        raise ValueError("Archive SHA256 mismatch")
    with tarfile.open(archive, "r:gz") as bundle:
        validate_members(bundle.getmembers())
    return meta

def package_worker_runtime(root, release):
    """Stage the standalone worker and its **reachable production packages** only.

    Next standalone tracing does not include imports from a separate Node entry.
    This does not copy full root node_modules, other apps, or any .env files.
    """
    source = root / "ops" / "erp-worker" / "worker.mjs"
    if not source.is_file():
        raise RuntimeError("ERP worker source missing")
    shutil.copy2(source, release / "erp-worker.mjs")
    notify_source = root / "ops" / "erp-worker" / "notification-delivery.mjs"
    if not notify_source.is_file():
        raise RuntimeError("Phase 5 outbound worker source missing")
    shutil.copy2(notify_source, release / "notification-delivery.mjs")
    report_source = root / "ops" / "erp-worker" / "report-delivery.mjs"
    if not report_source.is_file():
        raise RuntimeError("Phase 5 scheduled report worker source missing")
    shutil.copy2(report_source, release / "report-delivery.mjs")
    for worker_source in ("erp-worker.mjs", "notification-delivery.mjs", "report-delivery.mjs"):
        subprocess.run(["node", "--check", str(release / worker_source)],
                       check=True, capture_output=True, timeout=15)

    completed = set()

    def resolve_package(name, importer):
        parent = importer
        while parent == root or root in parent.parents:
            target = parent / "node_modules" / name
            if (target / "package.json").is_file():
                return target
            parent = parent.parent
        raise RuntimeError("Required ERP worker dependency absent: " + name)

    def stage_package(name, importer):
        origin = resolve_package(name, importer)
        if origin in completed:
            return
        completed.add(origin)
        manifest = json.loads((origin / "package.json").read_text())
        destination = release / origin.relative_to(root)
        shutil.copytree(origin, destination, symlinks=False, dirs_exist_ok=True,
                        ignore=lambda folder, names: {".env", ".env.local", ".env.production"} & set(names))
        for dependency in manifest.get("dependencies", {}):
            stage_package(dependency, origin)
        for optional in manifest.get("optionalDependencies", {}):
            try:
                stage_package(optional, origin)
            except RuntimeError:
                pass

    for name in ("bullmq", "pg", "nodemailer", "web-push"):
        stage_package(name, root)


def stage(sha, destination, root):
    assert_sha(sha)
    if platform.system() != "Linux" or platform.machine() != ARCH:
        raise RuntimeError("Release must be built on native Linux aarch64")
    if subprocess.check_output(["node", "--version"], text=True).strip() != "v" + VERSION:
        raise RuntimeError("Wrong Node version")
    if subprocess.check_output(["npm", "--version"], text=True).strip() != NPM:
        raise RuntimeError("Wrong npm version")
    root = Path(root).resolve()
    source = root / ".next" / "standalone"
    for f in (source / "server.js", root / "public" / "sw.js"):
        if not f.is_file():
            raise RuntimeError(f"Missing production build output: {f}")
    target = Path(destination).resolve()
    target.mkdir(parents=True, exist_ok=True)
    archive = target / "erp-release.tar.gz"
    manifest = target / "manifest.json"
    with tempfile.TemporaryDirectory(prefix="erp-release-") as temp:
        release = Path(temp) / "release"
        def ignore_build_outputs(folder, names):
            # Next.js standalone may contain a copied .env and .next/cache.
            # Neither belongs in a distributable or immutable release.
            current = Path(folder)
            if current == source:
                return {".env", ".env.local", ".env.production"} & set(names)
            if current == source / ".next":
                return {"cache"} & set(names)
            return set()
        shutil.copytree(source, release, symlinks=False, ignore=ignore_build_outputs)
        static = release / ".next" / "static"
        static.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(root / ".next" / "static", static, dirs_exist_ok=True, symlinks=False)
        shutil.copytree(root / "public", release / "public", dirs_exist_ok=True, symlinks=False)
        package_worker_runtime(root, release)
        # A release must not accidentally include the local checkout, env or caches.
        for forbidden in (release / ".env", release / ".env.local", release / ".next" / "cache"):
            if forbidden.exists():
                raise RuntimeError("Unexpected private or cached build file in standalone output")
        with tarfile.open(archive, "w:gz", compresslevel=6) as bundle:
            bundle.add(release, arcname="release", recursive=True)
    migration_files = sorted((root / "prisma" / "migrations").glob("*/migration.sql"))
    if not migration_files:
        raise RuntimeError("Required PostgreSQL migration history absent")
    migrations = {f.parent.name: digest(f) for f in migration_files}
    info = {
        "schema": 1, "repo": REPO, "sha": sha, "node": VERSION, "npm": NPM,
        "platform": "linux", "arch": ARCH,
        "sha256": digest(archive),
        "migrations": migrations,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    manifest.write_text(json.dumps(info, sort_keys=True, indent=2) + "\n")
    verify(archive, manifest, expected_sha=sha)
    print("ERP_RELEASE_PACKAGE_PASS sha=" + sha + " sha256=" + info["sha256"])

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    actions = ap.add_subparsers(dest="action", required=True)
    make = actions.add_parser("build")
    make.add_argument("--sha", required=True)
    make.add_argument("--dest", required=True)
    make.add_argument("--source", default=".")
    check = actions.add_parser("verify")
    check.add_argument("--archive", required=True)
    check.add_argument("--manifest", required=True)
    check.add_argument("--sha")
    args = ap.parse_args()
    if args.action == "build":
        stage(args.sha, args.dest, args.source)
    else:
        info = verify(args.archive, args.manifest, expected_sha=args.sha)
        print("ERP_RELEASE_VERIFY_PASS sha=" + info["sha"])
if __name__ == "__main__":
    main()
