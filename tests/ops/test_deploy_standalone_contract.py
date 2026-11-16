"""Static contract tests: no VPS access, production credentials or customer data."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = (ROOT / "scripts/operations/deploy-erp-standalone.sh").read_text()
WORKFLOW = (ROOT / ".github/workflows/deploy.yml").read_text()

class StandaloneDeploymentContractTests(unittest.TestCase):
    def test_postgres_and_isolated_runtime_are_only_targets(self):
        self.assertIn("/opt/bababuilds-erp/node22/bin", SCRIPT)
        self.assertIn("postgresql", SCRIPT.lower())
        self.assertIn("/etc/bababuilds-erp/production-database.env", SCRIPT)
        self.assertIn("pg_only", SCRIPT.lower()) if "pg_only" in SCRIPT.lower() else self.assertIn("check_schema", SCRIPT)
        self.assertNotIn("prisma db push", SCRIPT)
        self.assertNotIn("prisma migrate deploy", SCRIPT)
        self.assertNotIn("git reset --hard", SCRIPT)
        self.assertNotIn("sqlite3 ", SCRIPT)
        self.assertIn("git clone --quiet --single-branch --branch main", SCRIPT)
        self.assertIn("git -C \"$SRC\" checkout -q --detach \"$SHA\"", SCRIPT)

    def test_preview_and_recovery_before_save(self):
        self.assertIn("smoke 3199", SCRIPT)
        self.assertIn("smoke 3000", SCRIPT)
        self.assertIn("start_erp \"$PREV\"", SCRIPT)
        self.assertIn("on_error 1", SCRIPT)
        self.assertIn("ERP_STANDALONE_PRODUCTION_DEPLOYED", SCRIPT)
        self.assertIn('flock -n 9', SCRIPT)
        self.assertIn('PM2_HOME=/root/.pm2', SCRIPT)

    def test_media_is_persisted_and_not_copied_per_release(self):
        self.assertIn('PRIVATE_UPLOADS_DIR="$LIVE/private_uploads"', SCRIPT)
        self.assertIn('ln -s "$LIVE/$path" "$dest"', SCRIPT)
        self.assertIn('for path in public/invoices', SCRIPT)
        self.assertIn('tmp/share-target', SCRIPT)
        self.assertNotIn('rm -rf "$LIVE', SCRIPT)

    def test_workflow_only_accepts_green_main_ci(self):
        self.assertIn("workflow_run:", WORKFLOW)
        self.assertTrue('workflows: ["CI"]' in WORKFLOW or "workflows: [CI]" in WORKFLOW)
        self.assertIn("github.event.workflow_run.conclusion == 'success'", WORKFLOW)
        self.assertIn("github.event.workflow_run.event == 'push'", WORKFLOW)
        self.assertIn("github.event.workflow_run.head_repository.full_name == github.repository", WORKFLOW)
        self.assertIn("cancel-in-progress: false", WORKFLOW)
        self.assertIn("sudo -n /usr/local/sbin/bababuilds-erp-promote promote", WORKFLOW)
        self.assertIn("sudo -n /usr/local/sbin/bababuilds-erp-promote preflight", WORKFLOW)
        self.assertIn("appleboy/ssh-action@", WORKFLOW)
        self.assertIn("vars.ERP_AUTODEPLOY_ENABLED == 'true'", WORKFLOW)
        self.assertNotIn("pm2 restart erp --update-env", WORKFLOW)
        self.assertNotIn("git reset --hard", WORKFLOW)

if __name__ == "__main__":
    unittest.main()
