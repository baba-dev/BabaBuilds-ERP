import "server-only";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { amountsOfItems } from "@/lib/retainers/pricing";
import { retainerMrr } from "@/lib/retainers/mrr";
import { monthlyEquivalent } from "@/lib/retainers/schedule";
import { startOfUtcDay } from "@/lib/retainers/status";
import type { RetainerRiskItem, RetainerSummaryDto } from "@/lib/retainers/types";

const DAY = 86_400_000;
const ENDING_WINDOW_DAYS = 60;

/** Single definition of the recurring-revenue numbers (MRR excludes tax and is normalised to monthly, in base currency). */
export async function getRetainerSummary(workspaceId: string, now = new Date()): Promise<RetainerSummaryDto> {
  const today = startOfUtcDay(now);
  const horizon = today + 30 * DAY + 86_399_999;
  const [workspace, retainers, unpaid] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    prisma.retainer.findMany({
      where: { workspaceId, status: { in: ["ACTIVE", "PAUSED"] } },
      select: {
        id: true, name: true, status: true, frequency: true, exchangeRate: true, nextBillingDate: true, lastError: true, endDate: true, maxCycles: true, cyclesBilled: true, autoRenew: true,
        client: { select: { name: true } }, items: { select: { title: true, quantity: true, unitPrice: true, taxRate: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, retainerId: { not: null }, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      select: { retainerId: true, grandTotal: true, totalAmount: true, amountReceived: true, exchangeRate: true, dueDate: true },
    }),
  ]);

  let mrr = toDecimal(0);
  let next30 = toDecimal(0);
  let next30Count = 0;
  let dueCount = 0;
  let issueCount = 0;
  let activeCount = 0;
  let pausedCount = 0;
  const risk: RetainerRiskItem[] = [];
  const overdueByRetainer = new Map<string, number>();

  let outstanding = toDecimal(0);
  let overdueCount = 0;
  for (const i of unpaid) {
    const bal = effectiveTotal(i).minus(toDecimal(i.amountReceived ?? 0));
    if (bal.lte(0)) continue;
    const base = bal.mul(toDecimal(i.exchangeRate));
    outstanding = outstanding.plus(base);
    if (i.dueDate && startOfUtcDay(i.dueDate) < today) {
      overdueCount += 1;
      if (i.retainerId) overdueByRetainer.set(i.retainerId, (overdueByRetainer.get(i.retainerId) ?? 0) + base.toNumber());
    }
  }

  for (const r of retainers) {
    const a = amountsOfItems(r.items);
    const rate = toDecimal(r.exchangeRate);
    const monthly = retainerMrr({ status: "ACTIVE", frequency: r.frequency, exchangeRate: r.exchangeRate, items: r.items });
    const base = { id: r.id, name: r.name || r.items[0]?.title || "Retainer", clientName: r.client.name, mrr: monthly.toFixed(2) };
    if (r.status === "PAUSED") {
      pausedCount += 1;
      risk.push({ ...base, reason: "PAUSED", amount: null, date: null });
    } else {
      activeCount += 1;
      mrr = mrr.plus(toDecimal(monthlyEquivalent(a.subtotal.toNumber(), r.frequency)).mul(rate));
      if (r.nextBillingDate.getTime() <= horizon) {
        next30 = next30.plus(a.total.mul(rate));
        next30Count += 1;
      }
      if (startOfUtcDay(r.nextBillingDate) <= today) dueCount += 1;
      if (r.lastError) {
        issueCount += 1;
        risk.push({ ...base, reason: "FAILED", amount: null, date: null });
      }
    }
    const overdue = overdueByRetainer.get(r.id);
    if (overdue) risk.push({ ...base, reason: "OVERDUE", amount: overdue.toFixed(2), date: null });

    const cyclesLeft = r.maxCycles !== null ? r.maxCycles - r.cyclesBilled : null;
    const endsSoon = (r.endDate && r.endDate.getTime() - now.getTime() <= ENDING_WINDOW_DAYS * DAY) || (cyclesLeft !== null && cyclesLeft <= 2);
    if (r.status === "ACTIVE" && endsSoon) {
      risk.push({ ...base, reason: r.autoRenew ? "RENEWS" : "ENDING", amount: null, date: r.endDate ? r.endDate.toISOString() : null });
    }
  }

  const atRiskMrr = risk.filter((x, idx) => x.reason !== "RENEWS" && risk.findIndex((y) => y.id === x.id) === idx).reduce((acc, x) => acc + Number(x.mrr), 0);
  const count = (reason: RetainerRiskItem["reason"]) => risk.filter((x) => x.reason === reason).length;

  return {
    baseCurrency: workspace?.baseCurrency || "INR",
    mrr: mrr.toFixed(2),
    arr: mrr.mul(12).toFixed(2),
    activeCount,
    dueCount,
    next30Value: next30.toFixed(2),
    next30Count,
    pausedCount,
    issueCount,
    outstandingValue: outstanding.toFixed(2),
    outstandingCount: unpaid.length,
    overdueCount,
    risk: { atRiskMrr: atRiskMrr.toFixed(2), counts: { paused: count("PAUSED"), failed: count("FAILED"), overdue: count("OVERDUE"), ending: count("ENDING") }, items: risk.slice(0, 12) },
  };
}
