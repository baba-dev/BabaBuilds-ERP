import { getGstCashOutflows } from "@/lib/gst/insights";
import { payablesForForecast } from "@/lib/expenses/payables-data";
import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";
import type {
  CashForecastDirection,
  CashForecastScenarioTag,
  ForecastLineDraft,
  ForecastSourceData,
  ForecastAssumptions,
} from "./types";
import type { CashForecastClassification, CashForecastSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function invoiceToForecastLines(args: {
  invoice: {
    id: string;
    invoiceNumber: string;
    clientName: string;
    invoiceDate: Date;
    dueDate: Date | null;
    expectedPaymentDate: Date | null;
    paymentTermsDays: number | null;
    clientId: string | null;
    status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "VOID";
    totalAmount: Prisma.Decimal;
    amountReceived: number | Prisma.Decimal | null;
    exchangeRate?: number | Prisma.Decimal | null;
  };
  workspaceDefaults: {
    paymentTermsDays: number;
  };
  /** When given, a receivable already past due is moved to now + overdueCollectionDays instead of being left in the past. */
  now?: Date;
  overdueCollectionDays?: number;
  paymentBehavior?: {
    avgDaysToPay: number | null;
    medianDaysToPay: number | null;
    onTimeRate: number | null;
    lateRate: number | null;
    partialPaymentRate: number | null;
  } | null;
  scenarioTag: CashForecastScenarioTag;
  collectionsDelayDays: number;
  inflowHaircutPercent: number;
}): ForecastLineDraft[] {
  const { invoice, workspaceDefaults, scenarioTag, collectionsDelayDays, paymentBehavior } = args;
  if (invoice.status === "PAID" || invoice.status === "VOID") return [];

  const received = toDecimal(invoice.amountReceived ?? 0);
  const rate = toDecimal(invoice.exchangeRate ?? 1);
  // Cash is forecast in the workspace currency: what is still owed, times the invoice's rate.
  const remaining = toDecimal(invoice.totalAmount).minus(received).mul(rate.gt(0) ? rate : 1);
  if (remaining.lte(0)) return [];

  const termsDays = invoice.paymentTermsDays ?? workspaceDefaults.paymentTermsDays;
  const baseDate = invoice.expectedPaymentDate ?? invoice.dueDate ?? addDays(invoice.invoiceDate, termsDays);
  const behaviorAvgDays = paymentBehavior?.avgDaysToPay ?? null;
  const behaviorDelay = behaviorAvgDays !== null ? Math.max(0, Math.round(behaviorAvgDays - termsDays)) : 0;
  let expectedDate = addDays(baseDate, collectionsDelayDays + behaviorDelay);

  // v2 confidence heuristic: on-time rate drives confidence, with mild penalty for partial-payment behavior.
  const onTimeRate = paymentBehavior?.onTimeRate ?? null;
  const partialPaymentRate = paymentBehavior?.partialPaymentRate ?? null;
  let confidence =
    onTimeRate !== null
      ? Math.max(0.05, Math.min(0.98, onTimeRate - (partialPaymentRate ?? 0) * 0.25))
      : undefined;

  // Past due: the money is still owed, so it stays in the forecast, a little way out, and the older it is the less we trust it.
  let overdueDays = 0;
  if (args.now) {
    const today = new Date(args.now); today.setHours(0, 0, 0, 0);
    if (expectedDate < today) {
      overdueDays = Math.max(1, Math.round((today.getTime() - expectedDate.getTime()) / 86_400_000));
      expectedDate = addDays(today, (args.overdueCollectionDays ?? 7) + (overdueDays > 90 ? 30 : 0));
      confidence = Math.max(0.1, (confidence ?? 0.7) * (overdueDays > 90 ? 0.4 : overdueDays > 30 ? 0.7 : 0.9));
    }
  }

  const line: ForecastLineDraft = {
    direction: "INFLOW" as CashForecastDirection,
    sourceType: "INVOICE" as CashForecastSourceType,
    sourceId: invoice.id,
    amount: remaining,
    expectedDate,
    confidence,
    scenarioTag,
    classification: "EXPECTED" as CashForecastClassification,
    title: `Invoice ${invoice.invoiceNumber} · ${invoice.clientName}`,
    metadataJson: {
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      status: invoice.status,
      remaining: remaining.toFixed(2),
      clientId: invoice.clientId,
      dueDate: (invoice.dueDate ?? baseDate).toISOString(),
      behaviorDelayDays: behaviorDelay,
      overdueDays,
    },
    explanation: overdueDays > 0 ? `Overdue by ${overdueDays} days; assumed collected after follow-up.` : invoice.expectedPaymentDate
      ? "Expected on invoice expected payment date."
      : invoice.dueDate
        ? "Expected on invoice due date (or payment terms fallback)."
        : "Expected using invoice date + default payment terms.",
  };

  // Scenario amounts/dates are applied at engine normalize stage; keep source draft deterministic.
  return [line];
}

export function retainerToForecastLines(args: {
  retainer: {
    id: string;
    clientName: string;
    amount: Prisma.Decimal;
    frequency: string;
    status: string;
    nextBillingDate: Date;
    serviceName: string;
    endDate?: Date | null;
    maxCycles?: number | null;
    cyclesBilled?: number;
  };
  horizon: { startDate: Date; endDate: Date };
  scenarioTag: CashForecastScenarioTag;
  collectionsDelayDays: number;
  inflowHaircutPercent: number;
}): ForecastLineDraft[] {
  const { retainer, horizon, scenarioTag, collectionsDelayDays } = args;
  if (retainer.status !== "ACTIVE") return [];
  let events = generateRecurringDates(retainer.nextBillingDate, retainer.frequency, horizon.endDate);
  // Respect the retainer's own end: an end date and/or a cycle limit stop future billing.
  if (retainer.endDate) events = events.filter((d) => d <= retainer.endDate!);
  if (retainer.maxCycles != null) events = events.slice(0, Math.max(0, retainer.maxCycles - (retainer.cyclesBilled ?? 0)));
  // A cycle that should already have been billed is billed on the next run: once, today, however many were missed.
  const missed = events.filter((d) => d < horizon.startDate);
  const upcoming = events.filter((d) => d >= horizon.startDate && d <= horizon.endDate);
  const dated = missed.length ? [horizon.startDate, ...upcoming] : upcoming;
  return dated
    .map((d) => {
      const expectedDate = addDays(d, collectionsDelayDays);
      const line: ForecastLineDraft = {
        direction: "INFLOW",
        sourceType: "RETAINER",
        sourceId: retainer.id,
        amount: toDecimal(retainer.amount),
        expectedDate,
        confidence: undefined,
        scenarioTag,
        classification: "EXPECTED",
        title: `Retainer · ${retainer.clientName} · ${retainer.serviceName}`,
        metadataJson: { frequency: retainer.frequency },
        explanation: "Generated from active retainer schedule.",
      };
      return line;
    });
}

export function purchaseOrderToForecastLines(args: {
  purchaseOrder: {
    id: string;
    poNumber: string;
    supplier: string;
    status: string;
    expectedDate: Date | null;
    expectedPaymentDate: Date | null;
    totalAmount: Prisma.Decimal;
  };
  scenarioTag: CashForecastScenarioTag;
  poShiftDays: number;
  outflowIncreasePercent: number;
  now?: Date;
}): ForecastLineDraft[] {
  const { purchaseOrder, scenarioTag, poShiftDays } = args;
  const status = purchaseOrder.status;
  if (status === "CANCELLED") return [];
  if (status === "DRAFT") return [];

  const baseDate = purchaseOrder.expectedPaymentDate ?? purchaseOrder.expectedDate;
  if (!baseDate) return [];
  let expectedDate = addDays(baseDate, poShiftDays);
  if (args.now) {
    const today = new Date(args.now); today.setHours(0, 0, 0, 0);
    // An order whose payment date passed long ago has almost certainly been paid already (orders carry no paid flag): leave it out.
    if (expectedDate < addDays(today, -30)) return [];
    if (expectedDate < today) expectedDate = today;
  }

  const classification: CashForecastClassification = status === "DELIVERED" ? "COMMITTED" : "EXPECTED";

  const line: ForecastLineDraft = {
    direction: "OUTFLOW",
    sourceType: "PURCHASE_ORDER",
    sourceId: purchaseOrder.id,
    amount: toDecimal(purchaseOrder.totalAmount),
    expectedDate,
    confidence: undefined,
    scenarioTag,
    classification,
    title: `PO ${purchaseOrder.poNumber} · ${purchaseOrder.supplier}`,
    metadataJson: { status },
    explanation: purchaseOrder.expectedPaymentDate ? "Expected on PO expected payment date." : "Expected on PO expected date.",
  };

  return [line];
}

export function bankTransactionToForecastLine(args: {
  tx: { id: string; date: Date; description: string; amount: Prisma.Decimal; accountId: string | null };
  scenarioTag: CashForecastScenarioTag;
}): ForecastLineDraft {
  const { tx, scenarioTag } = args;
  const amount = toDecimal(tx.amount);
  const direction: CashForecastDirection = amount.gte(0) ? "INFLOW" : "OUTFLOW";
  return {
    direction,
    sourceType: "BANK_TRANSACTION",
    sourceId: tx.id,
    amount: amount.abs(),
    expectedDate: tx.date,
    confidence: 1,
    scenarioTag,
    classification: "ACTUAL",
    title: tx.description || "Bank transaction",
    metadataJson: { accountId: tx.accountId, rawAmount: amount.toFixed(2) },
    explanation: "Actual cash movement from bank transactions.",
  };
}

export function manualAdjustmentToForecastLine(args: {
  adj: { id: string; date: Date; amount: Prisma.Decimal; direction: CashForecastDirection; reason: string; category: string | null };
  scenarioTag: CashForecastScenarioTag;
}): ForecastLineDraft {
  const { adj, scenarioTag } = args;
  return {
    direction: adj.direction,
    sourceType: "MANUAL",
    sourceId: adj.id,
    amount: toDecimal(adj.amount).abs(),
    expectedDate: adj.date,
    confidence: undefined,
    scenarioTag,
    classification: "MANUAL",
    title: adj.category ? `Manual · ${adj.category}` : "Manual adjustment",
    metadataJson: { reason: adj.reason, category: adj.category },
    explanation: adj.reason,
  };
}

export function payrollOutflowToForecastLine(args: {
  posting: {
    accountingTransactionId: string;
    payrollRunId: string;
    postedAt: Date;
    amount: Prisma.Decimal;
    currency: string;
    sourceRef: string | null;
  };
  scenarioTag: CashForecastScenarioTag;
}): ForecastLineDraft {
  const { posting, scenarioTag } = args;
  return {
    direction: "OUTFLOW",
    sourceType: "PAYROLL",
    sourceId: posting.payrollRunId,
    amount: toDecimal(posting.amount).abs(),
    expectedDate: posting.postedAt,
    confidence: 1,
    scenarioTag,
    classification: "ACTUAL",
    title: `Payroll run · ${posting.payrollRunId}`,
    metadataJson: {
      accountingTransactionId: posting.accountingTransactionId,
      currency: posting.currency,
      sourceRef: posting.sourceRef,
    },
    explanation: "Actual payroll cash outflow from posted payroll accounting transaction.",
  };
}

export function gstPaymentToForecastLine(args: {
  payment: { id: string; periodKey: string; dueDate: Date; amount: Prisma.Decimal; label: string; estimated: boolean };
  scenarioTag: CashForecastScenarioTag;
}): ForecastLineDraft {
  const { payment, scenarioTag } = args;
  return {
    direction: "OUTFLOW",
    sourceType: "TAX",
    sourceId: payment.id,
    amount: toDecimal(payment.amount).abs(),
    expectedDate: payment.dueDate,
    confidence: payment.estimated ? 0.7 : 1,
    scenarioTag,
    classification: "COMMITTED",
    title: `GST payable · ${payment.label}`,
    metadataJson: { periodKey: payment.periodKey, estimated: payment.estimated },
    explanation: payment.estimated
      ? "Estimated cash GST on GSTR-3B for a period still open: output tax less input credit."
      : "Cash GST payable on GSTR-3B after using input credit.",
  };
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function generateRecurringDates(start: Date, frequency: string, endInclusive: Date): Date[] {
  const result: Date[] = [];
  let current = new Date(start);
  while (current <= endInclusive) {
    result.push(new Date(current));
    current = incrementFrequency(current, frequency);
  }
  return result;
}

function incrementFrequency(date: Date, frequency: string): Date {
  const d = new Date(date);
  const f = (frequency || "").toUpperCase();
  if (f === "WEEKLY") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (f === "MONTHLY") {
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (f === "QUARTERLY") {
    d.setMonth(d.getMonth() + 3);
    return d;
  }
  if (f === "ANNUALLY" || f === "YEARLY") {
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  // Default to monthly for unknown legacy values.
  d.setMonth(d.getMonth() + 1);
  return d;
}

const startOfToday = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export async function loadForecastSourceData(args: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  now: Date;
}): Promise<ForecastSourceData> {
  const { workspaceId, endDate } = args;
  // Cash movements are day-level: everything before the start of the first day is already in the opening balance.
  const startDate = startOfToday(args.startDate);
  const loadStartedAt = Date.now();

  const [accounts, bankTransactions, invoices, retainers, purchaseOrders, manualAdjustments, paymentBehaviors, payrollTransactions, recurring] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
      select: { id: true, name: true, currency: true, openingBalance: true, openingBalanceDate: true },
    }),
    prisma.bankTransaction.findMany({
      // A move between the business's own accounts changes no one's total cash.
      where: { workspaceId, isInternalTransfer: false, date: { gte: startDate, lte: endDate } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, date: true, description: true, amount: true, accountId: true },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      orderBy: [{ expectedPaymentDate: "asc" }, { dueDate: "asc" }, { invoiceDate: "asc" }, { id: "asc" }],
      select: { id: true, invoiceNumber: true, clientName: true, invoiceDate: true, dueDate: true, expectedPaymentDate: true, paymentTermsDays: true, clientId: true, status: true, totalAmount: true, amountReceived: true, exchangeRate: true },
    }),
    prisma.retainer.findMany({
      where: { workspaceId, status: "ACTIVE", nextBillingDate: { lte: endDate } },
      orderBy: [{ nextBillingDate: "asc" }, { id: "asc" }],
      select: { id: true, name: true, frequency: true, status: true, nextBillingDate: true, endDate: true, maxCycles: true, cyclesBilled: true, exchangeRate: true, client: { select: { name: true } }, items: { select: { quantity: true, unitPrice: true, taxRate: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { workspaceId, status: { notIn: ["CANCELLED", "DRAFT"] }, OR: [{ expectedPaymentDate: { lte: endDate } }, { expectedPaymentDate: null, expectedDate: { lte: endDate } }] },
      orderBy: [{ expectedPaymentDate: "asc" }, { expectedDate: "asc" }, { id: "asc" }],
      select: { id: true, poNumber: true, supplier: true, status: true, expectedDate: true, expectedPaymentDate: true, totalAmount: true },
    }),
    prisma.cashForecastManualAdjustment.findMany({
      where: { workspaceId, date: { gte: startDate, lte: endDate } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, date: true, amount: true, direction: true, reason: true, category: true },
    }),
    prisma.clientPaymentBehavior.findMany({
      where: { workspaceId },
      orderBy: { clientId: "asc" },
      select: { clientId: true, avgDaysToPay: true, medianDaysToPay: true, onTimeRate: true, lateRate: true, partialPaymentRate: true },
    }),
    // Recent payroll runs, including ones before the horizon: the next ones are projected from them.
    prisma.accountingTransaction.findMany({
      where: { workspaceId, sourceTable: "PAYROLL_PAYOUT", postedAt: { gte: new Date(startDate.getTime() - 120 * 86_400_000), lte: endDate } },
      orderBy: [{ postedAt: "desc" }, { id: "asc" }],
      take: 12,
      select: { id: true, sourceId: true, sourceRef: true, postedAt: true, postingCurrency: true, entries: { where: { accountCode: "1005_CASH_BANK_CLEARING", side: "CREDIT" }, select: { amount: true } } },
    }),
    prisma.recurringExpense.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { id: true, vendor: true, category: true, amount: true, frequency: true, nextRunDate: true, endDate: true, dueInDays: true, paymentStatus: true },
    }),
  ]);

  // Opening cash per account: its opening balance plus every movement since, summed in the database (never row by row in memory).
  let openingCash = new Prisma.Decimal(0);
  const accountBalances: NonNullable<ForecastSourceData["accounts"]> = [];
  const openingCashStartedAt = Date.now();
  const sums = await Promise.all(
    accounts.map((acc) => prisma.bankTransaction.aggregate({ where: { workspaceId, accountId: acc.id, date: { gte: acc.openingBalanceDate, lt: startDate } }, _sum: { amount: true } })),
  );
  accounts.forEach((acc, idx) => {
    const balance = toDecimal(acc.openingBalance).plus(toDecimal(sums[idx]?._sum.amount ?? 0));
    openingCash = openingCash.plus(balance);
    accountBalances.push({ id: acc.id, name: acc.name, balance, currency: acc.currency });
  });
  const openingCashComputationMs = Date.now() - openingCashStartedAt;

  // Each of these is optional: a failure there must never break the forecast.
  let gstPayments: ForecastSourceData["gstPayments"] = [];
  try {
    gstPayments = (await getGstCashOutflows(workspaceId, startDate, endDate)).map((g) => ({ id: g.id, periodKey: g.periodKey, dueDate: g.dueDate, amount: new Prisma.Decimal(g.amount), label: g.label, estimated: g.estimated }));
  } catch (error) {
    console.error("Forecast: GST outflows unavailable", error);
  }
  let payables: ForecastSourceData["payables"] = [];
  try {
    payables = (await payablesForForecast(workspaceId, args.now)).map((p) => ({ id: p.id, vendor: p.vendor, dueDate: p.dueDate, amount: new Prisma.Decimal(p.amount), overdue: p.overdue, invoiceNo: p.invoiceNo, msme: p.msme }));
  } catch (error) {
    console.error("Forecast: payables unavailable", error);
  }
  let purchaseOrdersWithBills: string[] = [];
  try {
    if (purchaseOrders.length) {
      const linked = await prisma.expense.findMany({ where: { workspaceId, purchaseOrderId: { in: purchaseOrders.map((p) => p.id) } }, select: { purchaseOrderId: true }, distinct: ["purchaseOrderId"] });
      purchaseOrdersWithBills = linked.map((l) => l.purchaseOrderId).filter((v): v is string => !!v);
    }
  } catch (error) {
    console.error("Forecast: purchase order bills unavailable", error);
  }

  // Money payroll already owes: statutory payments not yet made, and salaries on posted runs not yet paid.
  let payrollCommitments: NonNullable<ForecastSourceData["payrollCommitments"]> = [];
  try {
    const [dues, unpaidRuns] = await Promise.all([
      prisma.payrollRemittance.findMany({ where: { workspaceId, status: "DUE", dueDate: { lte: endDate } }, select: { id: true, kind: true, amount: true, dueDate: true, period: { select: { startDate: true } } } }),
      prisma.payrollRun.findMany({ where: { workspaceId, status: "POSTED", disbursedAt: null }, select: { id: true, period: { select: { startDate: true } }, lineItems: { where: { payoutStatus: { not: "PAID" } }, select: { netPay: true } } } }),
    ]);
    payrollCommitments = [
      ...dues.map((d) => ({ key: `remit:${d.id}`, kind: d.kind, title: `${d.kind} · ${d.period.startDate.toISOString().slice(0, 7)}`, amount: toDecimal(d.amount), date: d.dueDate < startDate ? startDate : d.dueDate, overdue: d.dueDate < startDate })),
      ...unpaidRuns.map((r) => ({ key: `salary:${r.id}`, kind: "SALARY", title: `Salaries · ${r.period.startDate.toISOString().slice(0, 7)}`, amount: r.lineItems.reduce((sum, l) => sum.plus(toDecimal(l.netPay)), new Prisma.Decimal(0)), date: startDate, overdue: false })).filter((r) => r.amount.gt(0)),
    ];
  } catch (error) {
    console.error("Forecast: payroll commitments unavailable", error);
  }

  const payrollRows = payrollTransactions.map((row) => ({
    accountingTransactionId: row.id,
    payrollRunId: row.sourceId.split(":")[0] ?? row.sourceId,
    postedAt: row.postedAt,
    amount: row.entries.reduce((sum, entry) => sum.plus(toDecimal(entry.amount)), new Prisma.Decimal(0)),
    currency: row.postingCurrency,
    sourceRef: row.sourceRef,
  }));

  return {
    openingCash,
    accounts: accountBalances,
    gstPayments,
    payables,
    purchaseOrdersWithBills,
    bankTransactions,
    invoices,
    clientPaymentBehavior: Object.fromEntries(
      paymentBehaviors.map((b) => [b.clientId, { avgDaysToPay: b.avgDaysToPay, medianDaysToPay: b.medianDaysToPay, onTimeRate: b.onTimeRate, lateRate: b.lateRate, partialPaymentRate: b.partialPaymentRate }]),
    ),
    retainers: retainers.map((r) => {
      // Cash arrives as the invoice total (tax included), converted to the workspace base currency.
      const sum = r.items.reduce((acc, item) => acc + item.quantity * Number(item.unitPrice) * (1 + (item.taxRate ?? 0)), 0);
      return {
        id: r.id,
        clientName: r.client.name,
        amount: new Prisma.Decimal(sum).mul(r.exchangeRate).toDecimalPlaces(2),
        frequency: r.frequency,
        status: r.status,
        nextBillingDate: r.nextBillingDate,
        serviceName: r.name || "Retainer",
        endDate: r.endDate,
        maxCycles: r.maxCycles,
        cyclesBilled: r.cyclesBilled,
      };
    }),
    purchaseOrders,
    manualAdjustments,
    payrollOutflows: payrollRows.filter((r) => r.postedAt >= startDate),
    payrollHistory: payrollRows.map((r) => ({ runId: r.payrollRunId, postedAt: r.postedAt, amount: r.amount })),
    payrollCommitments,
    recurringExpenses: recurring.map((r) => ({ id: r.id, vendor: r.vendor, category: r.category, amount: toDecimal(r.amount), frequency: r.frequency, nextRunDate: r.nextRunDate, endDate: r.endDate, dueInDays: r.dueInDays, paid: r.paymentStatus !== "UNPAID" })),
    workspaceDefaults: { invoicePaymentTermsDays: 15, minimumCashThreshold: 0 },
    debug: {
      telemetry: {
        elapsedMs: Date.now() - loadStartedAt,
        openingCashComputationMs,
        counts: {
          accounts: accounts.length,
          bankTransactions: bankTransactions.length,
          invoices: invoices.length,
          retainers: retainers.length,
          purchaseOrders: purchaseOrders.length,
          manualAdjustments: manualAdjustments.length,
          clientPaymentBehaviors: paymentBehaviors.length,
          payrollTransactions: payrollTransactions.length,
          txUpToStart: 0,
        },
      },
    },
  };
}

