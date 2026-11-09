import "server-only";
import { prisma } from "@/lib/prisma";
import { agingBucket, billDueDate, type AgingBucket } from "./payables";

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

export type OpenPayable = { id: string; vendor: string; amount: number; date: Date; dueDate: Date; invoiceNo: string | null; msme: boolean; bucket: AgingBucket };

/** Every approved bill still waiting to be paid, with the date it is due. */
export async function openPayables(workspaceId: string, now = new Date()): Promise<OpenPayable[]> {
  const rows = await prisma.expense.findMany({
    where: { workspaceId, approvalStatus: "APPROVED", paymentStatus: "UNPAID" },
    include: { vendorRecord: { select: { paymentTermsDays: true } } },
    orderBy: { date: "asc" }, take: 2000,
  });
  return rows.map((e) => {
    const dueDate = billDueDate({ date: e.date, dueDate: e.dueDate, vendorMsme: e.vendorMsme, vendorAgreedDays: e.vendorAgreedDays, vendorTermsDays: e.vendorRecord?.paymentTermsDays });
    return { id: e.id, vendor: e.vendor, amount: num(e.amount), date: e.date, dueDate, invoiceNo: e.vendorInvoiceNo, msme: e.vendorMsme === "MICRO" || e.vendorMsme === "SMALL", bucket: agingBucket(dueDate, now) };
  });
}

/** Payables ageing: how much is not yet due and how late the rest is. */
export function ageing(items: OpenPayable[]): Record<AgingBucket, { count: number; amount: number }> {
  const out: Record<AgingBucket, { count: number; amount: number }> = { NOT_DUE: { count: 0, amount: 0 }, D1_30: { count: 0, amount: 0 }, D31_60: { count: 0, amount: 0 }, D61_90: { count: 0, amount: 0 }, D90_PLUS: { count: 0, amount: 0 } };
  for (const i of items) { out[i.bucket].count += 1; out[i.bucket].amount = r2(out[i.bucket].amount + i.amount); }
  return out;
}

/** Outflows for the cash forecast: each unpaid bill lands on its due date (overdue bills land today). */
export async function payablesForForecast(workspaceId: string, now: Date) {
  const items = await openPayables(workspaceId, now);
  return items.map((i) => ({ id: i.id, vendor: i.vendor, amount: i.amount, dueDate: i.dueDate.getTime() < now.getTime() ? now : i.dueDate, overdue: i.dueDate.getTime() < now.getTime(), invoiceNo: i.invoiceNo, msme: i.msme }));
}
