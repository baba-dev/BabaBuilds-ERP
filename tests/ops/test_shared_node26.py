"""Offline PR A tests: signed-distribution installer is strictly side-by-side."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "ops/shared-runtime/provision_node26.py"
spec = spec_from_file_location("provision_node26", SRC)
provision = module_from_spec(spec)
spec.loader.exec_module(provision)


class SharedNode26Contract(unittest.TestCase):
    def test_official_immutable_arm64_release_and_path(self):
        self.assertEqual(provision.VERSION, "26.13.1")
        self.assertEqual(provision.ARCHIVE_NAME, "node-v26.13.1-linux-arm64.tar.xz")
        self.assertEqual(provision.ARCHIVE_SHA256,
                         "89e1853138db51e8b82d3e98ba9c0d3f2956a28e5e55ea1b7e12d25aae92d5dd")
        self.assertEqual(str(provision.DEST),
                         "/opt/bababuilds/runtimes/node-v26.13.1-linux-arm64")

    def test_tarball_rejects_traversal_and_unexpected_architecture(self):
        valid = tarfile.TarInfo("node-v26.13.1-linux-arm64/bin/node")
        valid.type = tarfile.REGTYPE
        self.assertTrue(provision.member_safe(valid))
        for path in ("/etc/passwd", "../etc/passwd",
                     "node-v26.13.1-linux-arm64/../../etc/passwd",
                     "node-v26.13.1-linux-x64/bin/node",
                     "node-v26.13.1-linux-arm642/bin/node"):
            t = tarfile.TarInfo(path)
            t.type = tarfile.REGTYPE
            self.assertFalse(provision.member_safe(t), path)

    def test_only_internal_symlinks_allowed(self):
        link = tarfile.TarInfo("node-v26.13.1-linux-arm64/bin/npm")
        link.type = tarfile.SYMTYPE
        link.linkname = "../lib/node_modules/npm/bin/npm-cli.js"
        self.assertTrue(provision.member_safe(link))
        for malicious in ("../../etc/shadow", "/etc/shadow"):
            link.linkname = malicious
            self.assertFalse(provision.member_safe(link))
        fifo = tarfile.TarInfo("node-v26.13.1-linux-arm64/fifo")
        fifo.type = tarfile.FIFOTYPE
        self.assertFalse(provision.member_safe(fifo))

    def test_rejects_unsigned_or_corrupt_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / provision.ARCHIVE_NAME
            archive.write_bytes(b"invalid download")
            with self.assertRaisesRegex(RuntimeError, "digest mismatch"):
                provision.validate_archive(archive)

    def test_existing_runtime_is_verified_instead_of_overwritten(self):
        with patch.object(provision, "verify_runtime", return_value={"state": "verified"}):
            with patch.object(provision, "validate_archive", side_effect=AssertionError("unexpected")):
                with patch.object(provision.os, "geteuid", return_value=0):
                    with patch.object(provision.platform, "machine", return_value="aarch64"):
                        with patch.object(provision, "run", return_value="Linux"):
                            self.assertEqual(provision.install(Path("unused"))["action"],
                                             "already_installed")

    def test_live_services_and_execstart_must_remain_unchanged(self):
        before = {name: {"state": "active", "exec_start": "/opt/menuminute/node24/bin/node"}
                  for name in provision.SERVICES}
        provision.ensure_services_untouched(before, before)
        altered = dict(before)
        altered["clubkeep-web.service"] = {
            "state": "active", "exec_start": str(provision.DEST) + "/bin/node"}
        with self.assertRaisesRegex(RuntimeError, "changed"):
            provision.ensure_services_untouched(before, altered)
        with self.assertRaisesRegex(RuntimeError, "Phase A is inventory-only"):
            provision.ensure_services_untouched(altered, altered)

    def test_installer_cannot_change_services_or_delete_other_apps(self):
        content = SRC.read_text()
        self.assertIn('filter="data"', content)
        self.assertIn("source.rename(DEST)", content)
        self.assertIn("fcntl.flock", content)
        self.assertIn("sha256(archive) != ARCHIVE_SHA256", content)
        self.assertIn('"clubkeep-redis.service"', content)
        for forbidden in ("systemctl restart", "systemctl stop", "systemctl enable",
                          "os.unlink(", "DATABASE_URL", "DROP DATABASE"):
            self.assertNotIn(forbidden, content)
        self.assertNotIn('shutil.rmtree(Path("/var/www', content)

    def test_github_only_main_and_signed_checksum_is_checked(self):
        workflow = (ROOT / ".github/workflows/shared-node26-foundation.yml").read_text()
        self.assertIn("refs/heads/main", workflow)
        self.assertIn("erp-immutable-production", workflow)
        self.assertIn("gpgv --keyring", workflow)
        self.assertIn("5BE8A3F6C8A5C01D106C0AD820B1A390B168D356", workflow)
        self.assertIn(provision.ARCHIVE_SHA256, workflow)
        self.assertIn("--inventory", workflow)
        self.assertIn("--install --archive", workflow)
        self.assertIn("7fc1d533a0d6c9169521ba323c9ed08aa2e053c4", workflow)
        for forbidden in ("systemctl restart", "systemctl stop", "systemctl disable"):
            self.assertNotIn(forbidden, workflow)


if __name__ == "__main__":
    unittest.main()
