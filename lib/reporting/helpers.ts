import 'server-only';
import { prisma } from '@/lib/prisma';
import type { PeriodRange } from '@/lib/expenses/period';
import type { Ctx, Row } from '@/lib/reporting/types';

export const num = (v: unknown) => { const n = Number(v?.toString?.() ?? v ?? 0); return Number.isFinite(n) ? n : 0; };
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const month = (d: Date) => d.toISOString().slice(0, 7);
export const DAY = 86_400_000;
export const empty = { totals: null, chart: null, notes: [] as string[], truncated: false };

export const dateWhere = (field: string, range: PeriodRange) => (range.from || range.to ? { [field]: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } } : {});
export const sumRow = (rows: Row[], keys: string[], extra: Row = {}): Row => ({ ...Object.fromEntries(keys.map((k) => [k, r2(rows.reduce((s, r) => s + num(r[k]), 0))])), ...extra });

export async function invoicesIn(ctx: Ctx) {
  return prisma.invoice.findMany({
    where: { workspaceId: ctx.workspaceId, status: { not: 'VOID' }, voidedAt: null, ...dateWhere('invoiceDate', ctx.range) },
    select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, clientId: true, clientName: true, subtotal: true, taxRate: true, taxAmount: true, grandTotal: true, totalAmount: true, exchangeRate: true, status: true, amountReceived: true, currency: true },
    orderBy: { invoiceDate: 'desc' }, take: 20_000,
  });
}
/** Net of GST the business can claim back, so a rupee of recoverable tax is not counted as a cost. */
export async function expensesIn(ctx: Ctx, extraWhere: Record<string, unknown> = {}) {
  return prisma.expense.findMany({
    where: { workspaceId: ctx.workspaceId, approvalStatus: 'APPROVED', ...dateWhere('date', ctx.range), ...extraWhere },
    select: { id: true, date: true, vendor: true, category: true, amount: true, paymentStatus: true, clientId: true, billable: true, itcStatus: true, itcHeld: true, igstAmount: true, cgstAmount: true, sgstAmount: true, cessAmount: true, description: true },
    orderBy: { date: 'desc' }, take: 20_000,
  });
}
export const claimable = (e: { itcStatus: string; itcHeld: boolean; igstAmount: unknown; cgstAmount: unknown; sgstAmount: unknown; cessAmount: unknown }) =>
  e.itcStatus === 'ELIGIBLE' && !e.itcHeld ? num(e.igstAmount) + num(e.cgstAmount) + num(e.sgstAmount) + num(e.cessAmount) : 0;
export const netCost = (e: Parameters<typeof claimable>[0] & { amount: unknown }) => num(e.amount) - claimable(e);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export type InvAmounts = { grandTotal: unknown; totalAmount: unknown; taxAmount: unknown; exchangeRate: unknown };
export const rate = (i: { exchangeRate: unknown }) => num(i.exchangeRate) || 1;
/** What was billed, with tax, as the app records it (older invoices only have the total). */
export const gross = (i: InvAmounts) => num(i.totalAmount) || num(i.grandTotal);
/** Revenue before tax, in the workspace currency. */
export const netRev = (i: InvAmounts) => Math.max(0, gross(i) - num(i.taxAmount)) * rate(i);

