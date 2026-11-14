import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { asPeriodKey, resolvePeriod } from "@/lib/expenses/period";
import { expenseWhere } from "@/lib/expenses/queries";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { logActivity } from "@/lib/security/activity-log";

const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** CSV of the current filter (up to 20,000 rows). */
export async function GET(request: Request) {
  const limit = enforceRouteRateLimit({ request, route: "/api/expenses/export", scope: "expense-export", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;
  const sp = new URL(request.url).searchParams;
  const status = sp.get("status");
  const receipt = sp.get("receipt");
  const itc = sp.get("itc");
  const where = expenseWhere(ctx.workspaceId, {
    q: sp.get("q") ?? undefined, category: sp.get("category") ?? undefined,
    status: status === "paid" || status === "unpaid" ? status : undefined, receipt: receipt === "with" || receipt === "without" ? receipt : undefined, itc: itc === "eligible" || itc === "blocked" ? itc : undefined,
    range: resolvePeriod(asPeriodKey(sp.get("period") ?? "all"), ctx.countryCode, new Date(), { from: sp.get("from"), to: sp.get("to") }),
  });
  try {
    const rows = await prisma.expense.findMany({ where, orderBy: { date: "desc" }, take: 20000 });
    const head = ["Date", "Vendor", "Category", "Amount", "Description", "Supplier invoice", "Supplier GSTIN", "GST rate", "IGST", "CGST", "SGST", "Credit status", "Payment status", "Paid on", "Receipt"];
    const lines = [head.join(",")].concat(rows.map((r) => [r.date.toISOString().slice(0, 10), r.vendor, r.category, Number(r.amount).toFixed(2), r.description, r.vendorInvoiceNo, r.vendorGstin, r.gstRate, Number(r.igstAmount).toFixed(2), Number(r.cgstAmount).toFixed(2), Number(r.sgstAmount).toFixed(2), r.itcStatus, r.paymentStatus, r.paidAt ? r.paidAt.toISOString().slice(0, 10) : "", r.receiptUrl ? "yes" : "no"].map(cell).join(",")));
    void logActivity({ action: "expense_exported", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "expense", id: "export" }, metadata: { rows: rows.length }, request });
    return new NextResponse("﻿" + lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Expense export failed:", error);
    return expenseError(500, "EXPENSE_EXPORT_FAILED", "Failed to export expenses");
  }
}
