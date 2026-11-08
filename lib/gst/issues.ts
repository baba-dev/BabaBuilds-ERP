import "server-only";
import { prisma } from "@/lib/prisma";
import { loadGstBooks, loadGstProfile } from "./data";
import { fyBounds, fyStartYear } from "./calendar";
import { isValidGstin, normalizeGstin } from "./gstin";
import { claimDate, expenseTaxable } from "./books";
import { eInvoiceStatus } from "./einvoice";
import { findNumberGaps } from "./gaps";
import { r2 } from "./money";

export type GstIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  code:
    | "BUSINESS_GSTIN_MISSING" | "BUSINESS_GSTIN_INVALID" | "BUSINESS_STATE_MISSING" | "BUSINESS_TURNOVER_MISSING"
    | "CLIENT_STATE_MISSING" | "CLIENT_GSTIN_INVALID" | "CLIENT_STATE_MISMATCH"
    | "INVOICE_SAC_MISSING" | "INVOICE_TAX_MISMATCH" | "EXPORT_WITH_TAX"
    | "EXPENSE_GSTIN_MISSING" | "EXPENSE_GSTIN_INVALID" | "EXPENSE_INVOICE_NO_MISSING" | "EXPENSE_TAX_EXCEEDS" | "EXPENSE_DUPLICATE" | "EXPENSE_HSN_MISSING"
    | "INVOICE_NUMBER_GAP" | "SEZ_NEEDS_GSTIN" | "EINVOICE_OVERDUE" | "EINVOICE_PENDING" | "RULE37_SOON" | "ITC_HELD" | "ITC_CLAIM_DEADLINE";
  scope: "business" | "client" | "invoice" | "expense";
  refId: string | null;
  name: string;
  count: number;
  href: string;
};

