import "server-only";
import { prisma } from "@/lib/prisma";
import { loadGstBooks, loadGstProfile, monthKeyOf, type GstBooks, type GstProfile } from "./data";
import {
  daysLate,
  effectiveDueDate,
  fyBounds,
  fyLabel,
  fyStartYear,
  monthsOfPeriod,
  obligationsForFy,
  obligationStatus,
  parseFyLabel,
  periodRange,
  parseQuarterKey,
  trackingStart,
  quarterKey,
  monthKey,
  type Obligation,
  type ObligationStatus,
} from "./calendar";
import { buildGstr1, gstr1PortalJson, type Gstr1Report } from "./gstr1";
import { buildBooks, mergeBooks, type PeriodBooks } from "./books";
import { buildLedger, type Gstr3bReport } from "./gstr3b";
import { buildGstr9, type Gstr9Inputs, type Gstr9Report } from "./gstr9";
import { estimateInterest, estimateLateFee } from "./fees";
import { GST_RULES, type ReturnType } from "./rules";
import { r2, totalTax, zeroHeads, type TaxHeads } from "./money";
import { reconcileGstr2b, type Gstr2bRow } from "./recon";
import { num } from "./money";

export type Unit = { key: string; start: Date; end: Date; gstr1: Gstr1Report; books: PeriodBooks; gstr3b: Gstr3bReport };

const utc = (y: number, m0: number, d: number, end = false) => (end ? new Date(Date.UTC(y, m0, d, 23, 59, 59, 999)) : new Date(Date.UTC(y, m0, d)));

/** Filing-period units (months, or quarters under QRMP) between two financial years, inclusive. */
export function unitRanges(profile: Pick<GstProfile, "filingFrequency">, fromFy: number, toFy: number) {
  const out: Array<{ key: string; start: Date; end: Date }> = [];
  for (let fy = fromFy; fy <= toFy; fy += 1) {
    if (profile.filingFrequency === "QRMP") {
      for (const q of [1, 2, 3, 4] as const) {
        const r = parseQuarterKey(quarterKey(fy, q))!;
        out.push({ key: quarterKey(fy, q), start: r.start, end: r.end });
      }
    } else {
      for (let i = 0; i < 12; i += 1) {
        const m0 = (3 + i) % 12;
        const y = m0 >= 3 ? fy : fy + 1;
        out.push({ key: monthKey(y, m0), start: utc(y, m0, 1), end: utc(y, m0 + 1, 0, true) });
      }
    }
  }
  return out;
}

export function buildUnits(profile: GstProfile, books: GstBooks, ranges: Array<{ key: string; start: Date; end: Date }>): Unit[] {
  const unitBooks = ranges.map((r) => {
    const gstr1 = buildGstr1({ periodKey: r.key, start: r.start, end: r.end, invoices: books.invoices, creditNotes: books.creditNotes, prevTurnover: profile.prevTurnover });
    const months = new Set(monthsOfPeriod(r.key));
    const expenses = books.expenses.filter((e) => e.date >= r.start && e.date <= r.end);
    const adjustments = books.adjustments.filter((a) => months.has(a.periodKey));
    return { r, gstr1, books: buildBooks({ gstr1, expenses, adjustments }) };
  });
  const ledger = buildLedger(unitBooks.map((u) => ({ key: u.r.key, books: u.books })));
  return unitBooks.map((u, i) => ({ key: u.r.key, start: u.r.start, end: u.r.end, gstr1: u.gstr1, books: u.books, gstr3b: ledger[i] }));
}

/** Compute units for a financial year with the credit ledger carried in from up to two prior years. */
export async function computeFyUnits(profile: GstProfile, fy: number): Promise<{ units: Unit[]; books: GstBooks; fyUnits: Unit[] }> {
  const first = fy - 2;
  const books = await loadGstBooks(profile, fyBounds(first).start, fyBounds(fy).end);
  const units = buildUnits(profile, books, unitRanges(profile, first, fy));
  const per = profile.filingFrequency === "QRMP" ? 4 : 12;
  return { units, books, fyUnits: units.slice(-per) };
}

const headsTotal = (h: TaxHeads) => totalTax(h);

