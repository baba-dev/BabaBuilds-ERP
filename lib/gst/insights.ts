import "server-only";
import { prisma } from "@/lib/prisma";
import { loadGstProfile, type GstProfile } from "./data";
export { exposureOf, type GstExposure } from "./exposure";
import { buildUnits, computeFyUnits, loadFilings, prepareObligations, unitRanges, type Unit } from "./service";
import { fyBounds, fyStartYear, parseFyLabel } from "./calendar";
import { eInvoiceStatus, needsEInvoice } from "./einvoice";
import { needsEway } from "./eway";
import { findNumberGaps } from "./gaps";
import { invoicesForPeriod } from "./gstr1";
import { totalTax, r2 } from "./money";
import type { ExpenseGstInput } from "./books";

export type CashOutflow = { id: string; periodKey: string; dueDate: Date; amount: number; label: string; estimated: boolean };

/** Cash GST the business will have to pay on each GSTR-3B (or PMT-06) due in the window; feeds the cash-flow forecast. */
export async function getGstCashOutflows(workspaceId: string, start: Date, end: Date): Promise<CashOutflow[]> {
  const profile = await loadGstProfile(workspaceId);
  if (profile.countryCode !== "IN" || profile.registrationType !== "REGULAR") return [];
  const out: CashOutflow[] = [];
  const filings = await loadFilings(workspaceId);
  const now = new Date();
  for (let fy = fyStartYear(start) - 1; fy <= fyStartYear(end); fy += 1) {
    const { fyUnits, books } = await computeFyUnits(profile, fy);
    const firstInvoice = books.invoices.reduce<Date | null>((min, i) => (min === null || i.date < min ? i.date : min), null);
    for (const o of prepareObligations(profile, fy, fyUnits, filings, now, firstInvoice)) {
      if (o.returnType !== "GSTR3B" || o.status === "FILED" || !o.figures || o.figures.cashPayable <= 0) continue;
      const due = new Date(o.extendedDueDate ?? o.dueDate);
      if (due < start || due > end) continue;
      out.push({ id: `gst-${o.periodKey}`, periodKey: o.periodKey, dueDate: due, amount: o.figures.cashPayable, label: `GSTR-3B ${o.periodKey}`, estimated: new Date(o.periodEnd) > now });
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export type WhatIfInput = { periodKey: string; amount: number; rate: number; interState: boolean; itcStatus: "ELIGIBLE" | "REVERSE_CHARGE" };

/** Re-runs a period with one extra purchase to show how it changes the cash GST payable. */
export async function runWhatIf(workspaceId: string, input: WhatIfInput) {
  const profile = await loadGstProfile(workspaceId);
  const probe = await computeUnitContaining(profile, input.periodKey);
  if (!probe) return null;
  const { base, books, ranges } = probe;
  const reverse = input.itcStatus === "REVERSE_CHARGE";
  const tax = reverse ? r2((input.amount * input.rate) / 100) : r2((input.amount * input.rate) / (100 + input.rate));
  const synthetic: ExpenseGstInput = {
    id: "what-if", date: base.start, vendor: "What-if", vendorGstin: null, vendorInvoiceNo: null, vendorStateCode: null, category: "What-if", hsn: "", rate: input.rate,
    amount: reverse ? input.amount : input.amount, igst: input.interState ? tax : 0, cgst: input.interState ? 0 : r2(tax / 2), sgst: input.interState ? 0 : r2(tax - r2(tax / 2)), cess: 0, itcStatus: input.itcStatus,
  };
  const alt = buildUnits(profile, { ...books, expenses: [...books.expenses, synthetic] }, ranges);
  const after = alt.find((u) => u.key === input.periodKey);
  if (!after) return null;
  return {
    periodKey: input.periodKey,
    before: { cash: base.gstr3b.payment.cashTotal, itcUsed: totalTax(base.gstr3b.payment.itcUsed), closingItc: totalTax(base.gstr3b.payment.closingItc) },
    after: { cash: after.gstr3b.payment.cashTotal, itcUsed: totalTax(after.gstr3b.payment.itcUsed), closingItc: totalTax(after.gstr3b.payment.closingItc) },
    itcAdded: tax,
    cashChange: r2(after.gstr3b.payment.cashTotal - base.gstr3b.payment.cashTotal),
  };
}

async function computeUnitContaining(profile: GstProfile, periodKey: string) {
  const year = /^(\d{4})-(\d{2})$/.exec(periodKey);
  const q = /^(\d{4})-Q([1-4])$/.exec(periodKey);
  let fy: number | null = null;
  if (year) { const m = Number(year[2]); fy = m >= 4 ? Number(year[1]) : Number(year[1]) - 1; }
  else if (q) fy = Number(q[1]);
  if (fy === null) return null;
  const { units, books } = await computeFyUnits(profile, fy);
  const base = units.find((u) => u.key === periodKey);
  if (!base) return null;
  const first = fy - 2;
  return { base: base as Unit, fy, books, ranges: unitRanges(profile, first, fy) };
}

export type EInvoiceRow = { id: string; number: string; date: string; party: string; gstin: string | null; value: number; supplyType: string; status: string; dueBy: string | null; daysLeft: number | null; irn: string | null; ewayBillNo: string | null; ewayNeeded: boolean };

/** Invoices that need an IRN (and e-way bills) with their reporting status, for the Documents tab. */
export async function getEInvoiceRegister(workspaceId: string, fyLabel: string) {
  const profile = await loadGstProfile(workspaceId);
  const fy = parseFyLabel(fyLabel) ?? fyStartYear(new Date());
  const { start, end } = fyBounds(fy);
  const { books } = await computeFyUnits(profile, fy);
  const { included } = invoicesForPeriod(books.invoices, start, end);
  const now = new Date();
  const rows: EInvoiceRow[] = [];
  for (const i of included) {
    const st = eInvoiceStatus({ prevTurnover: profile.prevTurnover, invoiceDate: i.date, supplyType: i.supplyType, irn: i.irn, now });
    const eway = needsEway(i);
    if (st.status === "NOT_REQUIRED" && !eway) continue;
    rows.push({ id: i.id, number: i.number, date: i.date.toISOString().slice(0, 10), party: i.clientName, gstin: i.gstin, value: i.value, supplyType: i.supplyType, status: st.status, dueBy: st.dueBy?.toISOString().slice(0, 10) ?? null, daysLeft: st.daysLeft, irn: i.irn, ewayBillNo: i.ewayBillNo, ewayNeeded: eway });
  }
  const required = needsEInvoice(profile.prevTurnover, "B2B");
  return { required, prevTurnover: profile.prevTurnover, rows: rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300), pending: rows.filter((r) => r.status === "PENDING" || r.status === "OVERDUE").length, overdue: rows.filter((r) => r.status === "OVERDUE").length };
}

/** Invoice-number gaps for the year, ignoring numbers that were issued and cancelled (those are accounted for). */
export async function getInvoiceGaps(workspaceId: string, asOf = new Date()) {
  const { start, end } = fyBounds(fyStartYear(asOf));
  const invoices = await prisma.invoice.findMany({ where: { workspaceId, invoiceDate: { gte: start, lte: end } }, select: { invoiceNumber: true } });
  return findNumberGaps(invoices.map((i) => i.invoiceNumber));
}
