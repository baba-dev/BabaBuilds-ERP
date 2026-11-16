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

    def test_operator_freeze_markers_are_not_optional(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "freeze"
            with self.assertRaises(RuntimeError):
                promote.private_marker(file, "WRITE_FREEZE_CONFIRMED")
            file.write_text("WRONG", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                promote.private_marker(file, "WRITE_FREEZE_CONFIRMED")

    def test_deploy_requires_postcutover_verification(self):
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text()
        self.assertIn("ERP_POSTGRES_PRODUCTION_VERIFIED", workflow)
        self.assertIn("postgres-production-verified", workflow)
        self.assertIn("/opt/bababuilds-erp/node22/bin", workflow)
        self.assertIn("production-database.env", workflow)
        self.assertIn("pm2 restart erp --update-env", workflow)


if __name__ == "__main__":
    unittest.main()
