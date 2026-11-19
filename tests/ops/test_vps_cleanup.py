"""No-production-access contracts for the deliberately narrow ERP VPS cleanup."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "ops/erp-release/cleanup_vps.py"
spec = importlib.util.spec_from_file_location("cleanup_vps", SOURCE)
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class CleanUpContract(unittest.TestCase):
    def test_only_whitelisted_erp_paths_can_be_removed(self):
        content = SOURCE.read_text()
        self.assertIn('Path("/opt/bababuilds-erp/releases")', content)
        self.assertIn('"cut1611b", "dry1611a", "cut1611a"', content)
        self.assertIn('Path("/root/.npm/_cacache")', content)
        self.assertIn('Path("/var/www/bababuilds-erp/.next/cache")', content)
        self.assertIn('Path("/root/.cache/prisma")', content)
        self.assertNotIn('Path("/root/.cache/ms-playwright")', content)
        self.assertNotIn('shutil.rmtree(Path("/var/lib/menuminute', content)
        self.assertIn('Path("/var/www/clubkeep")', content)
        self.assertIn('Path("/var/lib/postgresql")', content)
        self.assertNotIn("systemctl restart", content)
        self.assertNotIn("prisma migrate", content)
        self.assertNotIn("npm cache clean", content)

    def test_active_release_is_never_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            releases = Path(tmp)
            one = releases / ("sha-" + "a" * 40 + "-20261117T000000Z")
            two = releases / ("sha-" + "b" * 40 + "-20261117T010000Z")
            for path in (one, two):
                (path / "runtime").mkdir(parents=True)
            current = two / "runtime"
            with patch.object(cleanup, "RELEASES", releases):
                entries = list(cleanup.candidates(current))
            obsolete = [path for kind, path in entries if kind == "obsolete_erp_release"]
            # Retain the current release and last three for safe rollback.
            self.assertEqual(obsolete, [])
            self.assertNotIn(two, obsolete)

    def test_release_retention_uses_timestamps_not_commit_hash_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            releases = Path(tmp)
            releases.mkdir(exist_ok=True)
            # SHA order and temporal order intentionally disagree.
            shas = ["f", "e", "d", "c", "b"]
            names = []
            for i, sha in enumerate(shas):
                p = releases / ("sha-" + sha * 40 + f"-20261117T0{i}0000Z")
                (p / "runtime").mkdir(parents=True)
                names.append(p)
            with patch.object(cleanup, "RELEASES", releases):
                entries = list(cleanup.candidates(names[-1] / "runtime"))
            obsolete = [path for kind, path in entries if kind == "obsolete_erp_release"]
            self.assertEqual(obsolete, names[:2])
            self.assertNotIn(names[-1], obsolete)

    def test_symlinked_target_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "actual"
            target.mkdir()
            link = Path(tmp) / "link"
            link.symlink_to(target, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "Symlink"):
                cleanup.real_path(link)

    def test_unlisted_cleanup_categories_fail_closed(self):
        fake = Path("/opt/bababuilds-erp/releases/unsafe")
        with patch.object(cleanup, "real_path", return_value=fake):
            with self.assertRaises(RuntimeError):
                cleanup.check_target("obsolete_erp_release", fake,
                                     Path("/opt/bababuilds-erp/releases/active/runtime"))

    def test_node22_binary_and_live_services_are_not_deleted(self):
        content = SOURCE.read_text()
        self.assertNotIn("shutil.rmtree(Path(\"/opt/bababuilds-erp/node22\")", content)
        self.assertIn('if Path("/opt/bababuilds-erp/node22/bin/node").exists()', content)
        self.assertIn("systemd-deploy.lock", content)
        self.assertIn("fcntl.flock", content)
        self.assertIn("process_references(path)", content)
        self.assertIn("KEEP_RECENT_RELEASES = 3", content)
        self.assertIn("ERP worker release sync pending", content)


    def test_apply_needs_explicit_flag(self):
        import sys
        argv = ["cleanup_vps.py", "--apply"]
        with patch.object(sys, "argv", argv):
            with self.assertRaisesRegex(RuntimeError, "requires"):
                cleanup.main()

    def test_github_job_is_main_only_and_serialized(self):
        workflow = (ROOT / ".github/workflows/erp-vps-lean-cleanup.yml").read_text()
        self.assertIn("branches: [main]", workflow)
        self.assertIn("group: erp-immutable-production", workflow)
        self.assertIn("environment: erp-production", workflow)
        self.assertIn("bf12d4ef9bb223eef4b3f9c3517978d3b324e0bc", workflow)
        self.assertIn("--plan", workflow)
        self.assertIn("--apply --confirm-erp-only", workflow)
        self.assertNotIn("menuminute --stop", workflow)

    def test_storage_scan_is_opt_in_not_on_deploy_preflight(self):
        source = (ROOT / "ops/erp-release/audit_vps.py").read_text()
        workflow = (ROOT / ".github/workflows/erp-vps-runtime-audit.yml").read_text()
        self.assertIn('if "--storage" in sys.argv[1:]:', source)
        self.assertIn('"$reviewed" --storage', workflow)


if __name__ == "__main__":
    unittest.main()