export type FilingRow = {
  returnType: string;
  periodKey: string;
  status: string;
  extendedDueDate: Date | null;
  filedAt: Date | null;
  arn: string | null;
  isNil: boolean;
  lateFeePaid: number;
  interestPaid: number;
  notes: string | null;
};

export async function loadFilings(workspaceId: string): Promise<FilingRow[]> {
  const rows = await prisma.gstReturn.findMany({ where: { workspaceId } });
  return rows.map((r) => ({
    returnType: r.returnType,
    periodKey: r.periodKey,
    status: r.status,
    extendedDueDate: r.extendedDueDate,
    filedAt: r.filedAt,
    arn: r.arn,
    isNil: r.isNil,
    lateFeePaid: num(r.lateFeePaid),
    interestPaid: num(r.interestPaid),
    notes: r.notes,
  }));
}

export type ObligationView = {
  returnType: ReturnType;
  periodKey: string;
  label: string;
  optional: boolean;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  extendedDueDate: string | null;
  status: ObligationStatus;
  daysLate: number;
  lateFeeEstimate: number;
  filing: Omit<FilingRow, "returnType" | "periodKey" | "status" | "extendedDueDate"> | null;
  /** Headline numbers for the period (output tax / net payable), where we can compute them. */
  figures: { outputTax: number; itcUsed: number; cashPayable: number; taxable: number; invoiceCount: number } | null;
};

function figuresFor(units: Unit[], o: Obligation) {
  if (o.returnType !== "GSTR1" && o.returnType !== "GSTR3B") return null;
  const unit = units.find((u) => u.key === o.periodKey);
  if (!unit) return null;
  const p = unit.gstr3b.payment;
  return {
    outputTax: headsTotal(p.liability),
    itcUsed: headsTotal(p.itcUsed),
    cashPayable: p.cashTotal,
    taxable: unit.gstr1.summary.taxable,
    invoiceCount: unit.gstr1.summary.invoiceCount,
  };
}

export function prepareObligations(profile: GstProfile, fy: number, units: Unit[], filings: FilingRow[], now = new Date(), firstInvoice: Date | null = null): ObligationView[] {
  const trackFrom = trackingStart(profile, firstInvoice, now);
  const turnover = fyUnitsTurnover(units);
  const list = obligationsForFy(fy, profile, { gstr9Optional: turnover <= GST_RULES.gstr9OptionalUpTo && profile.prevTurnover <= GST_RULES.gstr9OptionalUpTo, gstr9cRequired: Math.max(turnover, profile.prevTurnover) > GST_RULES.gstr9cAbove });
  return list.filter((o) => o.periodEnd.getTime() >= trackFrom.getTime() || filings.some((f) => f.returnType === o.returnType && f.periodKey === o.periodKey)).map((o) => {
    const row = filings.find((f) => f.returnType === o.returnType && f.periodKey === o.periodKey) ?? null;
    const status = obligationStatus(o, row, now);
    const due = effectiveDueDate(o, row?.extendedDueDate);
    const asOf = row?.filedAt ?? now;
    const late = status === "FILED" || status === "OVERDUE" ? daysLate(due, asOf) : 0;
    const figures = figuresFor(units, o);
    const isNil = row?.isNil ?? (figures ? figures.invoiceCount === 0 : false);
    return {
      returnType: o.returnType,
      periodKey: o.periodKey,
      label: o.label,
      optional: o.optional,
      periodStart: o.periodStart.toISOString(),
      periodEnd: o.periodEnd.toISOString(),
      dueDate: o.dueDate.toISOString(),
      extendedDueDate: row?.extendedDueDate?.toISOString() ?? null,
      status,
      daysLate: late,
      lateFeeEstimate: late > 0 ? estimateLateFee({ returnType: o.returnType, daysLate: late, isNil, prevTurnover: profile.prevTurnover, annualTurnover: turnover }) : 0,
      filing: row ? { filedAt: row.filedAt, arn: row.arn, isNil: row.isNil, lateFeePaid: row.lateFeePaid, interestPaid: row.interestPaid, notes: row.notes } : null,
      figures,
    };
  });
}

function fyUnitsTurnover(units: Unit[]): number {
  return r2(units.reduce((s, u) => s + u.gstr1.summary.taxable + u.books.nilExempt, 0));
}

