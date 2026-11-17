"""Safety contract for Phase 4 root-only audit and independent drill."""
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "scripts/operations/erp-phase4-audit.sh"
DRILL = ROOT / "scripts/operations/erp-phase4-rehearse.sh"

class Phase4OperatorSafetyTests(unittest.TestCase):
    def test_bash_syntax(self):
        for path in (AUDIT, DRILL):
            subprocess.run(["bash", "-n", str(path)], check=True)

    def test_audit_is_readonly_and_does_not_publish_secrets(self):
        source = AUDIT.read_text()
        self.assertIn('OUTBOX_MIGRATION=', source)
        self.assertIn('CANARY_ID_SETTING=', source)
        self.assertNotIn('systemctl restart', source)
        self.assertNotIn('migrate deploy', source)
        self.assertNotIn('redis-cli FLUSH', source)
        self.assertNotIn('source "$env_file"', source)

    def test_drill_db_is_generated_and_cleanup_is_isolated(self):
        source = DRILL.read_text()
        self.assertIn('bababuilds_erp_phase4_drill_', source)
        self.assertIn('ERP_PHASE4_DRILL_DATABASE_REMOVED', source)
        self.assertIn("expected_blob='d2aca4d4ef0eaff8b9286e65826212ed5a6b8868'", source)
        self.assertIn('pg_restore', source)
        self.assertNotIn('dropdb bababuilds_erp\n', source)
        self.assertNotIn('prisma db push', source)

if __name__ == "__main__":
    unittest.main()