export async function getGstIssues(workspaceId: string, asOf = new Date()): Promise<GstIssue[]> {
  const profile = await loadGstProfile(workspaceId);
  const out: GstIssue[] = [];
  const registered = profile.registrationType !== "UNREGISTERED";

  if (registered && !profile.gstin) out.push({ id: "b-gstin", severity: "error", code: "BUSINESS_GSTIN_MISSING", scope: "business", refId: null, name: profile.companyName, count: 1, href: "/tax?tab=setup" });
  else if (profile.gstin && !profile.gstinValid) out.push({ id: "b-gstin-bad", severity: "error", code: "BUSINESS_GSTIN_INVALID", scope: "business", refId: null, name: profile.gstin, count: 1, href: "/tax?tab=setup" });
  if (registered && !profile.stateCode) out.push({ id: "b-state", severity: "error", code: "BUSINESS_STATE_MISSING", scope: "business", refId: null, name: profile.companyName, count: 1, href: "/tax?tab=setup" });
  if (registered && profile.prevTurnover <= 0) out.push({ id: "b-turnover", severity: "info", code: "BUSINESS_TURNOVER_MISSING", scope: "business", refId: null, name: profile.companyName, count: 1, href: "/tax?tab=setup" });
  if (!registered) return out;

  const fy = fyBounds(fyStartYear(asOf));
  const books = await loadGstBooks(profile, fy.start, fy.end);

  const byClient = new Map<string, { name: string; state: number; gstin: number; mismatch: number }>();
  const sacMissing: Array<{ id: string; number: string }> = [];
  const taxMismatch: Array<{ id: string; number: string }> = [];
  const exportTax: Array<{ id: string; number: string }> = [];
  const sezNoGstin: Array<{ id: string; number: string }> = [];
  const einvOverdue: Array<{ id: string; number: string }> = [];
  const einvPending: Array<{ id: string; number: string }> = [];
  for (const inv of books.invoices) {
    if (inv.voided) continue;
    const key = inv.clientId ?? inv.clientName;
    const cur = byClient.get(key) ?? { name: inv.clientName, state: 0, gstin: 0, mismatch: 0 };
    if (inv.issues.includes("STATE_ASSUMED")) cur.state += 1;
    if (inv.issues.includes("GSTIN_INVALID")) cur.gstin += 1;
    if (inv.issues.includes("GSTIN_STATE_MISMATCH")) cur.mismatch += 1;
    byClient.set(key, cur);
    if (inv.issues.includes("SAC_MISSING")) sacMissing.push({ id: inv.id, number: inv.number });
    if (inv.issues.includes("TAX_MISMATCH")) taxMismatch.push({ id: inv.id, number: inv.number });
    if (inv.issues.includes("EXPORT_WITH_TAX")) exportTax.push({ id: inv.id, number: inv.number });
    if (inv.issues.includes("SEZ_NEEDS_GSTIN")) sezNoGstin.push({ id: inv.id, number: inv.number });
    const ei = eInvoiceStatus({ prevTurnover: profile.prevTurnover, invoiceDate: inv.date, supplyType: inv.supplyType, irn: inv.irn, now: asOf });
    if (ei.status === "OVERDUE") einvOverdue.push({ id: inv.id, number: inv.number });
    else if (ei.status === "PENDING") einvPending.push({ id: inv.id, number: inv.number });
  }
  for (const [id, c] of byClient) {
    const href = `/clients${id.length > 20 ? `?client=${id}` : ""}`;
    if (c.state > 0) out.push({ id: `c-state-${id}`, severity: "warning", code: "CLIENT_STATE_MISSING", scope: "client", refId: id, name: c.name, count: c.state, href });
    if (c.gstin > 0) out.push({ id: `c-gstin-${id}`, severity: "error", code: "CLIENT_GSTIN_INVALID", scope: "client", refId: id, name: c.name, count: c.gstin, href });
    if (c.mismatch > 0) out.push({ id: `c-mismatch-${id}`, severity: "warning", code: "CLIENT_STATE_MISMATCH", scope: "client", refId: id, name: c.name, count: c.mismatch, href });
  }
  if (sacMissing.length) out.push({ id: "inv-sac", severity: "warning", code: "INVOICE_SAC_MISSING", scope: "invoice", refId: null, name: sacMissing.slice(0, 3).map((i) => i.number).join(", "), count: sacMissing.length, href: "/income" });
  if (taxMismatch.length) out.push({ id: "inv-tax", severity: "warning", code: "INVOICE_TAX_MISMATCH", scope: "invoice", refId: null, name: taxMismatch.slice(0, 3).map((i) => i.number).join(", "), count: taxMismatch.length, href: "/income" });
  if (exportTax.length) out.push({ id: "inv-exp", severity: "info", code: "EXPORT_WITH_TAX", scope: "invoice", refId: null, name: exportTax.slice(0, 3).map((i) => i.number).join(", "), count: exportTax.length, href: "/income" });

  const many = (list: Array<{ number: string }>) => list.slice(0, 3).map((i) => i.number).join(", ");
  if (sezNoGstin.length) out.push({ id: "inv-sez", severity: "error", code: "SEZ_NEEDS_GSTIN", scope: "invoice", refId: null, name: many(sezNoGstin), count: sezNoGstin.length, href: "/income" });
  if (einvOverdue.length) out.push({ id: "inv-einv-late", severity: "error", code: "EINVOICE_OVERDUE", scope: "invoice", refId: null, name: many(einvOverdue), count: einvOverdue.length, href: "/tax?tab=documents" });
  if (einvPending.length) out.push({ id: "inv-einv", severity: "warning", code: "EINVOICE_PENDING", scope: "invoice", refId: null, name: many(einvPending), count: einvPending.length, href: "/tax?tab=documents" });
  const gaps = findNumberGaps(books.invoices.map((i) => i.number));
  for (const g of gaps) out.push({ id: `gap-${g.prefix}`, severity: "warning", code: "INVOICE_NUMBER_GAP", scope: "invoice", refId: null, name: `${g.prefix}${g.missing.slice(0, 3).join(", ")}`, count: g.missingCount, href: "/income" });

  const nowMs = asOf.getTime();
  const soon = books.expenses.filter((e) => e.itcStatus === "ELIGIBLE" && !e.itcHeld && e.paymentStatus === "UNPAID" && !e.paidAt && (() => { const left = e.date.getTime() + 180 * 86400000 - nowMs; return left > 0 && left <= 30 * 86400000; })());
  if (soon.length) out.push({ id: "rule37", severity: "warning", code: "RULE37_SOON", scope: "expense", refId: null, name: soon.slice(0, 3).map((e) => e.vendor).join(", "), count: soon.length, href: "/expenses" });
  const held = books.expenses.filter((e) => e.itcHeld && (e.itcStatus === "ELIGIBLE" || e.itcStatus === "REVERSE_CHARGE"));
  if (held.length) out.push({ id: "itc-held", severity: "info", code: "ITC_HELD", scope: "expense", refId: null, name: held.slice(0, 3).map((e) => e.vendor).join(", "), count: held.length, href: "/tax?tab=recon" });
  // Credit on a year's bills can be claimed only until 30 November after the year ends.
  const fyEnd = fy.end;
  const deadline = new Date(Date.UTC(fyEnd.getUTCFullYear(), 10, 30, 23, 59, 59));
  const deadlineClose = nowMs <= deadline.getTime() && deadline.getTime() - nowMs <= 45 * 86400000;
  const unclaimed = books.expenses.filter((e) => e.itcHeld && e.date >= fy.start && e.date <= fy.end && claimDate(e) <= fy.end);
  if (deadlineClose && unclaimed.length) out.push({ id: "itc-deadline", severity: "warning", code: "ITC_CLAIM_DEADLINE", scope: "expense", refId: null, name: unclaimed.slice(0, 3).map((e) => e.vendor).join(", "), count: unclaimed.length, href: "/tax?tab=recon" });

  const seen = new Map<string, string>();
  for (const e of books.expenses.filter((x) => x.date >= fy.start && x.date <= fy.end)) {
    const href = "/expenses";
    if (e.itcStatus === "ELIGIBLE" || e.itcStatus === "INELIGIBLE") {
      if (!e.vendorGstin) out.push({ id: `e-gstin-${e.id}`, severity: "error", code: "EXPENSE_GSTIN_MISSING", scope: "expense", refId: e.id, name: e.vendor, count: 1, href });
      else if (!isValidGstin(e.vendorGstin)) out.push({ id: `e-gstin-bad-${e.id}`, severity: "error", code: "EXPENSE_GSTIN_INVALID", scope: "expense", refId: e.id, name: e.vendor, count: 1, href });
      if (!e.vendorInvoiceNo) out.push({ id: `e-inv-${e.id}`, severity: "warning", code: "EXPENSE_INVOICE_NO_MISSING", scope: "expense", refId: e.id, name: e.vendor, count: 1, href });
    }
    if (!e.hsn && e.itcStatus !== "NONE") out.push({ id: `e-hsn-${e.id}`, severity: "info", code: "EXPENSE_HSN_MISSING", scope: "expense", refId: e.id, name: e.vendor, count: 1, href });
    if (expenseTaxable(e) < 0 || r2(e.igst + e.cgst + e.sgst + e.cess) > e.amount) out.push({ id: `e-exceed-${e.id}`, severity: "error", code: "EXPENSE_TAX_EXCEEDS", scope: "expense", refId: e.id, name: e.vendor, count: 1, href });
    if (e.vendorGstin && e.vendorInvoiceNo) {
      const k = `${normalizeGstin(e.vendorGstin)}|${e.vendorInvoiceNo.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
      if (seen.has(k)) out.push({ id: `e-dup-${e.id}`, severity: "error", code: "EXPENSE_DUPLICATE", scope: "expense", refId: e.id, name: e.vendor, count: 1, href });
      else seen.set(k, e.id);
    }
  }
  void prisma;
  const order = { error: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
