#!/usr/bin/env python3
"""Read-only, PII-minimized Phase C SQLite/PostgreSQL migration evidence.

Input: a self-contained, offline SQLite backup. Output: hashes, counts, grouped
currency totals and validation verdicts. No raw customer rows or credentials.
PostgreSQL is accessed through psql with default_transaction_read_only=on.
"""
import argparse
import collections
import datetime as dt
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
from urllib.parse import unquote, urlsplit

DATABASE = re.compile(r"^bababuilds_erp_(?:ci|staging(?:_[a-z0-9]+)?|drill(?:_[a-z0-9]+)?)$")
FINANCE = {
    "Invoice": ("subtotal", "taxAmount", "grandTotal", "totalAmount", "amountReceived"),
    "InvoicePayment": ("amount",),
    "Expense": ("amount", "cgstAmount", "sgstAmount", "igstAmount", "cessAmount", "withholdingAmount"),
    "Proposal": ("subtotal", "estimatedTax", "totalAmount"),
    "Retainer": ("amount",),
    "PayrollRun": ("totalEarnings", "totalDeductions", "totalEmployerCosts", "totalNetPay"),
}
DATE_TYPES = ("timestamp", "date")
NUMBER_TYPES = ("numeric", "decimal", "double precision", "real", "integer", "bigint", "smallint")
IDENTITY_TABLES = ("User", "Workspace", "WorkspaceUser", "Session", "Account", "Client", "Invoice", "InvoicePayment")


def quote(value):
    return '"' + value.replace('"', '""') + '"'


def snapshot_path(value):
    p = Path(value).expanduser().resolve(strict=True)
    if not p.is_file() or p == Path("/var/www/bababuilds-erp/prisma/dev.db"):
        raise RuntimeError("Only an existing offline SQLite backup is permitted")
    if Path(str(p) + "-wal").exists() or Path(str(p) + "-shm").exists():
        raise RuntimeError("SQLite snapshot has WAL/SHM sidecars; use sqlite3 .backup first")
    return p


def pg_env(db_name):
    url = urlsplit(os.environ.get("DATABASE_URL", ""))
    database = unquote(url.path.lstrip("/"))
    if (url.scheme not in ("postgres", "postgresql")
            or database != db_name or not DATABASE.fullmatch(database)
            or url.hostname not in ("127.0.0.1", "localhost", "::1")):
        raise RuntimeError("DATABASE_URL must target the exact isolated nonproduction ERP database on loopback")
    env = dict(os.environ)
    env.update(PGHOST=url.hostname, PGPORT=str(url.port or 5432),
               PGUSER=unquote(url.username or ""), PGPASSWORD=unquote(url.password or ""),
               PGDATABASE=database, PGCONNECT_TIMEOUT="5",
               PGOPTIONS="-c default_transaction_read_only=on -c search_path=public")
    return env


def run_pg(env, statement):
    out = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--pset", "pager=off", "-c", statement],
                         env=env, capture_output=True, text=True, timeout=60, check=False)
    if out.returncode:
        raise RuntimeError("PostgreSQL read-only query failed (details suppressed)")
    return out.stdout.strip()


def catalog(env):
    statement = """
SELECT COALESCE(json_agg(json_build_object(
 'table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod)
) ORDER BY c.relname,a.attnum), '[]'::json)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid
WHERE n.nspname='public' AND c.relkind='r'
 AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='';
"""
    out = {}
    for entry in json.loads(run_pg(env, statement)):
        out.setdefault(entry["table"], {})[entry["column"]] = entry["type"]
    return out


def stable_number(value):
    try:
        number = Decimal(str(value))
        if not number.is_finite():
            raise ValueError("Non-finite numeric value")
        if number.is_zero():
            return "0"
        return format(number.normalize(), "f")
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal encoding") from exc