const withinDays = (a: Date, b: Date, days: number) => Math.abs(a.getTime() - b.getTime()) <= days * 86_400_000;

/** Next payroll runs, projected from the last few: same day of the month, the average of what was actually paid. Stops if payroll has not run in over two months. */
export function projectPayroll(history: NonNullable<ForecastSourceData["payrollHistory"]>, start: Date, end: Date, actual: Array<{ postedAt: Date }>): Array<{ date: Date; amount: Prisma.Decimal; basedOn: number }> {
  const runs = history.filter((h) => toDecimal(h.amount).gt(0)).sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());
  const last = runs[0];
  if (!last || start.getTime() - last.postedAt.getTime() > 70 * 86_400_000) return [];
  const recent = runs.slice(0, 3);
  const avg = recent.reduce((sum, r) => sum.plus(toDecimal(r.amount)), new Prisma.Decimal(0)).div(recent.length).toDecimalPlaces(2);
  const out: Array<{ date: Date; amount: Prisma.Decimal; basedOn: number }> = [];
  const day = last.postedAt.getDate();
  let cursor = new Date(last.postedAt.getFullYear(), last.postedAt.getMonth() + 1, 1);
  for (let i = 0; i < 14 && cursor <= end; i++) {
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, daysInMonth));
    if (date >= start && date <= end && !actual.some((a) => withinDays(a.postedAt, date, 12))) out.push({ date, amount: avg, basedOn: recent.length });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return out;
}

