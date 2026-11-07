import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeMoney, toDecimal } from "@/lib/money";
import { fyLabelFor, fyRangeFromLabel, previousPeriod, resolvePeriod } from "@/lib/invoices/period";
import { startOfUtcToday } from "@/lib/invoices/query";
import { balanceOf, effectiveTotal } from "@/lib/invoices/serialize";
import type { InvoiceSummaryDto } from "@/lib/invoices/types";

const ZERO = new Prisma.Decimal(0);
const MS_PER_DAY = 86_400_000;
/** GST registration threshold for service providers (INR). Informational only. */
const IN_SERVICES_THRESHOLD = new Prisma.Decimal(2_000_000);

type BilledRow = {
  grandTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  baseGrandTotal: Prisma.Decimal | null;
  exchangeRate: Prisma.Decimal;
  currency?: string;
};

/** Per-row coalescing (never at aggregate level): legacy rows may have grandTotal = 0. */
export function billedInBase(row: BilledRow): Prisma.Decimal {
  return row.baseGrandTotal ?? effectiveTotal(row).mul(toDecimal(row.exchangeRate));
}

async function billedBetween(workspaceId: string, from: Date, to: Date) {
  const rows = await prisma.invoice.findMany({
    where: { workspaceId, status: { not: "VOID" }, invoiceDate: { gte: from, lt: to } },
    select: { grandTotal: true, totalAmount: true, baseGrandTotal: true, exchangeRate: true, currency: true },
  });
  const total = rows.reduce((sum, row) => sum.plus(billedInBase(row)), ZERO);
  const byCurrency = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? ZERO).plus(effectiveTotal(row)));
  }
  return { total, byCurrency };
}

async function collectedBetween(workspaceId: string, from: Date, to: Date) {
  const [ledgerRows, directRows] = await Promise.all([
    prisma.invoicePayment.findMany({
      where: { workspaceId, reversedAt: null, receivedAt: { gte: from, lt: to }, invoice: { status: { not: "VOID" } } },
      select: { amount: true, invoice: { select: { exchangeRate: true } } },
    }),
    // Money recorded straight on the invoice by webhooks / bank reconciliation / imports has no ledger row:
    // count the part of amountReceived that no active payment row accounts for.
    prisma.invoice.findMany({
      where: { workspaceId, status: { not: "VOID" }, amountReceived: { gt: 0 }, dateReceived: { gte: from, lt: to } },
      select: { amountReceived: true, exchangeRate: true, payments: { where: { reversedAt: null }, select: { amount: true } } },
    }),
  ]);

  const fromLedger = ledgerRows.reduce((sum, row) => sum.plus(toDecimal(row.amount).mul(toDecimal(row.invoice.exchangeRate))), ZERO);
  const unattributed = directRows.reduce((sum, row) => {
    const attributed = row.payments.reduce((acc, p) => acc.plus(toDecimal(p.amount)), ZERO);
    const delta = toDecimal(row.amountReceived).minus(attributed);
    return delta.gt(0) ? sum.plus(delta.mul(toDecimal(row.exchangeRate))) : sum;
  }, ZERO);
  return fromLedger.plus(unattributed);
}

export async function getInvoiceSummary(
  workspaceId: string,
  options: { fy?: string | null; from?: Date | null; to?: Date | null; now?: Date } = {},
): Promise<InvoiceSummaryDto> {
  const now = options.now ?? new Date();
  const period = resolvePeriod({ fy: options.fy, from: options.from, to: options.to }, now);
  const prior = previousPeriod(period);
  const today = startOfUtcToday(now);

  const workspaceFy = fyRangeFromLabel(period.label) ?? fyRangeFromLabel(fyLabelFor(now))!;

  const [workspace, taxPref, billed, billedPrev, collected, collectedPrev, openRows, paidRows, fyBilled] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true, countryCode: true } }),
    prisma.workspaceTaxPreference.findUnique({
      where: { workspaceId },
      select: { taxEstimateEnabled: true, taxEstimateRatePercent: true },
    }),
    billedBetween(workspaceId, period.from, period.to),
    billedBetween(workspaceId, prior.from, prior.to),
    collectedBetween(workspaceId, period.from, period.to),
    collectedBetween(workspaceId, prior.from, prior.to),
    prisma.invoice.findMany({
      where: { workspaceId, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      select: {
        status: true,
        dueDate: true,
        grandTotal: true,
        totalAmount: true,
        baseGrandTotal: true,
        amountReceived: true,
        exchangeRate: true,
      },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, status: "PAID", dateReceived: { gte: period.from, lt: period.to } },
      select: { invoiceDate: true, dateReceived: true },
      take: 5000,
    }),
    // Aggregate turnover for the threshold is always a full financial year.
    billedBetween(workspaceId, workspaceFy.from, workspaceFy.to),
  ]);

  let outstanding = ZERO;
  let overdue = ZERO;
  let overdueCount = 0;
  for (const row of openRows) {
    const total = effectiveTotal(row);
    const balance = balanceOf(total, toDecimal(row.amountReceived), row.status);
    if (!balance.gt(0)) continue;
    const rate = toDecimal(row.exchangeRate);
    const balanceBase = balance.mul(rate);
    outstanding = outstanding.plus(balanceBase);
    if (row.dueDate && row.dueDate.getTime() < today.getTime()) {
      overdue = overdue.plus(balanceBase);
      overdueCount += 1;
    }
  }

  const durations = paidRows
    .filter((r) => r.dateReceived)
    .map((r) => Math.max(0, (r.dateReceived!.getTime() - r.invoiceDate.getTime()) / MS_PER_DAY));
  const avgDaysToPay = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const countryCode = workspace?.countryCode ?? "";
  const eligible = countryCode === "IN";
  const enabled = eligible && Boolean(taxPref?.taxEstimateEnabled);
  const ratePercent = taxPref?.taxEstimateRatePercent ?? 50;
  const fyTurnover = fyBilled.total;

  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
    baseCurrency: workspace?.baseCurrency ?? "INR",
    billed: serializeMoney(billed.total),
    billedPrevious: serializeMoney(billedPrev.total),
    collected: serializeMoney(collected),
    collectedPrevious: serializeMoney(collectedPrev),
    outstanding: serializeMoney(outstanding),
    overdue: serializeMoney(overdue),
    notYetDue: serializeMoney(outstanding.minus(overdue)),
    overdueCount,
    openCount: openRows.length,
    avgDaysToPay,
    billedByCurrency: [...billed.byCurrency.entries()].map(([currency, amount]) => ({ currency, amount: serializeMoney(amount) })),
    taxEstimate: {
      eligible,
      enabled,
      ratePercent,
      estimatedIncome: enabled ? serializeMoney(collected.mul(ratePercent).div(100)) : null,
      thresholdLabel: eligible ? "GST registration threshold (services)" : null,
      fyTurnover: eligible ? serializeMoney(fyTurnover) : null,
      threshold: eligible ? serializeMoney(IN_SERVICES_THRESHOLD) : null,
      thresholdPercent: eligible
        ? Math.min(100, Math.round(fyTurnover.div(IN_SERVICES_THRESHOLD).mul(1000).toNumber()) / 10)
        : null,
    },
  };
}
