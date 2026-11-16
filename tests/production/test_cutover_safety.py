"""Phase E cutover safety: pure tests, no VPS, PostgreSQL or customer data."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(key, name):
    spec = importlib.util.spec_from_file_location(key, ROOT / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


provision = load("erp_prod_candidate", "scripts/production/provision_candidate.py")
promote = load("erp_prod_promote", "scripts/production/promote_candidate.py")
importer = load("erp_stage_importer", "scripts/sqlite-to-postgres.py")
verify = load("erp_stage_verifier", "scripts/phase-c-verify.py")
runtime = load('erp_runtime_audit', 'scripts/production/audit_runtime.py')
backup = load("erp_backup_restore", "scripts/production/backup_restore_rehearsal.py")


class CutoverSafetyTests(unittest.TestCase):
    def test_candidate_drill_and_roles_unique_and_nonproduction(self):
        candidate, drill, migrator, runtime = provision.names("cut1611a")
        self.assertEqual(candidate, "bababuilds_erp_staging_cut1611a")
        self.assertEqual(drill, "bababuilds_erp_drill_cut1611a")
        self.assertNotEqual(migrator, runtime)
        self.assertNotIn("bababuilds_erp", (candidate, drill))
        for invalid in ("", "abc", "UPPER", "../live", "cutover-prod!", "a" * 13):
            with self.assertRaises(RuntimeError):
                provision.names(invalid)

    def test_importer_still_refuses_prod_database(self):
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://user:pw@127.0.0.1:5432/bababuilds_erp"
        }):
            with self.assertRaises(RuntimeError):
                importer.env_for("bababuilds_erp")

    def test_full_row_verifier_still_refuses_prod_database(self):
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://user:pw@127.0.0.1:5432/bababuilds_erp"
        }):
            with self.assertRaises(RuntimeError):
                verify.pg_env("bababuilds_erp")

    def test_sha256_checks_file_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "sample"
            file.write_bytes(b"frozen example")
            original = promote.digest(file)
            file.write_bytes(b"modified example")
            self.assertNotEqual(promote.digest(file), original)

    def test_frozen_source_sha_distinct_from_backup_sha(self):
        # The SQLite backup API can produce a different physical file hash.
        # Promotion must compare the frozen live file to its OWN attested SHA.
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "live.db"
            source.write_bytes(b"stable original sqlite bytes")
            st = source.stat()
            manifest = {
                "frozen_source_sha256": promote.digest(source),
                "snapshot_sha256": "a" * 64,
                "source_inode": st.st_ino,
                "source_device": st.st_dev,
            }
            self.assertNotEqual(manifest["frozen_source_sha256"],
                                manifest["snapshot_sha256"])
            promote.assert_frozen_source_unchanged(source, manifest)
            source.write_bytes(b"modified after freeze")
            with self.assertRaisesRegex(RuntimeError, "differs from frozen"):
                promote.assert_frozen_source_unchanged(source, manifest)
            with self.assertRaises(RuntimeError):
                promote.assert_frozen_source_unchanged(source, {**manifest,
                    "frozen_source_sha256": None})

    def test_operator_freeze_markers_are_not_optional(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "freeze"
            with self.assertRaises(RuntimeError):
                promote.private_marker(file, "WRITE_FREEZE_CONFIRMED")
            file.write_text("WRONG", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                promote.private_marker(file, "WRITE_FREEZE_CONFIRMED")

    def test_promotion_requires_final_offhost_restore_same_sqlite_sha(self):
        valid = {
            "status": "PASS",
            "source_sqlite_sha256": "a" * 64,
            "remote_restore_verified": True,
            "production_changed": False,
            "media_files": 27,
            "remote_snapshot_id_prefix": "b" * 12,
        }
        promote.require_frozen_offhost_restore(valid, "a" * 64)
        with self.assertRaisesRegex(RuntimeError, "recovery evidence invalid"):
            promote.require_frozen_offhost_restore(valid, "c" * 64)
        for mutation in (
            {"remote_restore_verified": False},
            {"status": "FAIL"},
            {"media_files": 0},
            {"production_changed": True},
            {"remote_snapshot_id_prefix": "bad"},
        ):
            with self.assertRaisesRegex(RuntimeError, "recovery evidence invalid"):
                promote.require_frozen_offhost_restore({**valid, **mutation}, "a" * 64)

    def test_root_erp_cron_freeze_rejects_scheduled_writers(self):
        from unittest.mock import Mock
        with patch.object(promote.subprocess, "run", return_value=Mock(
            returncode=0,
            stdout="*/10 * * * * /var/www/bababuilds-erp/scripts/run-cron.sh documents-ocr\n"
        )):
            with self.assertRaisesRegex(RuntimeError, "cron jobs still enabled"):
                promote.assert_root_erp_cron_paused()
        with patch.object(promote.subprocess, "run", return_value=Mock(
            returncode=0,
            stdout="# */10 * * * * /var/www/bababuilds-erp/scripts/run-cron.sh documents-ocr\n0 1 * * * /usr/bin/true\n"
        )):
            promote.assert_root_erp_cron_paused()

    def test_backup_hashes_and_rejects_modified_restore(self):
        import shutil
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "private"
            source.mkdir()
            file = source / "invoice.pdf"
            file.write_bytes(b"sample")
            restore = root / "restore"
            restored = restore / source.relative_to("/")
            restored.mkdir(parents=True)
            shutil.copyfile(file, restored / file.name)
            original = backup.inventory([file])
            backup.verify_restored([source], original, restore)
            (restored / file.name).write_bytes(b"tampered")
            with self.assertRaisesRegex(RuntimeError, "checksum"):
                backup.verify_restored([source], original, restore)

    def test_backup_restore_rejects_unexpected_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "private"
            source.mkdir()
            file = source / "a"
            file.write_text("data")
            restore = root / "restore"
            dest = restore / source.relative_to("/")
            dest.mkdir(parents=True)
            (dest / "a").write_text("data")
            (dest / "unexpected").write_text("data")
            with self.assertRaisesRegex(RuntimeError, "inventory"):
                backup.verify_restored([source], backup.inventory([file]), restore)

    def test_backup_remote_snapshots_need_valid_ids(self):
        with patch.object(backup, "checked", return_value='[{"id":"not-valid"},{"id":"' + "a"*64 + '"}]'):
            self.assertEqual(list(backup.snapshots("tag")), ["a"*64])

    def test_realdata_rehearsal_is_new_database_only(self):
        script = (ROOT / "scripts/production/rehearse_integration.sh").read_text()
        self.assertIn('! -e "$state"', script)
        self.assertIn("feature/postgresql-production-main-integration", script)
        self.assertIn("sha256", script)
        self.assertIn('scripts/production/provision_candidate.py', script)
        self.assertIn('scripts/phase-c-verify.py', script)
        self.assertIn('scripts/phase-c-restore-drill.py', script)
        self.assertNotIn('systemctl stop', script)
        self.assertNotIn('pm2 stop', script)
        self.assertNotIn('ALTER DATABASE', script)

    def test_runtime_audit_only_returns_environment_key_names(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text(
                "DATABASE_URL=postgresql://admin:secret@127.0.0.1:5432/private\n"
                "NEXTAUTH_SECRET=supersecret\n"
                "CRON_SECRET=abc123\n"
                "# PRIVATE_UPLOADS_DIR=/ignored\n"
                "export NEXTAUTH_URL=https://erp.example.test\n"
            )
            keys = runtime.env_keys(path)
            self.assertEqual(keys, {"DATABASE_URL", "NEXTAUTH_SECRET", "CRON_SECRET", "NEXTAUTH_URL"})
            self.assertNotIn("supersecret", repr(keys))
            self.assertNotIn("abc123", repr(keys))

    def test_runtime_audit_counts_active_erp_jobs(self):
        raw = (
            "*/10 * * * * /var/www/bababuilds-erp/scripts/run-cron.sh documents-ocr\n"
            "# 0 1 * * * /var/www/bababuilds-erp/scripts/run-cron.sh disabled\n"
            "0 4 * * * /usr/bin/true\n"
        )
        self.assertEqual(runtime.cron_counts(raw), (1, 2))

    def test_runtime_audit_pm2_extracts_only_safe_fields(self):
        raw = '{"name":"erp","pid":12,"pm2_env":{"status":"online","pm_cwd":"/var/www/bababuilds-erp","pm_exec_path":"/usr/bin/npm","exec_interpreter":"/usr/bin/node","SECRET":"private-value"}}'
        data = runtime.entries_from_pm2("[" + raw + "]")
        self.assertTrue(data["erp_online"])
        self.assertTrue(data["erp_entrypoint_is_existing_npm"])
        self.assertNotIn("private-value", repr(data))
        with self.assertRaisesRegex(RuntimeError, "exactly one ERP"):
            runtime.entries_from_pm2("[]")

    def test_legacy_inplace_deploy_disabled_after_standalone_cutover(self):
        # A green push to main must never restart the isolated production release
        # using the former npm /var/www working directory.
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text()
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("no server changes", workflow)
        self.assertNotIn("workflow_run:", workflow)
        self.assertNotIn("git reset --hard", workflow)
        self.assertNotIn("pm2 restart erp --update-env", workflow)
        self.assertNotIn("appleboy/ssh-action", workflow)


if __name__ == "__main__":
    unittest.main()
