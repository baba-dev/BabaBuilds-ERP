"""Safety tests for the Node 26 immutable ERP release manager."""
from datetime import datetime, timedelta, timezone
import io
from pathlib import Path
import sys
import tarfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ops" / "erp-release"))
import package as release_package
import promote as release_promote


def tarentry(name, *, type=tarfile.REGTYPE, size=0):
    entry = tarfile.TarInfo(name)
    entry.type = type
    entry.size = size
    return entry


def receipt(clock=None):
    clock = clock or datetime.now(timezone.utc)
    return {
        "snapshot": "a" * 64,
        "backup_at": (clock - timedelta(hours=2)).isoformat(),
        "restore_at": (clock - timedelta(days=1)).isoformat(),
        "checks": {name: True for name in release_promote.CHECKS},
    }


class ArchiveSafetyTests(unittest.TestCase):
    def test_accepts_regular_archive(self):
        self.assertTrue(release_package.validate_members([
            tarentry("release", type=tarfile.DIRTYPE),
            tarentry("release/server.js", size=1),
            tarentry("release/public/sw.js", size=1),
            tarentry("release/erp-worker.mjs", size=1),
        ]))

    def test_rejects_absolute_or_traversal(self):
        for malicious in ("/etc/shadow", "release/../../etc/passwd", "../release/server.js", "other/server.js"):
            with self.subTest(path=malicious):
                with self.assertRaises(ValueError):
                    release_package.validate_members([tarentry("release/server.js"), tarentry(malicious)])

    def test_rejects_symlinks_hardlinks_devices_and_duplicates(self):
        for type in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE):
            with self.subTest(type=type):
                with self.assertRaises(ValueError):
                    release_package.validate_members([tarentry("release/server.js"), tarentry("release/x", type=type)])
        with self.assertRaises(ValueError):
            release_package.validate_members([tarentry("release/server.js"), tarentry("release/server.js")])

    def test_size_bound_and_server_requirement(self):
        with self.assertRaises(ValueError):
            release_package.validate_members([tarentry("release/server.js", size=release_package.MAX_BYTES + 1)])
        with self.assertRaises(ValueError):
            release_package.validate_members([tarentry("release/public/file.js")])


class PreflightSafetyTests(unittest.TestCase):
    def test_fresh_complete_recovery_proof(self):
        clock = datetime(2026, 11, 17, 0, 0, tzinfo=timezone.utc)
        self.assertTrue(release_promote.recovery_checks(receipt(clock), clock=clock))

    def test_rejects_missing_proof(self):
        clock = datetime(2026, 11, 17, tzinfo=timezone.utc)
        example = receipt(clock)
        example["checks"]["payment_idempotency"] = False
        with self.assertRaises(RuntimeError):
            release_promote.recovery_checks(example, clock=clock)

    def test_rejects_stale_backup_or_restore(self):
        clock = datetime(2026, 11, 17, tzinfo=timezone.utc)
        old = receipt(clock)
        old["backup_at"] = (clock - timedelta(hours=38)).isoformat()
        with self.assertRaises(RuntimeError):
            release_promote.recovery_checks(old, clock=clock)
        old = receipt(clock)
        old["restore_at"] = (clock - timedelta(days=8)).isoformat()
        with self.assertRaises(RuntimeError):
            release_promote.recovery_checks(old, clock=clock)

    def test_rejects_future_or_naive_attestation(self):
        clock = datetime(2026, 11, 17, tzinfo=timezone.utc)
        for value in ("2026-11-18T00:00:00+00:00", "2026-11-16T00:00:00"):
            example = receipt(clock)
            example["backup_at"] = value
            with self.assertRaises((RuntimeError, ValueError)):
                release_promote.recovery_checks(example, clock=clock)

    def test_production_and_staging_database_isolation(self):
        release_promote.valid_pg_url("postgresql://x:y@localhost:5432/bababuilds_erp", production=True)
        release_promote.valid_pg_url("postgresql://x:y@127.0.0.1:5432/bababuilds_erp_staging_test", production=False)
        for url in ("postgresql://server.example.com/bababuilds_erp",
                    "file:/tmp/prod.db", "postgresql://localhost/bababuilds_erp_staging_test"):
            with self.assertRaises(RuntimeError):
                release_promote.valid_pg_url(url, production=True)
        with self.assertRaises(RuntimeError):
            release_promote.valid_pg_url("postgresql://localhost/bababuilds_erp", production=False)

    def test_migration_checksum_guard(self):
        digest = "a" * 64
        with patch.object(release_promote, "run", return_value="20261116000000_postgresql_baseline|" + digest):
            self.assertTrue(release_promote.check_schema_contract(
                {"20261116000000_postgresql_baseline": digest}
            ))
            with self.assertRaises(RuntimeError):
                release_promote.check_schema_contract(
                    {"20261116000000_postgresql_baseline": "b" * 64}
                )

    def test_prior_process_only_approved_node_and_directory(self):
        cfg = {
            "legacy_node": "/opt/bababuilds-erp/node22/bin/node",
            "legacy_release": "/opt/bababuilds-erp-cutover/cut1611b/app/.next/standalone",
            "node26": "/opt/bababuilds-erp/node26/bin/node",
        }
        good = {"pm2_env": {
            "pm_exec_path": cfg["legacy_node"], "pm_cwd": cfg["legacy_release"],
            "args": ["--env-file=/etc/bababuilds-erp/production-database.env",
                     cfg["legacy_release"] + "/server.js"],
            "env": {"NODE_ENV": "production", "DATABASE_URL": "do-not-log"},
        }}
        result = release_promote.snapshot_app(good, cfg)
        self.assertEqual(result["exec"], cfg["legacy_node"])
        self.assertEqual(result["cwd"], cfg["legacy_release"])
        good["pm2_env"]["pm_cwd"] = "/var/www/clubkeep/current"
        with self.assertRaises(RuntimeError):
            release_promote.snapshot_app(good, cfg)


if __name__ == "__main__":
    unittest.main()
