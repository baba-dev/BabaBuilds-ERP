"""Offline unit tests: D1 snapshot semantics, no source SQL mutation."""
from pathlib import Path
import importlib.util
import json
import os
import sqlite3
import tempfile
import unittest

MOD = Path(__file__).resolve().parents[2] / "scripts/staging/snapshot_sqlite.py"
spec = importlib.util.spec_from_file_location("snapshot_sqlite", MOD)
snap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snap)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.srcdir = root / "source"
        self.outdir = root / "protected"
        self.srcdir.mkdir(mode=0o700)
        self.outdir.mkdir(mode=0o700)
        self.src = self.srcdir / "dev.db"
        con = sqlite3.connect(self.src)
        con.execute("PRAGMA journal_mode=WAL")
        for table in ("User", "Workspace", "Invoice", "InvoicePayment"):
            con.execute('CREATE TABLE "' + table + '"(id TEXT PRIMARY KEY, value TEXT)')
        con.execute("INSERT INTO Invoice (id,value) VALUES ('one','123')")
        con.commit()
        con.close()
        self.out = self.outdir / "erp.db"

    def test_consistent_snapshot_and_no_overwrite(self):
        st = self.src.stat()
        snap.main(["--live-sqlite", str(self.src), "--output", str(self.out)])
        self.assertTrue(self.out.exists())
        self.assertEqual(st.st_mtime_ns, self.src.stat().st_mtime_ns)
        manifest = json.loads(Path(str(self.out) + ".manifest.json").read_text())
        self.assertEqual(manifest["status"], "PASS")
        self.assertEqual(manifest["rows"], 1)
        self.assertEqual(os.stat(self.out).st_mode & 0o777, 0o600)
        with self.assertRaisesRegex(RuntimeError, "overwrite"):
            snap.main(["--live-sqlite", str(self.src), "--output", str(self.out)])

    def test_refuse_non_private_output(self):
        self.outdir.chmod(0o755)
        with self.assertRaisesRegex(RuntimeError, "private"):
            snap.main(["--live-sqlite", str(self.src), "--output", str(self.out)])

    def test_foreign_key_constraint_error_removes_snapshot(self):
        con = sqlite3.connect(self.src)
        con.execute("PRAGMA foreign_keys=OFF")
        con.execute("CREATE TABLE Broken(id INT REFERENCES User(id))")
        con.execute("INSERT INTO Broken VALUES (13)")
        con.commit()
        con.close()
        with self.assertRaisesRegex(RuntimeError, "foreign-key"):
            snap.main(["--live-sqlite", str(self.src), "--output", str(self.out)])
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
