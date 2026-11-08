import "server-only";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { retainerMrr } from "@/lib/retainers/mrr";
import { startOfUtcDay } from "@/lib/retainers/status";

export type ClientRetainerSummary = { active: number; paused: number; mrr: string; currency: string; outstandingInvoices: number; overdueInvoices: number };

/** Recurring-billing roll-up for a page of clients: MRR in the base currency, open and overdue retainer invoices. */
export async function getClientRetainerSummaries(workspaceId: string, clientIds: string[]): Promise<Map<string, ClientRetainerSummary>> {
  const out = new Map<string, ClientRetainerSummary>();
  if (clientIds.length === 0) return out;
  const [ws, retainers, unpaid] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    prisma.retainer.findMany({
      where: { workspaceId, clientId: { in: clientIds }, status: { in: ["ACTIVE", "PAUSED"] } },
      select: { clientId: true, status: true, frequency: true, exchangeRate: true, items: { select: { quantity: true, unitPrice: true, taxRate: true } } },
    }),
    prisma.invoice.findMany({
      where: { workspaceId, clientId: { in: clientIds }, retainerId: { not: null }, status: { in: ["PENDING", "PARTIALLY_PAID"] } },
      select: { clientId: true, grandTotal: true, totalAmount: true, amountReceived: true, dueDate: true },
    }),
  ]);
  const currency = ws?.baseCurrency || "INR";
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) { s = { active: 0, paused: 0, mrr: "0.00", currency, outstandingInvoices: 0, overdueInvoices: 0 }; out.set(id, s); }
    return s;
  };
  for (const r of retainers) {
    const s = get(r.clientId);
    if (r.status === "ACTIVE") s.active += 1; else s.paused += 1;
    s.mrr = (Number(s.mrr) + retainerMrr({ status: r.status, frequency: r.frequency, exchangeRate: r.exchangeRate, items: r.items })).toFixed(2);
  }
  const today = startOfUtcDay(new Date());
  for (const i of unpaid) {
    if (!i.clientId || effectiveTotal(i).minus(toDecimal(i.amountReceived ?? 0)).lte(0)) continue;
    const s = get(i.clientId);
    s.outstandingInvoices += 1;
    if (i.dueDate && startOfUtcDay(i.dueDate) < today) s.overdueInvoices += 1;
  }
  return out;
}
