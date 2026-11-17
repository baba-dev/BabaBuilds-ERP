"""Node26 VPS commissioning must remain isolated from production activation."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "ops/erp-release/commission.py"
SPEC = importlib.util.spec_from_file_location("erp_node26_commission", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class Node26CommissionSafety(unittest.TestCase):
    def test_pinned_verified_binary(self):
        self.assertEqual(MODULE.NODE, "26.13.1")
        self.assertEqual(MODULE.NPM, "11.20.0")
        self.assertEqual(MODULE.EXPECTED_SHA256,
            "89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd")
        self.assertTrue(MODULE.URL.startswith("https://nodejs.org/dist/v26.13.1/"))
        self.assertEqual(str(MODULE.INSTALL), "/opt/bababuilds-erp/node26")
        self.assertEqual(str(MODULE.LEGACY), "/opt/bababuilds-erp/node22/bin/node")

    def test_audit_never_returns_secret_values(self):
        # Host inventory is mocked, including a fake inherited database URL.
        with patch.object(MODULE, "run", return_value=(127, "")), \
             patch.object(MODULE, "PM2_JS") as pm2, \
             patch.object(MODULE, "shutil") as disk:
            pm2.is_file.return_value = False
            disk.disk_usage.return_value = (100 * 1024**3, 50 * 1024**3, 50 * 1024**3)
            report = MODULE.audit()
            self.assertEqual(report["read_only_audit"], True)
            self.assertNotIn("DATABASE_URL", str(report))
            self.assertNotIn("NEXTAUTH_SECRET", str(report))
            self.assertNotIn("SSH_KEY", str(report))

    def test_install_does_not_target_other_saas(self):
        source = SOURCE.read_text()
        self.assertNotIn("systemctl restart", source)
        self.assertNotIn("pm2 restart", source)
        self.assertNotIn("prisma migrate deploy", source)
        self.assertNotIn("git reset --hard", source)
        self.assertIn("os.rename(source, INSTALL)", source)
        self.assertIn("EXPECTED_SHA256", source)

if __name__ == "__main__":
    unittest.main()