export type GstOverview = {
  fy: string;
  fyStart: number;
  profile: {
    gstin: string | null; gstinValid: boolean; stateCode: string | null; registrationType: string; filingFrequency: string;
    prevTurnover: number; companyName: string; lutActive: boolean; countryCode: string;
  };
  obligations: ObligationView[];
  kpis: {
    outputTaxYtd: number; itcClaimedYtd: number; cashPaidYtd: number; itcBalance: HeadsView; nextDue: { label: string; periodKey: string; dueDate: string } | null;
    overdue: number; filed: number; total: number; turnover: number;
  };
  trend: Array<{ key: string; outputTax: number; itc: number; cash: number }>;
};
type HeadsView = TaxHeads & { total: number };

export async function getGstOverview(workspaceId: string, fy?: number): Promise<GstOverview> {
  const profile = await loadGstProfile(workspaceId);
  const startYear = fy ?? fyStartYear(new Date());
  const [{ fyUnits, units, books }, filings] = await Promise.all([computeFyUnits(profile, startYear), loadFilings(workspaceId)]);
  const firstInvoice = books.invoices.reduce<Date | null>((min, i) => (min === null || i.date < min ? i.date : min), null);
  const obligations = prepareObligations(profile, startYear, fyUnits, filings, new Date(), firstInvoice);
  const now = new Date();
  const pastUnits = fyUnits.filter((u) => u.end.getTime() <= now.getTime() || u.gstr1.summary.invoiceCount > 0);
  const last = [...units].reverse().find((u) => u.start.getTime() <= now.getTime()) ?? units[units.length - 1];
  const closing = last?.gstr3b.payment.closingItc ?? zeroHeads();
  const required = obligations.filter((o) => !o.optional);
  const upcoming = required.filter((o) => o.status !== "FILED").sort((a, b) => (a.extendedDueDate ?? a.dueDate).localeCompare(b.extendedDueDate ?? b.dueDate))[0];
  return {
    fy: fyLabel(startYear),
    fyStart: startYear,
    profile: {
      gstin: profile.gstin, gstinValid: profile.gstinValid, stateCode: profile.stateCode, registrationType: profile.registrationType,
      filingFrequency: profile.filingFrequency, prevTurnover: profile.prevTurnover, companyName: profile.companyName, lutActive: profile.lutActive, countryCode: profile.countryCode,
    },
    obligations,
    kpis: {
      outputTaxYtd: r2(pastUnits.reduce((s, u) => s + headsTotal(u.gstr3b.payment.liability), 0)),
      itcClaimedYtd: r2(pastUnits.reduce((s, u) => s + headsTotal(u.gstr3b.s4.c), 0)),
      cashPaidYtd: r2(pastUnits.reduce((s, u) => s + u.gstr3b.payment.cashTotal, 0)),
      itcBalance: { ...closing, total: headsTotal(closing) },
      nextDue: upcoming ? { label: upcoming.label, periodKey: upcoming.periodKey, dueDate: upcoming.extendedDueDate ?? upcoming.dueDate } : null,
      overdue: required.filter((o) => o.status === "OVERDUE").length,
      filed: required.filter((o) => o.status === "FILED").length,
      total: required.length,
      turnover: fyUnitsTurnover(fyUnits),
    },
    trend: fyUnits.map((u) => ({ key: u.key, outputTax: headsTotal(u.gstr3b.payment.liability), itc: headsTotal(u.gstr3b.s4.c), cash: u.gstr3b.payment.cashTotal })),
  };
}

export async function getUnit(workspaceId: string, periodKey: string): Promise<{ profile: GstProfile; unit: Unit | null; units: Unit[] }> {
  const profile = await loadGstProfile(workspaceId);
  const range = periodRange(periodKey);
  if (!range) return { profile, unit: null, units: [] };
  const { units } = await computeFyUnits(profile, fyStartYear(range.start));
  return { profile, unit: units.find((u) => u.key === periodKey) ?? null, units };
}

export function gstr1Export(profile: GstProfile, unit: Unit) {
  return gstr1PortalJson(unit.gstr1, profile.gstin ?? "");
}

