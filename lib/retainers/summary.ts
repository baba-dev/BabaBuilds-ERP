import "server-only";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { amountsOfItems } from "@/lib/retainers/pricing";
import { monthlyEquivalent } from "@/lib/retainers/schedule";
import { startOfUtcDay } from "@/lib/retainers/status";
import type { RetainerSummaryDto } from "@/lib/retainers/types";

const DAY = 86_400_000;

/** Single definition of the recurring-revenue numbers (MRR excludes tax and is normalised to monthly, in base currency). */
export async function getRetainerSummary(workspaceId: string, now = new Date()): Promise<RetainerSummaryDto> {
  const today = startOfUtcDay(now);
  const horizon = today + 30 * DAY + 86_399_999;
  const [workspace, retainers, paused, unpaid] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    prisma.retainer.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: { frequency: true, exchangeRate: true, nextBillingDate: true, lastError: true, items: { select: { quantity: true, unitPrice: true, taxRate: true } } },
    }),
    prisma.retainer.count({ where: { workspaceId, status: "PAUSED" } }),
    prisma.invoice.findMany({
      where: { workspaceId, retainerId: { not: null }, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      select: { grandTotal: true, totalAmount: true, amountReceived: true, exchangeRate: true, dueDate: true },
    }),
  ]);

  let mrr = toDecimal(0);
  let next30 = toDecimal(0);
  let next30Count = 0;
  let dueCount = 0;
  let issueCount = 0;
  for (const r of retainers) {
    const a = amountsOfItems(r.items);
    const rate = toDecimal(r.exchangeRate);
    mrr = mrr.plus(toDecimal(monthlyEquivalent(a.subtotal.toNumber(), r.frequency)).mul(rate));
    if (r.nextBillingDate.getTime() <= horizon) {
      next30 = next30.plus(a.total.mul(rate));
      next30Count += 1;
    }
    if (startOfUtcDay(r.nextBillingDate) <= today) dueCount += 1;
    if (r.lastError) issueCount += 1;
  }

  let outstanding = toDecimal(0);
  let overdueCount = 0;
  for (const i of unpaid) {
    const bal = effectiveTotal(i).minus(toDecimal(i.amountReceived ?? 0));
    if (bal.lte(0)) continue;
    outstanding = outstanding.plus(bal.mul(toDecimal(i.exchangeRate)));
    if (i.dueDate && startOfUtcDay(i.dueDate) < today) overdueCount += 1;
  }

  return {
    baseCurrency: workspace?.baseCurrency || "INR",
    mrr: mrr.toFixed(2),
    arr: mrr.mul(12).toFixed(2),
    activeCount: retainers.length,
    dueCount,
    next30Value: next30.toFixed(2),
    next30Count,
    pausedCount: paused,
    issueCount,
    outstandingValue: outstanding.toFixed(2),
    outstandingCount: unpaid.length,
    overdueCount,
  };
}
