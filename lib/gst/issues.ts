import "server-only";
import { prisma } from "@/lib/prisma";
import { loadGstBooks, loadGstProfile } from "./data";
import { fyBounds, fyStartYear } from "./calendar";
import { isValidGstin, normalizeGstin } from "./gstin";
import { expenseTaxable } from "./books";
import { r2 } from "./money";

export type GstIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  code:
    | "BUSINESS_GSTIN_MISSING" | "BUSINESS_GSTIN_INVALID" | "BUSINESS_STATE_MISSING" | "BUSINESS_TURNOVER_MISSING"
    | "CLIENT_STATE_MISSING" | "CLIENT_GSTIN_INVALID" | "CLIENT_STATE_MISMATCH"
    | "INVOICE_SAC_MISSING" | "INVOICE_TAX_MISMATCH" | "EXPORT_WITH_TAX"
    | "EXPENSE_GSTIN_MISSING" | "EXPENSE_GSTIN_INVALID" | "EXPENSE_INVOICE_NO_MISSING" | "EXPENSE_TAX_EXCEEDS" | "EXPENSE_DUPLICATE" | "EXPENSE_HSN_MISSING";
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

  const seen = new Map<string, string>();
  for (const e of books.expenses) {
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