export function buildForecastLinesFromSources(args: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  now: Date;
  scenarioTag?: CashForecastScenarioTag;
  sources: ForecastSourceData;
  assumptions?: ForecastAssumptions;
}): ForecastLineDraft[] {
  const { sources } = args;
  const scenarioTag = args.scenarioTag ?? "BASE";
  const start = startOfToday(args.startDate);
  const end = args.endDate;
  const a = args.assumptions;

  const workspaceDefaults = { paymentTermsDays: a?.defaultInvoicePaymentTermsDays ?? sources.workspaceDefaults?.invoicePaymentTermsDays ?? 15 };
  const overdueCollectionDays = a?.overdueCollectionDays ?? 7;
  const lines: ForecastLineDraft[] = [];
  const behaviorByClientId = sources.clientPaymentBehavior ?? {};

  for (const tx of sources.bankTransactions) lines.push(bankTransactionToForecastLine({ tx, scenarioTag }));

  for (const inv of sources.invoices) {
    lines.push(...invoiceToForecastLines({
      invoice: inv, workspaceDefaults, paymentBehavior: inv.clientId ? (behaviorByClientId[inv.clientId] ?? null) : null,
      scenarioTag, collectionsDelayDays: 0, inflowHaircutPercent: 0, now: args.now, overdueCollectionDays,
    }));
  }

  for (const r of sources.retainers) {
    lines.push(...retainerToForecastLines({ retainer: r, horizon: { startDate: start, endDate: end }, scenarioTag, collectionsDelayDays: 0, inflowHaircutPercent: 0 }));
  }

  // An order that already has a bill is counted through the bill, not twice.
  const billed = new Set(sources.purchaseOrdersWithBills ?? []);
  for (const po of sources.purchaseOrders) {
    if (billed.has(po.id)) continue;
    lines.push(...purchaseOrderToForecastLines({ purchaseOrder: po, scenarioTag, poShiftDays: 0, outflowIncreasePercent: 0, now: args.now }));
  }

  for (const adj of sources.manualAdjustments) lines.push(manualAdjustmentToForecastLine({ adj, scenarioTag }));

  // Payroll already posted is only a duplicate of the bank debit when the bank has it too.
  const bankOutflows = sources.bankTransactions.filter((t) => toDecimal(t.amount).lt(0));
  for (const posting of sources.payrollOutflows ?? []) {
    const amount = toDecimal(posting.amount).abs();
    const onBank = bankOutflows.some((t) => withinDays(t.date, posting.postedAt, 5) && toDecimal(t.amount).abs().minus(amount).abs().lte(amount.mul(0.03)));
    if (!onBank) lines.push(payrollOutflowToForecastLine({ posting, scenarioTag }));
  }
  for (const p of projectPayroll(sources.payrollHistory ?? [], start, end, [...(sources.payrollOutflows ?? []), ...(sources.payrollCommitments ?? []).filter((c) => c.kind === "SALARY").map((c) => ({ postedAt: c.date }))])) {
    lines.push({
      direction: "OUTFLOW", sourceType: "PAYROLL", sourceId: `payroll-forecast:${p.date.toISOString().slice(0, 7)}`, amount: p.amount, expectedDate: p.date, confidence: 0.85, scenarioTag, classification: "PREDICTED",
      title: "Payroll (projected)", explanation: `Projected from your last ${p.basedOn} payroll run${p.basedOn > 1 ? "s" : ""}.`, metadataJson: { projected: true, basedOn: p.basedOn },
    });
  }

  for (const c of sources.payrollCommitments ?? []) {
    lines.push({
      direction: "OUTFLOW", sourceType: "PAYROLL", sourceId: c.key, amount: toDecimal(c.amount).abs(), expectedDate: c.date, confidence: 1, scenarioTag, classification: "COMMITTED",
      title: c.title, explanation: c.kind === "SALARY" ? "Salaries on a posted payroll run that are not recorded as paid yet." : "Deducted from salaries and owed to government. Due on the statutory date.",
      metadataJson: { kind: c.kind, overdue: c.overdue },
    });
  }
  for (const payment of sources.gstPayments ?? []) lines.push(gstPaymentToForecastLine({ payment, scenarioTag }));

  for (const bill of sources.payables ?? []) {
    lines.push({
      direction: "OUTFLOW", sourceType: "EXPENSE", sourceId: bill.id, amount: toDecimal(bill.amount).abs(), expectedDate: bill.dueDate, confidence: bill.overdue ? 0.8 : 0.95, scenarioTag, classification: "COMMITTED",
      title: `Bill to pay · ${bill.vendor}${bill.invoiceNo ? ` ${bill.invoiceNo}` : ""}`,
      explanation: bill.overdue ? "Overdue supplier bill, assumed paid soon." : "Supplier bill on credit, due on its due date.",
      metadataJson: { overdue: bill.overdue, msme: bill.msme, vendor: bill.vendor },
    });
  }

  // Recurring expense templates: every run that falls in the horizon.
  for (const t of sources.recurringExpenses ?? []) {
    let d = new Date(t.nextRunDate);
    if (d < start) d = start; // a missed run happens on the next sweep
    for (let i = 0; i < 400 && d <= end; i++) {
      if (t.endDate && d > t.endDate) break;
      const due = t.paid ? d : addDays(d, t.dueInDays ?? 30);
      lines.push({
        direction: "OUTFLOW", sourceType: "EXPENSE", sourceId: `recurring:${t.id}:${d.toISOString().slice(0, 10)}`, amount: toDecimal(t.amount).abs(), expectedDate: due, confidence: 0.9, scenarioTag, classification: "PREDICTED",
        title: `Recurring · ${t.vendor}`, explanation: `Repeats ${t.frequency.toLowerCase()} (${t.category}).`, metadataJson: { recurring: true, category: t.category, vendor: t.vendor },
      });
      d = incrementFrequency(d, t.frequency);
    }
  }

  // Standing monthly outflows saved with the scenario assumptions (rent, loan instalments, subscriptions).
  for (const o of a?.recurringOutflows ?? []) {
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < 14 && cursor <= end; i++) {
      const dim = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(o.dayOfMonth, dim));
      if (date >= start && date <= end) {
        lines.push({
          direction: "OUTFLOW", sourceType: "MANUAL", sourceId: `standing:${o.title}:${date.toISOString().slice(0, 7)}`, amount: toDecimal(o.amount), expectedDate: date, confidence: 0.95, scenarioTag, classification: "COMMITTED",
          title: `Standing · ${o.title}`, explanation: "Monthly commitment from your assumptions.", metadataJson: { standing: true, category: o.category ?? null },
        });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }

  // Keep what falls inside the horizon (everything overdue was moved forward above).
  return lines.filter((l) => l.expectedDate >= start && l.expectedDate <= end);
}
