import "server-only";
import { prisma } from "@/lib/prisma";

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** What to charge the client: the cost without input credit you will claim back, plus the markup. */
export function billableAmount(args: { amount: number; creditableGst: number; markupPercent: number | null | undefined }): number {
  const cost = Math.max(0, args.amount - Math.max(0, args.creditableGst));
  return r2(cost * (1 + Math.max(0, args.markupPercent ?? 0) / 100));
}

export async function listUnbilled(workspaceId: string, clientId: string) {
  const rows = await prisma.expense.findMany({ where: { workspaceId, clientId, billable: true, billedInvoiceId: null, approvalStatus: "APPROVED" }, orderBy: { date: "asc" }, take: 100 });
  return rows.map((e) => {
    const creditable = e.itcStatus === "ELIGIBLE" ? num(e.igstAmount) + num(e.cgstAmount) + num(e.sgstAmount) + num(e.cessAmount) : 0;
    return { id: e.id, date: e.date.toISOString(), vendor: e.vendor, category: e.category, description: e.description, cost: r2(num(e.amount) - creditable), markupPercent: e.markupPercent, amount: billableAmount({ amount: num(e.amount), creditableGst: creditable, markupPercent: e.markupPercent }), title: `${e.description || e.category} (${e.vendor})` };
  });
}

/** Marks expenses as billed on an invoice. Only the client's own, still-unbilled ones are touched. */
export async function markBilled(workspaceId: string, clientId: string, expenseIds: string[], invoiceId: string) {
  if (expenseIds.length === 0) return 0;
  const res = await prisma.expense.updateMany({ where: { id: { in: expenseIds }, workspaceId, clientId, billable: true, billedInvoiceId: null }, data: { billedInvoiceId: invoiceId } });
  return res.count;
}
