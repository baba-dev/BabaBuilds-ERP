#!/usr/bin/env python3
"""Grant least-privileged runtime access AFTER ERP PG baseline migration/import.

Root operator only. Rejects any database other than explicit staging name.
"""
import argparse
import json
import os
import re
import subprocess
import sys

SUFFIX = re.compile(r"^[a-z0-9]{4,12}$")


def grant(suffix):
    if os.geteuid() != 0 or not SUFFIX.fullmatch(suffix):
        raise RuntimeError("Root and valid staging suffix required")
    db = f"bababuilds_erp_staging_{suffix}"
    migrator = f"erp_stg_{suffix}_m"
    runtime = f"erp_stg_{suffix}_r"
    sql = f"""
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS(SELECT FROM pg_class WHERE relname='Invoice' AND relkind='r') THEN
    RAISE EXCEPTION 'Staging baseline not migrated';
  END IF;
  IF NOT EXISTS(SELECT FROM pg_class WHERE relname='_prisma_migrations' AND relkind='r') THEN
    RAISE EXCEPTION 'Missing Prisma migrations';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO "{runtime}";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{runtime}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "{runtime}";
-- Never allow the application to rewrite Prisma migration audit history.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."_prisma_migrations" FROM "{runtime}";
GRANT SELECT ON TABLE public."_prisma_migrations" TO "{runtime}";
REVOKE CREATE ON SCHEMA public FROM "{runtime}";
COMMIT;
"""
    p = subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-X",
                         "-qAt", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", "-"],
                       input=sql, text=True, capture_output=True)
    if p.returncode:
        raise RuntimeError("PostgreSQL runtime privilege grant failed (details suppressed)")
    probe = subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-X", "-qAt",
                            "-d", "postgres", "-c",
                            f"SELECT count(*) FROM pg_database WHERE datname IN ('clubkeep','menuminute') AND has_database_privilege('{runtime}',datname,'CONNECT');"],
                           capture_output=True, text=True)
    if probe.returncode or probe.stdout.strip() != "0":
        raise RuntimeError("Staging runtime role has access to a non-ERP app database")
    print(json.dumps({"status": "PASS", "database": db, "runtime_role": runtime, "least_privilege": True}))


if __name__ == "__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--suffix", required=True)
    try:
        grant(p.parse_args().suffix)
    except (RuntimeError, OSError) as e:
        print("D1 RUNTIME GRANT REFUSED: " + str(e), file=sys.stderr)
        sys.exit(1)
