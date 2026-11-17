import "server-only";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { invalidateDashboardCacheForWorkspace } from "@/lib/dashboard-cache";
import type { ExpenseCtx } from "./access";

const DAY = 86_400_000;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

/** Bank debits that could be the payment for this expense: same amount, not matched yet, close in time (bills on credit may be paid much later). */
export async function bankMatchesForExpense(workspaceId: string, expenseId: string) {
  const e = await prisma.expense.findFirst({ where: { id: expenseId, workspaceId } });
  if (!e) return null;
  const amount = num(e.amount);
  const unpaid = e.paymentStatus === "UNPAID";
  const from = new Date(e.date.getTime() - 7 * DAY);
  const to = new Date(e.date.getTime() + (unpaid ? 180 : 14) * DAY);
  const rows = await prisma.bankTransaction.findMany({ where: { workspaceId, isReconciled: false, matchedExpenseId: null, isInternalTransfer: false, amount: { lt: 0 }, date: { gte: from, lte: to } }, orderBy: { date: "asc" }, take: 300 });
  const vendor = e.vendor.trim().toLowerCase().slice(0, 12);
  return rows
    .filter((t) => Math.abs(Math.abs(num(t.amount)) - amount) <= 0.02)
    .map((t) => {
      const days = Math.abs(t.date.getTime() - e.date.getTime()) / DAY;
      const named = vendor.length >= 3 && t.description.toLowerCase().includes(vendor);
      return { id: t.id, date: t.date.toISOString(), description: t.description, amount: Math.abs(num(t.amount)), score: Math.max(0, 60 - Math.min(days, 60)) + (named ? 40 : 0), vendorInNarration: named };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Links a bank debit to an expense and, for a bill on credit, records it as paid on the bank date. */
export async function linkBankTransaction(ctx: ExpenseCtx, expenseId: string, bankTransactionId: string) {
  const [e, t] = await Promise.all([prisma.expense.findFirst({ where: { id: expenseId, workspaceId: ctx.workspaceId } }), prisma.bankTransaction.findFirst({ where: { id: bankTransactionId, workspaceId: ctx.workspaceId } })]);
  if (!e || !t) return { ok: false as const, status: 404, code: "NOT_FOUND", message: "Expense or bank line not found." };
  if (t.matchedExpenseId || t.matchedInvoiceId || t.isReconciled) return { ok: false as const, status: 409, code: "ALREADY_MATCHED", message: "That bank line is already matched." };
  if (Math.abs(Math.abs(num(t.amount)) - num(e.amount)) > 0.02 || num(t.amount) >= 0) return { ok: false as const, status: 422, code: "AMOUNT_MISMATCH", message: "The bank line is not a payment of the same amount." };
  await prisma.$transaction([
    prisma.bankTransaction.update({ where: { id: t.id }, data: { matchedExpenseId: e.id, isReconciled: true, reconciliationConfidence: 100, category: e.category } }),
    ...(e.paymentStatus === "UNPAID" ? [prisma.expense.update({ where: { id: e.id }, data: { paymentStatus: "PAID", paidAt: t.date } })] : []),
  ]);
  void logActivity({ action: "expense_bank_matched", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "expense", id: e.id }, metadata: { bankTransactionId: t.id, markedPaid: e.paymentStatus === "UNPAID" } });
  try { await invalidateDashboardCacheForWorkspace(ctx.workspaceId); } catch { /* cache is advisory */ }
  return { ok: true as const, markedPaid: e.paymentStatus === "UNPAID" };
}

/** Which of these expenses already have a matched bank line (for the "reconciled" badge). */
export async function reconciledExpenseIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.bankTransaction.findMany({ where: { workspaceId, matchedExpenseId: { in: ids } }, select: { matchedExpenseId: true } });
  return new Set(rows.map((r) => r.matchedExpenseId).filter((x): x is string => Boolean(x)));
}
