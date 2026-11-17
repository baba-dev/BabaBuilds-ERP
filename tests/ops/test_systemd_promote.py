"""Systemd-only ERP deployment and zero-consumer retirement invariants."""
import io
import importlib.util
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ops" / "erp-release"))
spec = importlib.util.spec_from_file_location(
    "systemd_promote", ROOT / "ops" / "erp-release" / "systemd_promote.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SystemdPromoteTests(unittest.TestCase):
    def test_release_contract_is_node26_and_protected_postgres_only(self):
        script = (ROOT / "ops/erp-release/systemd_promote.py").read_text()
        self.assertIn("v26.13.1", script)
        self.assertIn("postgresql@17-main", script)
        self.assertIn("ERP_POSTGRES_MIGRATION_HISTORY_MATCH", script)
        self.assertIn("systemctl", script)
        self.assertNotIn("prisma migrate deploy", script)
        self.assertNotIn("prisma db push", script)
        self.assertNotIn("pm2 restart", script)
        self.assertNotIn("systemctl restart menuminute", script)
        self.assertIn("retire-node22", script)

    def test_health_safely_checks_login_session_and_worker(self):
        calls = []
        def fake(path, port):
            calls.append((path, port))
            return 307 if path == "login" else 200
        with patch.object(module, "probe", side_effect=fake):
            module.health(3000, attempts=1)
        self.assertEqual(calls, [
            ("login", 3000), ("api/auth/session", 3000), ("sw.js", 3000)
        ])
        calls.clear()
        with patch.object(module, "probe", side_effect=fake):
            module.health(3199, staging=True, attempts=1)
        self.assertEqual(calls, [("login", 3199), ("api/auth/session", 3199)])

    def test_health_rejects_missing_live_service_worker(self):
        def fake(path, port):
            return 404 if path == "sw.js" else 200
        with patch.object(module, "probe", side_effect=fake), \
             patch.object(module.time, "sleep"):
            with self.assertRaises(RuntimeError):
                module.health(3000, attempts=2)

    def test_postgres_checksum_refuses_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "manifest.json"
            manifest.write_text(json.dumps({"migrations": {"baseline": "a" * 64}}))
            with patch.object(module, "run", return_value="baseline|" + "a" * 64):
                module.check_db(manifest)
            with patch.object(module, "run", return_value="baseline|" + "b" * 64):
                with self.assertRaisesRegex(RuntimeError, "migration history differs"):
                    module.check_db(manifest)

    def test_stage_verified_archive_preserves_live_media_as_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            releases, app = root / "releases", root / "live"
            releases.mkdir()
            for name in ("private_uploads", "public/logos", "public/partner-kit"):
                (app / name).mkdir(parents=True)
            archive = root / "candidate.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                for name, content in (
                    ("release/server.js", b"server"),
                    ("release/public/sw.js", b"worker"),
                    ("release/public/partner-kit/asset.svg", b"old-build"),
                ):
                    info = tarfile.TarInfo(name)
                    info.size = len(content)
                    tar.addfile(info, io.BytesIO(content))
            with patch.object(module, "RELEASES", releases), \
                 patch.object(module, "APP", app), \
                 patch.object(module, "MEDIA", ("private_uploads", "public/logos", "public/partner-kit")):
                runtime = module.stage(archive, "a" * 40)
            self.assertEqual((runtime / "server.js").read_bytes(), b"server")
            self.assertTrue((runtime / "public/logos").is_symlink())
            self.assertEqual((runtime / "public/logos").resolve(), (app / "public/logos").resolve())
            self.assertEqual((runtime / "public/partner-kit").resolve(),
                             (app / "public/partner-kit").resolve())
            self.assertFalse((app / "public/partner-kit/asset.svg").exists())

    def test_switch_updates_only_symlink_and_restores_on_failed_health(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            previous = base / "old"
            replacement = base / "new"
            previous.mkdir()
            replacement.mkdir()
            current = base / "current"
            current.symlink_to(previous)
            with patch.object(module, "CURRENT", current), \
                 patch.object(module, "RELEASES", base), \
                 patch.object(module, "run", return_value=""), \
                 patch.object(module, "health", side_effect=[RuntimeError("bad"), None]), \
                 patch.object(module, "main_pid", return_value="123"):
                with self.assertRaisesRegex(RuntimeError, "bad"):
                    module.switch(previous, replacement)
            self.assertEqual(current.resolve(), previous)

    def test_node22_retirement_guard_blocks_without_audit_pass(self):
        with patch.object(module, "preflight"), \
             patch.object(module, "inspect_audit", return_value={
                "legacy": {"safe_to_retire_node22": False}
             }):
            with self.assertRaisesRegex(RuntimeError, "retirement guard"):
                module.retire_node22()

    def test_automatic_workflow_has_no_legacy_pm2_promotion(self):
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text()
        self.assertIn("workflows: [\"CI\"]", workflow)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", workflow)
        self.assertIn("vars.CI_SMOKE_ADVISORY != 'true'", workflow)
        self.assertIn("Native ARM64 immutable candidate", workflow)
        self.assertIn("ERP_SYSTEMD", (ROOT / "ops/erp-release/systemd_promote.py").read_text())
        self.assertIn("ops/erp-release/systemd_promote.py", workflow)
        self.assertIn("retire-node22", workflow)
        self.assertNotIn("bababuilds-erp-promote", workflow)
        self.assertNotIn("ERP_RECOVERY_VERIFIED", workflow)

if __name__ == "__main__":
    unittest.main()
