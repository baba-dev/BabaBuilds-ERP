import "server-only";
import { prisma } from "@/lib/prisma";
import { loadGstBooks, loadGstProfile, type GstProfile } from "@/lib/gst/data";
import { num, r2 } from "@/lib/gst/money";
import { buildCaCalendar, calendarProgress, type CaFlags, type CaItemView, type CaProgress, type CaSetup, type EntityType, type GstObligationLike, type Presumptive, type StoredItem, type TaxRegime } from "./calendar";
import { fyBounds, fyLabel, fyOptions, monthsElapsedInFy } from "./fy";
import { gstRegistrationHint, presumptiveView, type GstRegistrationHint, type PresumptiveView } from "./presumptive";
import { buildReadiness, type Readiness, type ReadinessCounts } from "./readiness";
import { estimateYearTax, EMPTY_FIGURES, type TaxEstimate, type YearFigures } from "./summary";
import { prepareObligations, computeFyUnits, loadFilings, loadCommentCounts } from "@/lib/gst/service";

const ENTITY: readonly string[] = ["PROPRIETOR", "PARTNERSHIP", "LLP", "COMPANY", "OTHER"];

export async function loadCaSetup(workspaceId: string): Promise<{ setup: CaSetup; configured: boolean; panNumber: string | null }> {
  const p = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: { caEntityType: true, caTaxRegime: true, caPresumptive: true, caTaxAuditApplicable: true, caTan: true, caSetupAt: true, panNumber: true },
  });
  const entity = p?.caEntityType && ENTITY.includes(p.caEntityType) ? (p.caEntityType as EntityType) : null;
  const presumptive: Presumptive = p?.caPresumptive === "SEC_44ADA" || p?.caPresumptive === "SEC_44AD" ? p.caPresumptive : "NONE";
  return {
    setup: { entityType: entity, taxRegime: p?.caTaxRegime === "OLD" ? "OLD" : p?.caTaxRegime === "NEW" ? ("NEW" as TaxRegime) : null, presumptive, taxAuditApplicable: p?.caTaxAuditApplicable ?? false, tan: p?.caTan ?? null },
    configured: !!p?.caSetupAt && !!entity,
    panNumber: p?.panNumber ?? null,
  };
}

export async function loadFlags(workspaceId: string, start: Date, end: Date, now: Date = new Date()): Promise<CaFlags> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [employees, tds, firstPayroll, firstTds] = await Promise.all([
    prisma.employee.count({ where: { workspaceId, status: "ACTIVE" } }),
    prisma.withholdingEvent.count({ where: { workspaceId, sourceType: { not: "INVOICE_PAYMENT" }, deductedAt: { gte: start, lte: end } } }),
    prisma.payrollPeriod.findFirst({ where: { workspaceId }, orderBy: { startDate: "asc" }, select: { startDate: true } }),
    prisma.withholdingEvent.findFirst({ where: { workspaceId, sourceType: { not: "INVOICE_PAYMENT" } }, orderBy: { deductedAt: "asc" }, select: { deductedAt: true } }),
  ]);
  return { hasEmployees: employees > 0, hasTds: tds > 0, payrollSince: firstPayroll?.startDate ?? monthStart, tdsSince: firstTds?.deductedAt ?? monthStart };
}

