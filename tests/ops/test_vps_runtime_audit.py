"""Contracts for the Node26/PostgreSQL17/Prisma7 + systemd ERP transition."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "ops/erp-release/audit_vps.py"
spec = importlib.util.spec_from_file_location("erp_vps_audit", SRC)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class PlatformContract(unittest.TestCase):
    def test_node26_prisma7_and_postgres_pinned(self):
        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual((ROOT / ".nvmrc").read_text().strip(), "26.13.1")
        self.assertEqual(package["engines"]["node"], ">=26.13.1 <27")
        self.assertEqual(package["dependencies"]["@prisma/client"], "7.10.1")
        self.assertEqual(package["dependencies"]["@prisma/adapter-pg"], "7.10.1")
        self.assertEqual(package["devDependencies"]["prisma"], "7.10.1")
        self.assertIn('provider = "postgresql"', (ROOT / "prisma/schema.prisma").read_text())

    def test_systemd_service_runs_node26_without_pm2(self):
        unit = (ROOT / "ops/systemd/bababuilds-erp.service").read_text()
        self.assertIn("After=network-online.target postgresql@17-main.service", unit)
        self.assertIn("ExecStart=/opt/bababuilds-erp/node26/bin/node", unit)
        self.assertIn("--env-file=/etc/bababuilds-erp/production-database.env", unit)
        self.assertNotIn("node22", unit.lower())
        self.assertNotIn("pm2", next(line for line in unit.splitlines() if line.startswith("ExecStart=")))

    def test_staging_service_uses_node26(self):
        unit = (ROOT / "ops/systemd/erp-postgres-staging@.service").read_text()
        self.assertIn("ExecStart=/opt/bababuilds-erp/node26/bin/node", unit)
        self.assertNotIn("/opt/bababuilds-erp/node22/bin", unit)

    def test_legacy_runtime_cannot_be_retired_before_systemd_healthy(self):
        services = {"bababuilds-erp.service": False}
        pm2 = {"count": 1}
        systemd = {"pid_present": False, "runtime": ""}
        self.assertFalse(audit.safe_to_retire(services, pm2, systemd, 1, [],
                                              "v26.13.1"))
        services["bababuilds-erp.service"] = True
        systemd = {"pid_present": True, "runtime": str(audit.NODE26)}
        self.assertFalse(audit.safe_to_retire(services, {"count": 1}, systemd,
                                              0, [], "v26.13.1"))
        self.assertFalse(audit.safe_to_retire(services, {"count": 0}, systemd,
                                              0, ["legacy.service"], "v26.13.1"))
        self.assertTrue(audit.safe_to_retire(services, {"count": 0}, systemd,
                                             0, [], "v26.13.1"))

    def test_audit_is_read_only(self):
        src = SRC.read_text()
        for forbidden in ("systemctl stop", "systemctl disable", "rmtree(",
                          ".unlink(", "pm2 delete", "os.remove("):
            self.assertNotIn(forbidden, src)
        self.assertIn('"read_only": True', src)

    def test_nightly_regression_uses_disposable_postgres_17(self):
        workflow = (ROOT / ".github/workflows/regression.yml").read_text()
        self.assertIn("image: postgres:17", workflow)
        self.assertIn("bababuilds_erp_ci", workflow)

    def test_setup_installs_prisma7(self):
        setup = (ROOT / ".github/actions/setup/action.yml").read_text()
        self.assertIn("actions/setup-node@v7", setup)
        self.assertIn("NODE26_PRISMA7_POSTGRES_CONTRACT_PASS", setup)

if __name__ == "__main__":
    unittest.main()