def canonical_json(value):
    if isinstance(value, dict):
        return {key: canonical_json(v) for key, v in sorted(value.items())}
    if isinstance(value, list):
        return [canonical_json(v) for v in value]
    if isinstance(value, (Decimal, float, int)) and not isinstance(value, bool):
        return {"$number": stable_number(value)}
    return value


def canonical(value, type_name):
    if value is None:
        return None
    typ = type_name.lower()
    if typ.startswith(DATE_TYPES):
        if isinstance(value, (int, float)):
            value = dt.datetime.fromtimestamp(value / 1000, tz=dt.timezone.utc)
        elif isinstance(value, str):
            value = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if typ == "boolean":
        if isinstance(value, bool):
            return value
        if str(value).lower() in ("t", "true", "1"):
            return True
        if str(value).lower() in ("f", "false", "0"):
            return False
        raise ValueError("Invalid boolean")
    if typ.startswith(NUMBER_TYPES):
        return stable_number(value)
    if typ in ("json", "jsonb"):
        parsed = json.loads(value, parse_float=Decimal) if isinstance(value, str) else value
        return canonical_json(parsed)
    if typ == "bytea":
        if isinstance(value, bytes):
            return value.hex()
        if str(value).startswith("\\x"):
            return str(value)[2:].lower()
        raise ValueError("Invalid bytea value")
    return str(value)


def table_evidence(rows, types):
    digest = hashlib.sha256()
    encoded = []
    normalized = []
    for row in rows:
        entry = {k: canonical(v, types[k]) for k, v in row.items()}
        normalized.append(entry)
        encoded.append(json.dumps(entry, sort_keys=True, ensure_ascii=False, separators=(",", ":")))
    for line in sorted(encoded):
        digest.update(line.encode("utf-8"))
        digest.update(b"\n")
    return {"count": len(encoded), "sha256": digest.hexdigest()}, normalized


def sqlite_snapshot(path):
    con = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    try:
        con.execute("PRAGMA query_only=ON")
        con.execute("BEGIN")
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite integrity_check failed")
        if con.execute("PRAGMA foreign_key_check").fetchone():
            raise RuntimeError("SQLite foreign_key_check failed")
        names = [x[0] for x in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            if x[0] != "_prisma_migrations"]
        schemas = {
            name: [r[1] for r in con.execute("PRAGMA table_info(" + quote(name) + ")")]
            for name in names
        }
        rows = {}
        for name in names:
            curs = con.execute("SELECT " + ",".join(map(quote, schemas[name])) + " FROM " + quote(name))
            rows[name] = [dict(zip(schemas[name], entry)) for entry in curs]
        return schemas, rows
    finally:
        con.close()


def pg_snapshot(env, names, schemas, types):
    rows = {}
    for name in names:
        projection = ", ".join(quote(col) + "::text AS " + quote(col) for col in schemas[name])
        sql = "SELECT row_to_json(t) FROM (SELECT " + projection + " FROM public." + quote(name) + ") t"
        raw = run_pg(env, sql)
        rows[name] = [json.loads(line) for line in raw.splitlines()] if raw else []
        if rows[name] and set(rows[name][0]) != set(types[name]):
            raise RuntimeError("PostgreSQL row projection differs from expected catalog")
    return rows


def summary(rows, types):
    tables = {}
    normal = {}
    for name in sorted(rows):
        tables[name], normal[name] = table_evidence(rows[name], types[name])
    workspace_currency = {x["id"]: x.get("baseCurrency") or "INR" for x in normal.get("Workspace", [])}
    invoice_currency = {x["id"]: x.get("currency") or workspace_currency.get(x["workspaceId"], "INR")
                        for x in normal.get("Invoice", [])}
    totals = collections.defaultdict(lambda: collections.defaultdict(Decimal))
    for table, amounts in FINANCE.items():
        for row in normal.get(table, []):
            wid = row.get("workspaceId")
            if wid is None:
                raise RuntimeError("Financial row missing workspaceId")
            currency = (invoice_currency.get(row.get("invoiceId"))
                        if table == "InvoicePayment" else row.get("currency"))
            currency = currency or workspace_currency.get(wid) or "UNKNOWN"
            group = table + ":" + hashlib.sha256(wid.encode()).hexdigest()[:16] + ":" + currency
            totals[group]["rows"] += 1
            for amount in amounts:
                if amount in row and row[amount] is not None:
                    totals[group][amount] += Decimal(str(row[amount]))
    return {
        "schema_version": 1,
        "table_count": len(tables),
        "row_count": sum(v["count"] for v in tables.values()),
        "tables": tables,
        "financial": {group: {k: stable_number(v) for k, v in sorted(measures.items())}
                      for group, measures in sorted(totals.items())},
    }