export async function loadYearFigures(workspaceId: string, startYear: number): Promise<YearFigures> {
  const { start, end } = fyBounds(startYear);
  const [invoices, notes, expenses, payments, wh, payroll] = await Promise.all([
    prisma.invoice.findMany({ where: { workspaceId, status: { not: "VOID" }, invoiceDate: { gte: start, lte: end } }, select: { subtotal: true, grandTotal: true, totalAmount: true, taxAmount: true, exchangeRate: true } }),
    prisma.creditNote.findMany({ where: { workspaceId, issuedAt: { gte: start, lte: end }, invoice: { invoiceDate: { lt: start } } }, select: { amount: true, taxAmount: true, invoice: { select: { exchangeRate: true } } } }),
    prisma.expense.findMany({ where: { workspaceId, date: { gte: start, lte: end } }, select: { amount: true, itcStatus: true, igstAmount: true, cgstAmount: true, sgstAmount: true, cessAmount: true } }),
    prisma.invoicePayment.findMany({ where: { workspaceId, receivedAt: { gte: start, lte: end }, invoice: { status: { not: "VOID" } } }, select: { amount: true, invoice: { select: { subtotal: true, grandTotal: true, totalAmount: true, taxAmount: true, exchangeRate: true } } } }),
    prisma.withholdingEvent.findMany({ where: { workspaceId, deductedAt: { gte: start, lte: end } }, select: { sourceType: true, withheldAmount: true, depositedAt: true } }),
    prisma.payrollRun.aggregate({ where: { workspaceId, status: "POSTED", period: { startDate: { gte: start, lte: end } } }, _sum: { totalEarnings: true, totalEmployerCosts: true } }),
  ]);
  const ex = (i: { exchangeRate: unknown }) => num(i.exchangeRate) || 1;
  const totalOf = (i: { grandTotal: unknown; totalAmount: unknown }) => (num(i.grandTotal) > 0 ? num(i.grandTotal) : num(i.totalAmount));
  const taxableOf = (i: { subtotal: unknown; grandTotal: unknown; totalAmount: unknown; taxAmount: unknown }) => (num(i.subtotal) > 0 ? num(i.subtotal) : Math.max(0, totalOf(i) - num(i.taxAmount)));

  let billed = 0;
  for (const i of invoices) billed += taxableOf(i) * ex(i);
  for (const n of notes) billed -= Math.max(0, num(n.amount) - num(n.taxAmount)) * ex(n.invoice);

  // A payment is part tax and part income in the proportion of its invoice.
  let received = 0;
  for (const p of payments) {
    const total = totalOf(p.invoice);
    const share = total > 0 ? taxableOf(p.invoice) / total : 1;
    received += num(p.amount) * share * ex(p.invoice);
  }

  let cost = 0;
  let itc = 0;
  for (const e of expenses) {
    const tax = num(e.igstAmount) + num(e.cgstAmount) + num(e.sgstAmount) + num(e.cessAmount);
    if (e.itcStatus === "ELIGIBLE") { cost += Math.max(0, num(e.amount) - tax); itc += tax; } else cost += num(e.amount);
  }

  let tdsCredits = 0, tdsDeducted = 0, tdsDeposited = 0;
  for (const w of wh) {
    const a = num(w.withheldAmount);
    if (w.sourceType === "INVOICE_PAYMENT") tdsCredits += a;
    else { tdsDeducted += a; if (w.depositedAt) tdsDeposited += a; }
  }

  return {
    billed: r2(Math.max(0, billed)), received: r2(Math.max(0, received)), expenses: r2(cost),
    payroll: r2(num(payroll._sum.totalEarnings) + num(payroll._sum.totalEmployerCosts)), itcClaimed: r2(itc),
    tdsCredits: r2(tdsCredits), tdsDeducted: r2(tdsDeducted), tdsDeposited: r2(tdsDeposited), invoiceCount: invoices.length,
  };
}

