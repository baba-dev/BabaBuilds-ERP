import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { containsInsensitive } from "@/lib/prisma-filters";
import { logActivity } from "@/lib/security/activity-log";
import { invalidateDashboardCacheForWorkspace } from "@/lib/dashboard-cache";
import { rankInvoiceMatchesForCredit } from "./invoice-match";
import { rankExpenseMatchesForDebit } from "./expense-match";
import { rankPurchaseOrdersForDebit } from "./po-match";
import { getOrCreateReconciliationSettings } from "./reconciliation-settings";
import { deleteExpenses } from "@/lib/expenses/service";
import type { ReconCtx } from "./access";

const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;
const DAY = 86_400_000;

/** The numbers at the top of the workspace: what is matched, what is waiting, and where the balance stands. */
export async function reconciliationSummary(workspaceId: string, accountId?: string) {
  const base: Prisma.BankTransactionWhereInput = { workspaceId, ...(accountId ? { accountId } : {}) };
  const open: Prisma.BankTransactionWhereInput = { ...base, isReconciled: false, ignoredAt: null, isInternalTransfer: false };
  const [total, reconciled, ignored, transfers, openDebit, openCredit, openCount, lastImport, accounts, oldest] = await Promise.all([
    prisma.bankTransaction.count({ where: base }),
    prisma.bankTransaction.count({ where: { ...base, isReconciled: true } }),
    prisma.bankTransaction.count({ where: { ...base, isReconciled: false, ignoredAt: { not: null } } }),
    prisma.bankTransaction.count({ where: { ...base, isInternalTransfer: true, isReconciled: false } }),
    prisma.bankTransaction.aggregate({ where: { ...open, amount: { lt: 0 } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.bankTransaction.aggregate({ where: { ...open, amount: { gt: 0 } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.bankTransaction.count({ where: open }),
    prisma.bankImportBatch.findFirst({ where: { workspaceId, ...(accountId ? { accountId } : {}), status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, fileName: true, rowCount: true } }),
    prisma.bankAccount.findMany({ where: { workspaceId, ...(accountId ? { id: accountId } : {}) }, select: { id: true, name: true, currency: true, openingBalance: true, openingBalanceDate: true } }),
    prisma.bankTransaction.findFirst({ where: open, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  let balance = 0;
  for (const a of accounts) {
    const sum = await prisma.bankTransaction.aggregate({ where: { workspaceId, accountId: a.id, date: { gte: a.openingBalanceDate } }, _sum: { amount: true } });
    balance += num(a.openingBalance) + num(sum._sum.amount);
  }
  const countable = total - ignored - transfers;
  return {
    total, reconciled, ignored, transfers, waiting: openCount,
    waitingDebit: { count: openDebit._count._all, amount: r2(Math.abs(num(openDebit._sum.amount))) },
    waitingCredit: { count: openCredit._count._all, amount: r2(num(openCredit._sum.amount)) },
    reconciledPercent: countable > 0 ? Math.round((reconciled / countable) * 100) : 100,
    oldestWaitingDays: oldest ? Math.max(0, Math.floor((Date.now() - oldest.date.getTime()) / DAY)) : null,
    lastImport: lastImport ? { at: lastImport.createdAt.toISOString(), fileName: lastImport.fileName, rows: lastImport.rowCount } : null,
    balance: accounts.length === 1 ? r2(balance) : null,
    currency: accounts.length === 1 ? accounts[0].currency : null,
  };
}

export type QueueQuery = { accountId?: string; direction?: "debit" | "credit"; q?: string; view?: "waiting" | "ignored" | "transfers"; limit?: number; offset?: number };

/** Lines still waiting for a decision, each with the best matches worked out now (so nothing is lost when the page is left). */
export async function reconciliationQueue(workspaceId: string, query: QueueQuery) {
  const take = Math.min(50, Math.max(1, Math.trunc(query.limit ?? 25)));
  const skip = Math.max(0, Math.trunc(query.offset ?? 0));
  const view = query.view ?? "waiting";
  const where: Prisma.BankTransactionWhereInput = {
    workspaceId, isReconciled: false,
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(view === "ignored" ? { ignoredAt: { not: null } } : view === "transfers" ? { isInternalTransfer: true, ignoredAt: null } : { ignoredAt: null, isInternalTransfer: false }),
    ...(query.direction === "debit" ? { amount: { lt: 0 } } : query.direction === "credit" ? { amount: { gt: 0 } } : {}),
    ...(query.q?.trim() ? { OR: [{ description: containsInsensitive(query.q.trim()) }, { referenceId: containsInsensitive(query.q.trim()) }] } : {}),
  };
  const [rows, total, settings] = await Promise.all([
    prisma.bankTransaction.findMany({ where, orderBy: { date: "desc" }, take, skip, include: { account: { select: { id: true, name: true, currency: true } } } }),
    prisma.bankTransaction.count({ where }),
    getOrCreateReconciliationSettings(workspaceId),
  ]);
  const needsInvoices = rows.some((r) => num(r.amount) > 0);
  const needsExpenses = rows.some((r) => num(r.amount) < 0);
  const [invoices, expenses, pos] = await Promise.all([
    needsInvoices ? prisma.invoice.findMany({ where: { workspaceId, status: { in: ["PENDING", "PARTIALLY_PAID"] } }, take: 500, orderBy: { invoiceDate: "desc" } }) : Promise.resolve([]),
    needsExpenses ? prisma.expense.findMany({ where: { workspaceId, approvalStatus: { in: ["APPROVED", "PENDING"] }, OR: [{ paymentStatus: "UNPAID" }, { date: { gte: new Date(Date.now() - 120 * DAY) } }] }, orderBy: { date: "desc" }, take: 500 }) : Promise.resolve([]),
    needsExpenses ? prisma.purchaseOrder.findMany({ where: { workspaceId, status: { in: ["SENT", "DELIVERED"] } }, take: 200 }) : Promise.resolve([]),
  ]);
  // A matched expense or invoice can only be offered to one line at a time on this page.
  const claimed = new Set<string>();
  const data = rows.map((r) => {
    const amount = num(r.amount);
    const base = { id: r.id, date: r.date.toISOString(), description: r.description, reference: r.referenceId, amount: Math.abs(amount), type: amount < 0 ? "DEBIT" as const : "CREDIT" as const, accountId: r.accountId, accountName: r.account?.name ?? null, currency: r.account?.currency ?? "INR", category: r.category, isInternalTransfer: r.isInternalTransfer, ignoredAt: r.ignoredAt ? r.ignoredAt.toISOString() : null };
    if (amount > 0) {
      const ranked = rankInvoiceMatchesForCredit({ invoices: invoices.filter((i) => !claimed.has(i.id)), amount, bankDate: r.date, narration: r.description, reference: r.referenceId }).slice(0, 3);
      if (ranked[0] && ranked[0].score >= settings.autoMatchMinScore) claimed.add(ranked[0].invoice.id);
      return { ...base, ready: Boolean(ranked[0] && ranked[0].score >= settings.autoMatchMinScore), invoices: ranked.map((c) => ({ invoiceNumber: c.invoice.invoiceNumber, clientName: c.invoice.clientName, outstanding: r2(Math.max(0, num(c.invoice.grandTotal ?? c.invoice.totalAmount) - num(c.invoice.amountReceived))), currency: c.invoice.currency, score: c.score, reasons: c.reasons })), expenses: [], pos: [] };
    }
    const exp = rankExpenseMatchesForDebit({ expenses: expenses.filter((e) => !claimed.has(e.id)), amount: Math.abs(amount), narration: r.description }).slice(0, 3);
    const po = rankPurchaseOrdersForDebit({ orders: pos, amount: Math.abs(amount), narration: r.description }).slice(0, 2);
    if (exp[0] && exp[0].score >= settings.autoMatchMinScore) claimed.add(exp[0].expense.id);
    return { ...base, ready: Boolean(exp[0] && exp[0].score >= settings.autoMatchMinScore), invoices: [], expenses: exp.map((c) => ({ expenseId: c.expense.id, vendor: c.expense.vendor, amount: num(c.expense.amount), date: c.expense.date.toISOString(), unpaid: c.expense.paymentStatus === "UNPAID", score: c.score, reasons: c.reasons })), pos: po.map((c) => ({ poNumber: c.purchaseOrder.poNumber, supplier: c.purchaseOrder.supplier, score: c.score, reasons: c.reasons })) };
  });
  return { data, total, settings: { autoMatchMinScore: settings.autoMatchMinScore, autoMatchSuggestionMin: settings.autoMatchSuggestionMin } };
}

export async function setIgnored(ctx: ReconCtx, ids: string[], ignored: boolean) {
  const res = await prisma.bankTransaction.updateMany({ where: { id: { in: ids }, workspaceId: ctx.workspaceId, isReconciled: false }, data: { ignoredAt: ignored ? new Date() : null } });
  void logActivity({ action: ignored ? "reconciliation_ignored" : "reconciliation_restored", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "bank_transaction", id: ids[0] }, metadata: { count: res.count } });
  return res.count;
}

export type UnmatchResult = { ok: true; reversedInvoices: number; removedExpense: boolean; reopenedBill: boolean } | { ok: false; status: number; code: string; message: string };

/**
 * Reverses a match: receipts taken from invoices are given back, an expense the match created is removed (unless it was since
 * billed), a bill the match marked paid is reopened, and the bank line goes back to the inbox.
 */
export async function unmatchBankTransaction(ctx: ReconCtx, bankTransactionId: string): Promise<UnmatchResult> {
  const bt = await prisma.bankTransaction.findFirst({ where: { id: bankTransactionId, workspaceId: ctx.workspaceId }, include: { invoiceSplits: true } });
  if (!bt) return { ok: false, status: 404, code: "NOT_FOUND", message: "Bank line not found." };
  if (!bt.isReconciled) return { ok: false, status: 409, code: "NOT_MATCHED", message: "That bank line is not matched." };

  let reversedInvoices = 0; let removedExpense = false; let reopenedBill = false;
  let expenseToRemove: string | null = null;
  await prisma.$transaction(async (tx) => {
    const lines = bt.invoiceSplits.length > 0 ? bt.invoiceSplits.map((s) => ({ invoiceId: s.invoiceId, amount: num(s.amount) })) : bt.matchedInvoiceId ? [{ invoiceId: bt.matchedInvoiceId, amount: Math.abs(num(bt.amount)) }] : [];
    for (const l of lines) {
      const inv = await tx.invoice.findFirst({ where: { id: l.invoiceId, workspaceId: ctx.workspaceId }, select: { id: true, amountReceived: true, status: true } });
      if (!inv) continue;
      const left = Math.max(0, r2(num(inv.amountReceived) - l.amount));
      await tx.invoice.update({ where: { id: inv.id }, data: { amountReceived: left, status: inv.status === "VOID" ? "VOID" : left <= 0 ? "PENDING" : "PARTIALLY_PAID", ...(left <= 0 ? { dateReceived: null } : {}) } });
      reversedInvoices += 1;
    }
    if (bt.invoiceSplits.length > 0) await tx.bankTransactionInvoiceSplit.deleteMany({ where: { bankTransactionId: bt.id } });

    if (bt.matchedExpenseId) {
      const e = await tx.expense.findFirst({ where: { id: bt.matchedExpenseId, workspaceId: ctx.workspaceId } });
      if (e) {
        if (e.source === "BANK" && !e.billedInvoiceId) expenseToRemove = e.id;
        else if (e.paymentStatus === "PAID" && e.paidAt && e.paidAt.getTime() === bt.date.getTime() && e.dueDate) {
          // Only a match sets the payment date to the bank date, so this bill was paid by this match.
          await tx.expense.update({ where: { id: e.id }, data: { paymentStatus: "UNPAID", paidAt: null } });
          reopenedBill = true;
        }
      }
    }
    await tx.bankTransaction.update({ where: { id: bt.id }, data: { isReconciled: false, matchedInvoiceId: null, matchedExpenseId: null, reconciliationConfidence: null } });
  });
  if (expenseToRemove) { const r = await deleteExpenses({ workspaceId: ctx.workspaceId, userId: ctx.userId, email: ctx.email, countryCode: "IN" }, [expenseToRemove]); removedExpense = r.ok; }
  void logActivity({ action: "reconciliation_unmatched", status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId, email: ctx.email ?? undefined }, entity: { type: "bank_transaction", id: bt.id }, metadata: { reversedInvoices, removedExpense, reopenedBill } });
  try { invalidateDashboardCacheForWorkspace(ctx.workspaceId); } catch { /* the cache is advisory */ }
  return { ok: true, reversedInvoices, removedExpense, reopenedBill };
}
