"""D1/D3 stage provisioning and runtime gates: no host/PG access required."""
import errno
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[2]


def read_module(name, path):
    spec = importlib.util.spec_from_file_location(name, BASE / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


provision = read_module("stage_provision", "scripts/staging/provision.py")
preflight = read_module("stage_preflight", "scripts/staging/runtime_preflight.py")


class StageSecurityTest(unittest.TestCase):
    def test_unique_stage_db_and_roles(self):
        db, owner, runtime = provision.names("20261116a")
        self.assertEqual(db, "bababuilds_erp_staging_20261116a")
        self.assertNotEqual(owner, runtime)
        for invalid in ["", "ma", "PROD", "../other", "menuminute!", "x" * 15]:
            with self.assertRaisesRegex(RuntimeError, "Suffix"):
                provision.names(invalid)

    def test_fail_closed_without_protected_env(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(preflight.valid())

    def test_public_egress_must_be_denied_by_kernel_not_network_timeout(self):
        with patch.object(preflight.socket, "socket") as factory:
            sock = factory.return_value.__enter__.return_value
            sock.connect.side_effect = PermissionError(errno.EACCES, "blocked")
            self.assertTrue(preflight.network_egress_blocked())
            sock.connect.side_effect = OSError(errno.ETIMEDOUT, "timeout")
            self.assertFalse(preflight.network_egress_blocked())
            sock.connect.side_effect = None
            self.assertFalse(preflight.network_egress_blocked())

    def test_config_only_does_not_require_kernel_guard_but_full_preflight_does(self):
        env = {
            "ERP_STAGING_MODE": "1",
            "DATABASE_URL": "postgresql://stage:secret@127.0.0.1:5432/bababuilds_erp_staging_20261116a",
            "NEXTAUTH_URL": "http://127.0.0.1:3101",
            "NEXTAUTH_SECRET": "test-only-32-chars-long-enough-value",
            "PORT": "3101", "HOSTNAME": "127.0.0.1",
            "AUTH_GOOGLE_ENABLED": "false", "AUTH_EMAIL_ENABLED": "false",
        }
        with patch.dict("os.environ", env, clear=True):
            with patch.object(preflight, "network_egress_blocked", return_value=False):
                self.assertTrue(preflight.preflight(config_only=True))
                self.assertFalse(preflight.preflight(config_only=False))

    def test_reject_production_database_and_external_host(self):
        standard = {
            "ERP_STAGING_MODE": "1",
            "DATABASE_URL": "postgresql://stage:secret@127.0.0.1:5432/bababuilds_erp_staging_20261116a",
            "NEXTAUTH_URL": "http://127.0.0.1:3101",
            "NEXTAUTH_SECRET": "test-only-32-chars-long-enough-value",
            "PORT": "3101",
            "HOSTNAME": "127.0.0.1",
            "AUTH_GOOGLE_ENABLED": "false",
            "AUTH_EMAIL_ENABLED": "false",
        }
        with patch.dict("os.environ", standard, clear=True):
            self.assertTrue(preflight.valid())
        for key, bad in [
            ("DATABASE_URL", "postgresql://stage:secret@127.0.0.1:5432/menuminute"),
            ("DATABASE_URL", "postgresql://stage:secret@127.0.0.1:5432/bababuilds_erp"),
            ("DATABASE_URL", "postgresql://stage:secret@example.com:5432/bababuilds_erp_staging_20261116a"),
            ("NEXTAUTH_URL", "https://erp.bababuilds.com"),
            ("HOSTNAME", "0.0.0.0"),
            ("AUTH_EMAIL_ENABLED", "true"),
            ("EMAIL_SERVER_PASSWORD", "would-be-external-smtp"),
            ("CRON_SECRET", "should-not-exist"),
        ]:
            with self.subTest(key=key, bad=bad):
                with patch.dict("os.environ", {**standard, key: bad}, clear=True):
                    self.assertFalse(preflight.valid())


if __name__ == "__main__":
    unittest.main()