export async function loadReadinessCounts(gstProfile: GstProfile, startYear: number, now: Date, gstOverdue: number): Promise<ReadinessCounts> {
  const { workspaceId } = gstProfile;
  const { start, end } = fyBounds(startYear);
  const inFy = { gte: start, lte: end };
  const [books, salesEvidence, purchaseTotal, noReceipt, itcMissing, bankTotal, bankOpen, overdue, tds, employees, periods, firstEver] = await Promise.all([
    loadGstBooks(gstProfile, start, end),
    prisma.invoice.count({ where: { workspaceId, status: { not: "VOID" }, invoiceDate: inFy, pdfPath: "", NOT: { source: "POS" } } }),
    prisma.expense.count({ where: { workspaceId, date: inFy } }),
    prisma.expense.count({ where: { workspaceId, date: inFy, receiptUrl: null } }),
    prisma.expense.count({ where: { workspaceId, date: inFy, itcStatus: "ELIGIBLE", OR: [{ vendorGstin: null }, { vendorInvoiceNo: null }] } }),
    prisma.bankTransaction.count({ where: { workspaceId, date: inFy, isInternalTransfer: false } }),
    prisma.bankTransaction.count({ where: { workspaceId, date: inFy, isInternalTransfer: false, isReconciled: false } }),
    prisma.invoice.findMany({ where: { workspaceId, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: now } }, select: { grandTotal: true, totalAmount: true, amountReceived: true, exchangeRate: true } }),
    prisma.withholdingEvent.findMany({ where: { workspaceId, deductedAt: inFy, depositedAt: null, depositDueAt: { lt: now }, sourceType: { not: "INVOICE_PAYMENT" } }, select: { withheldAmount: true } }),
    prisma.employee.count({ where: { workspaceId, status: "ACTIVE" } }),
    prisma.payrollPeriod.findMany({ where: { workspaceId, startDate: inFy }, select: { startDate: true, status: true } }),
    prisma.payrollPeriod.findFirst({ where: { workspaceId }, orderBy: { startDate: "asc" }, select: { startDate: true } }),
  ]);
  const live = books.invoices.filter((i) => !i.voided);
  const has = (code: string) => live.filter((i) => i.issues.includes(code as never)).length;
  const monthsElapsed = monthsElapsedInFy(startYear, now);
  // Months before the first payroll on record were never payroll months for this business.
  const firstPeriod = firstEver?.startDate ?? null;
  const monthsBefore = firstPeriod && firstPeriod > start ? Math.max(0, (firstPeriod.getUTCFullYear() - start.getUTCFullYear()) * 12 + firstPeriod.getUTCMonth() - start.getUTCMonth()) : 0;
  const monthsExpectedPayroll = firstPeriod || employees === 0 ? Math.max(0, monthsElapsed - monthsBefore) : 0;
  return {
    sales: { total: live.length, missingSac: has("SAC_MISSING"), stateAssumed: has("STATE_ASSUMED"), gstinInvalid: has("GSTIN_INVALID"), taxMismatch: has("TAX_MISMATCH"), missingEvidence: salesEvidence },
    purchases: { total: purchaseTotal, noReceipt, itcMissingVendor: itcMissing },
    bank: { total: bankTotal, unreconciled: bankOpen },
    receivables: {
      overdueCount: overdue.length,
      overdueAmount: r2(overdue.reduce((s, i) => s + Math.max(0, (num(i.grandTotal) > 0 ? num(i.grandTotal) : num(i.totalAmount)) - num(i.amountReceived)) * (num(i.exchangeRate) || 1), 0)),
    },
    tds: { undepositedCount: tds.length, undepositedAmount: r2(tds.reduce((s, t) => s + num(t.withheldAmount), 0)) },
    payroll: { employees, monthsExpected: monthsExpectedPayroll, monthsClosed: periods.filter((p) => p.status === "CLOSED").length },
    gst: { applicable: gstProfile.countryCode === "IN" && gstProfile.registrationType !== "UNREGISTERED", overdueReturns: gstOverdue },
  };
}

export async function loadStored(workspaceId: string, fy: string): Promise<StoredItem[]> {
  const rows = await prisma.caComplianceItem.findMany({ where: { workspaceId, fy } });
  return rows.map((r) => ({ kind: r.kind, periodKey: r.periodKey, status: r.status, ownerUserId: r.ownerUserId, filedAt: r.filedAt, reference: r.reference, notes: r.notes, dueOverride: r.dueOverride, signedOffByName: r.signedOffByName, signedOffAt: r.signedOffAt }));
}

