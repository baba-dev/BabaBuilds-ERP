import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "erp_sqlite_retirement", ROOT / "scripts/operations/retire_erp_sqlite.py")
retire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retire)

class RetireSqliteTests(unittest.TestCase):
    def test_remove_only_legacy_db_keys_and_preserve_production_secrets(self):
        before = (
            'DATABASE_URL="file:./dev.db"\n'
            'NEXTAUTH_SECRET=private_value\n'
            'SQLITE_CACHE_ROOT="/tmp/obsolete"\n'
            'DB_PROVIDER=sqlite\n'
            'NEXTAUTH_URL=https://erp.example.test\n'
        )
        after, count = retire.clean_env_text(before)
        self.assertEqual(count, 3)
        self.assertNotIn('dev.db', after)
        self.assertNotIn('SQLITE_CACHE_ROOT', after)
        self.assertIn('NEXTAUTH_SECRET=private_value', after)
        self.assertIn('NEXTAUTH_URL=https://erp.example.test', after)

    def test_postgres_url_is_not_removed(self):
        before = 'DATABASE_URL="postgresql://user:secret@localhost:5432/bababuilds_erp"\n'
        self.assertEqual(retire.clean_env_text(before), (before, 0))

    def test_comments_and_nonlegacy_settings_survive(self):
        before = '# DATABASE_URL=file:./dev.db\nOTHER_KEY=ok\n'
        self.assertEqual(retire.clean_env_text(before), (before, 0))

if __name__ == "__main__":
    unittest.main()