def write_evidence(path, payload):
    if not path:
        return
    target = Path(path).expanduser()
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Never replace evidence from a previous rehearsal.
    descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(payload, stream, sort_keys=True, indent=2)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", required=True, help="Absolute path to an OFFLINE SQLite .backup snapshot")
    parser.add_argument("--target-db", help="Existing pre-migrated isolated ERP PostgreSQL staging/drill/CI DB")
    parser.add_argument("--evidence", help="New local JSON evidence file (0600, must not already exist)")
    args = parser.parse_args()
    snapshot = snapshot_path(args.sqlite)
    sha = hashlib.sha256(snapshot.read_bytes()).hexdigest()
    schemas, src = sqlite_snapshot(snapshot)
    if not args.target_db:
        # Schema types are from the PostgreSQL target and needed to normalize
        # SQLite boolean/date/json/decimal fields correctly.
        raise RuntimeError("--target-db required for type-aware, full-row comparison")
    env = pg_env(args.target_db)
    types = catalog(env)
    missing = set(schemas) - set(types)
    unexpected = set(types) - set(schemas) - {"_prisma_migrations"}
    if missing or unexpected:
        raise RuntimeError("Table catalog mismatch: missing=" + str(len(missing)) +
                           ", unexpected=" + str(len(unexpected)))
    for name, cols in schemas.items():
        if set(cols) != set(types[name]):
            raise RuntimeError("Schema columns differ for table " + name)
    migrations = run_pg(env, 'SELECT count(*) FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL')
    if int(migrations) < 1:
        raise RuntimeError("No applied PostgreSQL baseline migration")
    not_valid = run_pg(env, """
SELECT count(*) FROM pg_constraint c
JOIN pg_namespace n ON n.oid=c.connamespace
WHERE n.nspname='public' AND c.contype='f' AND NOT c.convalidated
""")
    if int(not_valid):
        raise RuntimeError("Unvalidated PostgreSQL foreign key constraints")
    pg = pg_snapshot(env, sorted(schemas), schemas, types)
    expected = summary(src, types)
    actual = summary(pg, types)
    wrong = [table for table in expected["tables"]
             if expected["tables"][table] != actual["tables"][table]]
    finance_ok = expected["financial"] == actual["financial"]
    result = {
        "status": "PASS" if not wrong and finance_ok else "FAIL",
        "sqlite_sha256": sha,
        "database": args.target_db,
        "table_count": expected["table_count"],
        "row_count": expected["row_count"],
        "table_fingerprint_matches": expected["table_count"] - len(wrong),
        "table_mismatches": wrong,
        "financial_parity": "PASS" if finance_ok else "FAIL",
        "expected": expected,
        "actual": actual,
        "pg_migrations_applied": int(migrations),
        "pg_unvalidated_foreign_keys": int(not_valid),
    }
    write_evidence(args.evidence, result)
    print(json.dumps({k: v for k, v in result.items() if k not in ("expected", "actual")},
                     sort_keys=True))
    if result["status"] != "PASS":
        raise RuntimeError("Migration parity failed (PII suppressed)")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, sqlite3.Error, subprocess.TimeoutExpired) as exc:
        print("PHASE C VERIFICATION FAILED: " + str(exc), file=sys.stderr)
        sys.exit(1)
