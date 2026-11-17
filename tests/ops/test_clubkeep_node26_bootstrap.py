"""Read-only contract for the privileged, source-pinned ClubKeep operator bootstrap."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/clubkeep-node26-operator-bootstrap.yml"


class ClubKeepNode26BootstrapContract(unittest.TestCase):
    def test_only_trusted_main_installs_reviewed_pr_head(self):
        s = WORKFLOW.read_text()
        self.assertIn("branches: [main]", s)
        self.assertIn("github.ref == 'refs/heads/main'", s)
        self.assertIn("environment: erp-production", s)
        self.assertIn("group: erp-immutable-production", s)
        self.assertIn("44273c54f1a5671aab0ef253bf9fd9305027e2e8", s)
        self.assertIn('any(.workflow_runs[]?;', s)
        self.assertIn('.conclusion == "success"', s)

    def test_root_operator_hashes_exact_and_root_owned(self):
        s = WORKFLOW.read_text()
        for expected in (
            "d7670dc21d09e02bb09c39e551b5575f7d61f43a",
            "208e313a323b3b7a7a3fad778b5a64dfeabc6346",
            "de203dc61e64126219e28f741387783d101b5815",
        ):
            self.assertIn(expected, s)
        self.assertIn("sudo -n git hash-object", s)
        self.assertIn("install -o root -g root -m 0600", s)
        self.assertIn("install -o root -g root -m 0750", s)
        self.assertIn("clubkeep-release.pre-node26", s)

    def test_never_restarts_apps_changes_db_or_node24(self):
        s = WORKFLOW.read_text()
        self.assertIn("CLUBKEEP_NODE26_OPERATOR_BOOTSTRAP_PASS", s)
        self.assertIn("no_services_or_runtime_switched", s)
        self.assertIn("systemctl is-active", s)
        self.assertIn("ExecStart | sha256sum", s)
        for forbidden in (
            "systemctl restart",
            "systemctl stop",
            "systemctl disable",
            "prisma migrate deploy",
            "pg_dump",
            "DROP DATABASE",
            "rm -rf",
            "/opt/menuminute/node24/bin/node --",
        ):
            self.assertNotIn(forbidden, s)


if __name__ == "__main__":
    unittest.main()