export type CaOverview = {
  fy: string;
  fyStart: number;
  years: Array<{ start: number; label: string }>;
  setup: CaSetup;
  configured: boolean;
  items: CaItemView[];
  progress: CaProgress;
  readiness: Readiness;
  figures: YearFigures;
  estimate: TaxEstimate | null;
  presumptive: PresumptiveView;
  gstHint: GstRegistrationHint;
  gst: { applicable: boolean; gstin: string | null; registrationType: string };
  requests: { open: number; answered: number };
  yearSignedOff: boolean;
};

/** Everything the CA workspace shows for one financial year, computed from the books on demand. */
export async function getCaOverview(workspaceId: string, startYear: number, now = new Date()): Promise<CaOverview> {
  const { start, end } = fyBounds(startYear);
  const fy = fyLabel(startYear);
  const [gstProfile, { setup, configured }, flags, figures, stored, firstInvoice, requestRows] = await Promise.all([
    loadGstProfile(workspaceId),
    loadCaSetup(workspaceId),
    loadFlags(workspaceId, start, end, now),
    loadYearFigures(workspaceId, startYear),
    loadStored(workspaceId, fy),
    prisma.invoice.findFirst({ where: { workspaceId }, orderBy: { invoiceDate: "asc" }, select: { invoiceDate: true } }),
    prisma.caRequest.groupBy({ by: ["status"], where: { workspaceId, fy }, _count: { _all: true } }),
  ]);

  const gstApplicable = gstProfile.countryCode === "IN" && gstProfile.registrationType !== "UNREGISTERED";
  let gstObligations: GstObligationLike[] = [];
  if (gstApplicable) {
    const [{ fyUnits }, filings, comments] = await Promise.all([computeFyUnits(gstProfile, startYear), loadFilings(workspaceId), loadCommentCounts(workspaceId)]);
    gstObligations = prepareObligations(gstProfile, startYear, fyUnits, filings, now, firstInvoice?.invoiceDate ?? null, comments).map((o) => ({
      returnType: o.returnType, periodKey: o.periodKey, label: o.label, optional: o.optional, dueDate: o.dueDate, extendedDueDate: o.extendedDueDate, status: o.status, reviewStatus: o.reviewStatus,
      filing: o.filing ? { filedAt: o.filing.filedAt, arn: o.filing.arn } : null,
    }));
  }

  const presumptive = presumptiveView(setup.entityType, figures.received || figures.billed);
  const presumptiveIncome = setup.presumptive === "SEC_44ADA" ? presumptive.ada.deemedIncome : setup.presumptive === "SEC_44AD" ? presumptive.ad.deemedIncomeDigital : null;
  const estimate = estimateYearTax({ startYear, setup, figures, presumptiveIncome });
  const items = buildCaCalendar({ startYear, setup, flags, gst: gstObligations, stored, estimatedTax: estimate ? estimate.payable : null, now });
  const readiness = buildReadiness(await loadReadinessCounts(gstProfile, startYear, now, items.filter((i) => i.group === "GST" && i.state === "OVERDUE").length));
  const count = (s: string) => requestRows.find((r) => r.status === s)?._count._all ?? 0;

  return {
    fy, fyStart: startYear,
    years: fyOptions(now, firstInvoice?.invoiceDate ?? null),
    setup, configured, items, progress: calendarProgress(items), readiness, figures, estimate, presumptive,
    gstHint: gstRegistrationHint({ registered: gstApplicable && gstProfile.registrationType !== "UNREGISTERED", countryIsIndia: gstProfile.countryCode === "IN", turnover: figures.billed }),
    gst: { applicable: gstApplicable, gstin: gstProfile.gstin, registrationType: gstProfile.registrationType },
    requests: { open: count("OPEN"), answered: count("ANSWERED") },
    yearSignedOff: !!items.find((i) => i.kind === "YEAR_CLOSE")?.signedOffAt,
  };
}

export { EMPTY_FIGURES };