export async function getGstr9(workspaceId: string, fy: number): Promise<{ profile: GstProfile; report: Gstr9Report; inputs: Gstr9Inputs; filing: FilingRow | null; drift: Array<{ returnType: string; periodKey: string; filedTax: number; currentTax: number }> }> {
  const profile = await loadGstProfile(workspaceId);
  const { fyUnits, books } = await computeFyUnits(profile, fy);
  const stored = await prisma.gstReturn.findUnique({ where: { workspaceId_returnType_periodKey: { workspaceId, returnType: "GSTR9", periodKey: fyLabel(fy) } } });
  const inputs = ((stored?.inputsJson as Gstr9Inputs | null) ?? {}) as Gstr9Inputs;
  const range = fyBounds(fy);
  const twoB = await prisma.gstr2bEntry.findMany({ where: { workspaceId, periodKey: { in: monthsOfPeriod(fyLabel(fy)) }, itcAvailable: true } });
  const twoBTotals = twoB.reduce<TaxHeads>((a, e) => ({ igst: r2(a.igst + num(e.igst)), cgst: r2(a.cgst + num(e.cgst)), sgst: r2(a.sgst + num(e.sgst)), cess: r2(a.cess + num(e.cess)) }), zeroHeads());
  const fyExpenses = books.expenses.filter((e) => e.date >= range.start && e.date <= range.end);
  const merged = mergeBooks(fyUnits.map((u) => u.books));
  const booksTurnover = r2(fyUnits.reduce((s, u) => s + u.gstr1.summary.taxable + u.books.nilExempt, 0));
  const turnover = booksTurnover;
  const now = new Date();
  const due = new Date(Date.UTC(fy + 1, 11, 31));
  const late = daysLate(stored?.extendedDueDate && stored.extendedDueDate > due ? stored.extendedDueDate : due, stored?.filedAt ?? now);
  const report = buildGstr9({
    fy: fyLabel(fy),
    monthly: fyUnits.map((u) => u.gstr1),
    books: merged,
    ledger: fyUnits.map((u) => u.gstr3b),
    expenses: fyExpenses,
    twoBTotals,
    inputs,
    prevTurnover: profile.prevTurnover,
    booksTurnover,
    lateFeeEstimate: estimateLateFee({ returnType: "GSTR9", daysLate: late, isNil: false, prevTurnover: profile.prevTurnover, annualTurnover: turnover }),
  });

  const filings = await loadFilings(workspaceId);
  const drift: Array<{ returnType: string; periodKey: string; filedTax: number; currentTax: number }> = [];
  for (const f of filings) {
    if (f.status !== "FILED" || f.returnType !== "GSTR3B") continue;
    const unit = fyUnits.find((u) => u.key === f.periodKey);
    const row = await prisma.gstReturn.findUnique({ where: { workspaceId_returnType_periodKey: { workspaceId, returnType: f.returnType, periodKey: f.periodKey } }, select: { snapshotJson: true } });
    const snap = row?.snapshotJson as { liability?: number } | null;
    if (unit && snap && typeof snap.liability === "number") {
      const current = headsTotal(unit.gstr3b.payment.liability);
      if (Math.abs(current - snap.liability) > 1) drift.push({ returnType: f.returnType, periodKey: f.periodKey, filedTax: snap.liability, currentTax: current });
    }
  }
  return { profile, report, inputs, filing: filings.find((f) => f.returnType === "GSTR9" && f.periodKey === fyLabel(fy)) ?? null, drift };
}

export async function getRecon(workspaceId: string, periodKey: string) {
  const profile = await loadGstProfile(workspaceId);
  const range = periodRange(periodKey);
  if (!range) return null;
  const books = await loadGstBooks(profile, range.start, range.end);
  const entries = await prisma.gstr2bEntry.findMany({ where: { workspaceId, periodKey } });
  const rows: Gstr2bRow[] = entries.map((e) => ({
    supplierGstin: e.supplierGstin, supplierName: e.supplierName, invoiceNumber: e.invoiceNumber, invoiceDate: e.invoiceDate,
    taxableValue: num(e.taxableValue), igst: num(e.igst), cgst: num(e.cgst), sgst: num(e.sgst), cess: num(e.cess), itcAvailable: e.itcAvailable, reverseCharge: e.reverseCharge,
  }));
  return { profile, uploaded: entries.length, ...reconcileGstr2b(rows, books.expenses) };
}

export { estimateInterest, monthKeyOf, parseFyLabel };
