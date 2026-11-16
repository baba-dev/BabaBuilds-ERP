#!/usr/bin/env python3
"""D2 business invariant checks against a *migrated copy* of ERP data.

No SQL writes. Requires a private nonproduction PostgreSQL staging/CI database.
Output is aggregate-only (no customer names, emails or invoice identifiers).
Full field-level parity is performed separately by phase-c-verify.py.
"""
import argparse
from collections import defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ALLOWED = ("bababuilds_erp_staging_", "bababuilds_erp_ci")
ASSET_FIELDS = {
    "Invoice": ["pdfPath"],
    "Expense": ["receiptUrl"],
    "BusinessProfile": ["logoUrl", "signatureUrl"],
}


def pg_env():
    u = urlsplit(os.environ.get("DATABASE_URL", ""))
    db = unquote(u.path.lstrip("/"))
    if not (u.scheme in ("postgres", "postgresql") and
            u.hostname in ("127.0.0.1", "localhost", "::1") and
            (db == ALLOWED[1] or (db.startswith(ALLOWED[0]) and len(db) > len(ALLOWED[0])))):
        raise RuntimeError("PostgreSQL staging/CI loopback only")
    env = dict(os.environ)
    env.update(PGHOST=u.hostname, PGPORT=str(u.port or 5432),
               PGUSER=unquote(u.username or ""), PGPASSWORD=unquote(u.password or ""),
               PGDATABASE=db, PGOPTIONS="-c default_transaction_read_only=on -c search_path=public",
               PGCONNECT_TIMEOUT="5")
    return env, db


def q(s):
    return '"' + s.replace('"', '""') + '"'


def query(env, sql):
    result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
                             "--pset", "pager=off", "-c", sql],
                            env=env, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError("Read-only PostgreSQL query failed (details suppressed)")
    return [json.loads(row) for row in result.stdout.splitlines() if row.strip()]


def rows(env, table, cols):
    cols_sql = ", ".join(q(s) + "::text AS " + q(s) for s in cols)
    return query(env, "SELECT row_to_json(q) FROM (SELECT " + cols_sql
                 + " FROM public." + q(table) + ") q;")


def safe_hash(s):
    return hashlib.sha256(str(s).encode()).hexdigest()[:12]


def num(v):
    try:
        a = Decimal(str(v or 0))
        if not a.is_finite():
            raise ValueError("Nonfinite numeric")
        return a
    except InvalidOperation as exc:
        raise ValueError("Invalid financial decimal") from exc


def financial_invariants(invoices, payments, payroll):
    paid_by_invoice = defaultdict(Decimal)
    payment_ids = set()
    issues = []
    for p in payments:
        if p["id"] in payment_ids:
            issues.append("DUPLICATE_PAYMENT_ID")
        payment_ids.add(p["id"])
        paid_by_invoice[p["invoiceId"]] += num(p["amount"])
    invoices_by_id = {i["id"]: i for i in invoices}
    for p in payments:
        i = invoices_by_id.get(p["invoiceId"])
        if not i:
            issues.append("ORPHAN_PAYMENT")
        elif p["workspaceId"] != i["workspaceId"]:
            issues.append("CROSS_WORKSPACE_PAYMENT")
    for i in invoices:
        actual = paid_by_invoice[i["id"]]
        stored = num(i["amountReceived"])
        if actual != stored:
            # IDs/hashes are not printed. The issue is a count, not PII.
            issues.append("INVOICE_PAYMENT_MISMATCH")
        if stored < 0 or num(i["grandTotal"]) < 0:
            issues.append("NEGATIVE_INVOICE_BALANCE")
        if i.get("status") == "PAID" and stored < num(i["grandTotal"]):
            issues.append("MARKED_PAID_WITH_BALANCE")
    for p in payroll:
        if num(p["totalEarnings"]) - num(p["totalDeductions"]) != num(p["totalNetPay"]):
            issues.append("PAYROLL_NET_MISMATCH")
    result = {issue: issues.count(issue) for issue in sorted(set(issues))}
    return result


def media_issues(env, root):
    issues = defaultdict(int)
    if not root:
        return {"file_refs_not_checked": True}
    root = Path(root).resolve(strict=True)
    for table, columns in ASSET_FIELDS.items():
        for row in rows(env, table, columns):
            for col in columns:
                value = row.get(col)
                if not value:
                    continue
                candidate = str(value)
                if candidate.startswith(("https://", "http://", "data:", "blob:")):
                    issues["external_or_embedded_reference"] += 1
                    continue
                if candidate.startswith("/api/"):
                    issues["api_reference_manual_review"] += 1
                    continue
                relative = candidate.lstrip("/")
                if "\0" in relative or ".." in Path(relative).parts or "\\" in relative:
                    issues["unsafe_media_path"] += 1
                    continue
                locations = [root / "public" / relative, root / "private_uploads" / relative]
                if not any(p.resolve(strict=False).is_relative_to(root) and p.is_file() for p in locations):
                    issues["missing_local_file"] += 1
                else:
                    issues["verified_local_file"] += 1
    return dict(issues)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media-root", help="Private staged app root with copied public and private_uploads")
    parser.add_argument("--output", help="New operator-only JSON evidence file")
    args = parser.parse_args()
    env, db = pg_env()
    invoices = rows(env, "Invoice", ["id", "workspaceId", "amountReceived", "grandTotal", "status"])
    payments = rows(env, "InvoicePayment", ["id", "workspaceId", "invoiceId", "amount"])
    payroll = rows(env, "PayrollRun", ["id", "workspaceId", "totalEarnings", "totalDeductions", "totalNetPay"])
    users = rows(env, "User", ["id"])
    workspace = rows(env, "Workspace", ["id"])
    memberships = rows(env, "WorkspaceUser", ["id", "workspaceId", "userId"])
    user_ids = {u["id"] for u in users}
    ws_ids = {w["id"] for w in workspace}
    issue_counts = financial_invariants(invoices, payments, payroll)
    orphan_memberships = sum(1 for m in memberships if
                             m["userId"] not in user_ids or m["workspaceId"] not in ws_ids)
    if orphan_memberships:
        issue_counts["INVALID_MEMBERSHIP"] = orphan_memberships
    files = media_issues(env, args.media_root)
    if files.get("unsafe_media_path"):
        issue_counts["UNSAFE_MEDIA_PATH"] = files["unsafe_media_path"]
    if files.get("missing_local_file"):
        issue_counts["MISSING_LOCAL_MEDIA"] = files["missing_local_file"]
    report = {
        "status": "FAIL" if issue_counts else "PASS",
        "database": db,
        "counts": {
            "workspaces": len(workspace), "users": len(users),
            "memberships": len(memberships), "invoices": len(invoices),
            "payments": len(payments), "payroll_runs": len(payroll),
        },
        "issue_counts": issue_counts,
        "media": files,
        "note": "Rows compared exactly by phase-c-verify.py; this check validates business invariants.",
    }
    if args.output:
        dest = Path(args.output)
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if dest.exists():
            raise RuntimeError("Refusing to overwrite rehearsal evidence")
        fd = os.open(dest, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w") as file:
            json.dump(report, file, sort_keys=True, indent=2)
            file.write("\n")
    print(json.dumps(report, sort_keys=True))
    if report["status"] != "PASS":
        raise RuntimeError("Financial or identity invariant issues detected; review before cutover")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print("D2 VALIDATION FAILED: " + str(exc), file=sys.stderr)
        sys.exit(1)
