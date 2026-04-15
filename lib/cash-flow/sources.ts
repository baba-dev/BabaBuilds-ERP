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
    status: "PENDING" | "PARTIALLY_PAID" | "PAID";
    totalAmount: Prisma.Decimal;
    amountReceived: number | null;
  };
  workspaceDefaults: {
    paymentTermsDays: number;
  };
  scenarioTag: CashForecastScenarioTag;
  collectionsDelayDays: number;
  inflowHaircutPercent: number;
}): ForecastLineDraft[] {
  const { invoice, workspaceDefaults, scenarioTag, collectionsDelayDays, inflowHaircutPercent } = args;
  if (invoice.status === "PAID") return [];

  const received = toDecimal(invoice.amountReceived ?? 0);
  const remaining = toDecimal(invoice.totalAmount).minus(received);
  if (remaining.lte(0)) return [];

  const termsDays = invoice.paymentTermsDays ?? workspaceDefaults.paymentTermsDays;
  const baseDate = invoice.expectedPaymentDate ?? invoice.dueDate ?? addDays(invoice.invoiceDate, termsDays);
  const expectedDate = addDays(baseDate, collectionsDelayDays);

  const line: ForecastLineDraft = {
    direction: "INFLOW" as CashForecastDirection,
    sourceType: "INVOICE" as CashForecastSourceType,
    sourceId: invoice.id,
    amount: remaining,
    expectedDate,
    confidence: undefined,
    scenarioTag,
    classification: "EXPECTED" as CashForecastClassification,
    title: `Invoice ${invoice.invoiceNumber} · ${invoice.clientName}`,
    metadataJson: {
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      status: invoice.status,
      remaining: remaining.toFixed(2),
    },
    explanation: invoice.expectedPaymentDate
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
  };
  horizon: { startDate: Date; endDate: Date };
  scenarioTag: CashForecastScenarioTag;
  collectionsDelayDays: number;
  inflowHaircutPercent: number;
}): ForecastLineDraft[] {
  const { retainer, horizon, scenarioTag, collectionsDelayDays, inflowHaircutPercent } = args;
  if (retainer.status !== "ACTIVE") return [];
  const events = generateRecurringDates(retainer.nextBillingDate, retainer.frequency, horizon.endDate);
  return events
    .filter((d) => d >= horizon.startDate && d <= horizon.endDate)
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
}): ForecastLineDraft[] {
  const { purchaseOrder, scenarioTag, poShiftDays, outflowIncreasePercent } = args;
  const status = purchaseOrder.status;
  if (status === "CANCELLED") return [];
  if (status === "DRAFT") return [];

  const baseDate = purchaseOrder.expectedPaymentDate ?? purchaseOrder.expectedDate;
  if (!baseDate) return [];
  const expectedDate = addDays(baseDate, poShiftDays);

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

export async function loadForecastSourceData(args: {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  now: Date;
}): Promise<ForecastSourceData> {
  const { workspaceId, startDate, endDate } = args;

  const [accounts, bankTransactions, invoices, retainers, purchaseOrders, manualAdjustments] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { workspaceId },
      select: { id: true, openingBalance: true, openingBalanceDate: true },
    }),
    prisma.bankTransaction.findMany({
      where: { workspaceId, date: { gte: startDate, lte: endDate } },
      select: { id: true, date: true, description: true, amount: true, accountId: true },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      select: {
        id: true,
        invoiceNumber: true,
        clientName: true,
        invoiceDate: true,
        dueDate: true,
        expectedPaymentDate: true,
        paymentTermsDays: true,
        status: true,
        totalAmount: true,
        amountReceived: true,
      },
    }),
    prisma.retainer.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { id: true, amount: true, frequency: true, status: true, nextBillingDate: true, serviceName: true, client: { select: { name: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { workspaceId, status: { not: "CANCELLED" } },
      select: { id: true, poNumber: true, supplier: true, status: true, expectedDate: true, expectedPaymentDate: true, totalAmount: true },
    }),
    prisma.cashForecastManualAdjustment.findMany({
      where: { workspaceId, date: { gte: startDate, lte: endDate } },
      select: { id: true, date: true, amount: true, direction: true, reason: true, category: true },
    }),
  ]);

  // Opening cash: sum across accounts as of startDate using openingBalance + tx between openingBalanceDate..startDate.
  // For v1, if there are no accounts configured, opening cash is 0.
  let openingCash = new Prisma.Decimal(0);
  if (accounts.length > 0) {
    const txUpToStart = await prisma.bankTransaction.findMany({
      where: { workspaceId, date: { lt: startDate } },
      select: { amount: true, date: true, accountId: true },
    });

    for (const acc of accounts) {
      let cash = toDecimal(acc.openingBalance);
      for (const tx of txUpToStart) {
        if (acc.id && tx.accountId && tx.accountId !== acc.id) continue;
        if (tx.date < acc.openingBalanceDate) continue;
        cash = cash.plus(toDecimal(tx.amount));
      }
      openingCash = openingCash.plus(cash);
    }
  }

  return {
    openingCash,
    bankTransactions,
    invoices: invoices as any,
    retainers: retainers.map((r) => ({
      id: r.id,
      clientName: r.client.name,
      amount: r.amount,
      frequency: r.frequency,
      status: r.status,
      nextBillingDate: r.nextBillingDate,
      serviceName: r.serviceName,
    })),
    purchaseOrders,
    manualAdjustments,
    workspaceDefaults: {
      invoicePaymentTermsDays: 15,
      minimumCashThreshold: 0,
    },
  };
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

  // Defaults for v1; later load from CashForecastAssumption.
  const workspaceDefaults = { paymentTermsDays: sources.workspaceDefaults?.invoicePaymentTermsDays ?? 15 };
  const assumptions = args.assumptions ?? {
    collectionsDelayDays: 0,
    inflowHaircutPercent: 0,
    outflowIncreasePercent: 0,
    movePOEarlierLaterDays: 0,
    minimumCashThreshold: sources.workspaceDefaults?.minimumCashThreshold ?? 0,
  };

  const lines: ForecastLineDraft[] = [];

  for (const tx of sources.bankTransactions) {
    lines.push(bankTransactionToForecastLine({ tx, scenarioTag }));
  }

  for (const inv of sources.invoices) {
    lines.push(
      ...invoiceToForecastLines({
        invoice: inv,
        workspaceDefaults,
        scenarioTag,
        collectionsDelayDays: assumptions.collectionsDelayDays,
        inflowHaircutPercent: assumptions.inflowHaircutPercent,
      })
    );
  }

  for (const r of sources.retainers) {
    lines.push(
      ...retainerToForecastLines({
        retainer: r,
        horizon: { startDate: args.startDate, endDate: args.endDate },
        scenarioTag,
        collectionsDelayDays: assumptions.collectionsDelayDays,
        inflowHaircutPercent: assumptions.inflowHaircutPercent,
      })
    );
  }

  for (const po of sources.purchaseOrders) {
    lines.push(
      ...purchaseOrderToForecastLines({
        purchaseOrder: po,
        scenarioTag,
        poShiftDays: assumptions.movePOEarlierLaterDays,
        outflowIncreasePercent: assumptions.outflowIncreasePercent,
      })
    );
  }

  for (const adj of sources.manualAdjustments) {
    lines.push(manualAdjustmentToForecastLine({ adj, scenarioTag }));
  }

  // Filter to horizon range.
  return lines.filter((l) => l.expectedDate >= args.startDate && l.expectedDate <= args.endDate);
}

