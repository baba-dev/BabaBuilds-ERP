import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { createExpenseWithSideEffectsTx } from '@/lib/expenses/create-expense-with-side-effects';
import { normalizeExpenseCore } from '@/lib/expenses/validate';
import { logActivity } from '@/lib/security/activity-log';
import { invalidateDashboardCacheForWorkspace } from '@/lib/dashboard-cache';

type InvoiceSplitLine = { invoiceNumber: string; amount: number };

/**
 * What the review screen sends. Only the choices travel (which invoice, which category); the amount, date and description are
 * always read from the stored bank line, so a request cannot invent them.
 */
type ReconciliationTransaction = {
  id?: string;
  bankTransactionId?: string;
  aiCategory?: string;
  aiVendor?: string;
  description?: string;
  matchId?: string;
  confidence?: number;
  /** Apply one bank credit across several invoices. */
  invoiceSplits?: InvoiceSplitLine[];
  /** Link a debit to an existing expense instead of creating one. */
  linkToExpenseId?: string;
  // Legacy fields still sent by older clients; ignored.
  date?: string;
  amount?: string | number;
};

type CommitInput = { workspaceId: string; approvedInvoices: ReconciliationTransaction[]; approvedExpenses: ReconciliationTransaction[]; actorUserId?: string };

export type SkipReason = 'NOT_FOUND' | 'ALREADY_RECONCILED' | 'WRONG_DIRECTION' | 'NO_INVOICE' | 'INVOICE_NOT_FOUND' | 'CURRENCY_MISMATCH' | 'OVERPAYMENT' | 'SPLIT_EXCEEDS_BANK_AMOUNT' | 'EXPENSE_NOT_FOUND' | 'AMOUNT_MISMATCH' | 'INVALID';
export type SkippedRow = { id: string; reason: SkipReason; message: string };

type CommitSuccess = { ok: true; status: 200; body: { success: true; message: string; expensesCreated: number; invoicesReconciled: number; bankTransactionsUpdated: number; splitsCreated: number; skipped: SkippedRow[] } };
type CommitError = { ok: false; status: 400 | 422 | 500; body: { error: string; skipped?: SkippedRow[] } };
export type CommitResult = CommitSuccess | CommitError;

class Skip extends Error {
  constructor(public reason: SkipReason, message: string) { super(message); }
}

const TOLERANCE = new Prisma.Decimal('0.01');
const dec = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);

async function loadLine(tx: Prisma.TransactionClient, workspaceId: string, id: string) {
  const bt = await tx.bankTransaction.findFirst({ where: { id, workspaceId }, include: { account: { select: { currency: true } } } });
  if (!bt) throw new Skip('NOT_FOUND', 'That bank line no longer exists.');
  if (bt.isReconciled || bt.matchedExpenseId || bt.matchedInvoiceId) throw new Skip('ALREADY_RECONCILED', 'That bank line is already matched.');
  return bt;
}

/** Marks the line matched in one atomic step; a second request for the same line loses the race and is skipped. */
async function claim(tx: Prisma.TransactionClient, workspaceId: string, id: string, data: Prisma.BankTransactionUncheckedUpdateManyInput) {
  const res = await tx.bankTransaction.updateMany({ where: { id, workspaceId, isReconciled: false, matchedExpenseId: null, matchedInvoiceId: null }, data: { ...data, isReconciled: true, ignoredAt: null } });
  if (res.count === 0) throw new Skip('ALREADY_RECONCILED', 'That bank line is already matched.');
}

async function commitExpense(workspaceId: string, row: ReconciliationTransaction, actorUserId: string | undefined) {
  const id = row.bankTransactionId ?? row.id ?? '';
  return prisma.$transaction(async (tx) => {
    const bt = await loadLine(tx, workspaceId, id);
    if (dec(bt.amount).gte(0)) throw new Skip('WRONG_DIRECTION', 'Only money going out can become an expense.');
    const amount = dec(bt.amount).abs();
    const confidence = typeof row.confidence === 'number' ? row.confidence : null;

    if (row.linkToExpenseId) {
      const exp = await tx.expense.findFirst({ where: { id: row.linkToExpenseId, workspaceId } });
      if (!exp) throw new Skip('EXPENSE_NOT_FOUND', 'The expense to link was not found.');
      if (dec(exp.amount).minus(amount).abs().gt(new Prisma.Decimal('0.02'))) throw new Skip('AMOUNT_MISMATCH', 'The expense and the bank line are for different amounts.');
      await claim(tx, workspaceId, id, { matchedExpenseId: exp.id, reconciliationConfidence: confidence, category: exp.category });
      // A debit that settles a bill on credit marks it paid on the bank date (rule 37 and 43B(h) read this date).
      await tx.expense.updateMany({ where: { id: exp.id, workspaceId, paymentStatus: 'UNPAID' }, data: { paymentStatus: 'PAID', paidAt: bt.date } });
      return { created: false };
    }

    const core = normalizeExpenseCore({ vendor: row.aiVendor || 'Unknown Vendor', category: row.aiCategory || 'Other', amount: amount.toNumber(), date: bt.date.toISOString().slice(0, 10), description: row.description || bt.description.slice(0, 300) });
    if (!core.ok) throw new Skip('INVALID', 'The vendor or category is not valid.');
    const c = core.data as { vendor: string; category: string; amount: number; date: Date; description: string | null };
    const created = await createExpenseWithSideEffectsTx(tx, { workspaceId, userId: actorUserId ?? 'system-reconciliation', date: c.date, amount: c.amount, category: c.category, vendor: c.vendor, description: c.description, source: 'BANK' });
    await claim(tx, workspaceId, id, { matchedExpenseId: created.id, reconciliationConfidence: confidence, category: c.category });
    return { created: true };
  });
}

async function commitInvoice(workspaceId: string, row: ReconciliationTransaction) {
  const id = row.bankTransactionId ?? row.id ?? '';
  return prisma.$transaction(async (tx) => {
    const bt = await loadLine(tx, workspaceId, id);
    const bankAmount = dec(bt.amount);
    if (bankAmount.lte(0)) throw new Skip('WRONG_DIRECTION', 'Only money coming in can be applied to an invoice.');

    const wanted: InvoiceSplitLine[] = Array.isArray(row.invoiceSplits) && row.invoiceSplits.length > 0
      ? row.invoiceSplits.filter((s) => s && typeof s.invoiceNumber === 'string' && Number(s.amount) > 0)
      : row.matchId ? [{ invoiceNumber: row.matchId, amount: bankAmount.toNumber() }] : [];
    if (wanted.length === 0) throw new Skip('NO_INVOICE', 'Choose the invoice this payment is for.');
    const total = wanted.reduce((s, l) => s.plus(dec(l.amount)), new Prisma.Decimal(0));
    if (total.minus(bankAmount).gt(TOLERANCE)) throw new Skip('SPLIT_EXCEEDS_BANK_AMOUNT', 'The amounts applied add up to more than the bank credit.');

    const accountCurrency = (bt.account?.currency ?? 'INR').toUpperCase();
    let primary: string | null = null;
    let splits = 0;
    for (const line of wanted) {
      const inv = await tx.invoice.findFirst({ where: { workspaceId, invoiceNumber: line.invoiceNumber, status: { in: ['PENDING', 'PARTIALLY_PAID'] } }, select: { id: true, currency: true, totalAmount: true, grandTotal: true, amountReceived: true } });
      if (!inv) throw new Skip('INVOICE_NOT_FOUND', `Invoice ${line.invoiceNumber} is not open.`);
      if ((inv.currency ?? 'INR').toUpperCase() !== accountCurrency) throw new Skip('CURRENCY_MISMATCH', `Invoice ${line.invoiceNumber} is in ${inv.currency}, the bank account is in ${accountCurrency}.`);
      const billed = dec(inv.grandTotal ?? inv.totalAmount);
      const received = dec(inv.amountReceived);
      const amount = dec(line.amount).toDecimalPlaces(2);
      const next = received.plus(amount).toDecimalPlaces(2);
      if (next.minus(billed).gt(TOLERANCE)) throw new Skip('OVERPAYMENT', `Invoice ${line.invoiceNumber} has only ${billed.minus(received).toFixed(2)} outstanding.`);
      const status = next.gte(billed.minus(new Prisma.Decimal('0.005'))) ? 'PAID' : 'PARTIALLY_PAID';
      await tx.invoice.update({ where: { id: inv.id }, data: { status, amountReceived: next.toNumber(), dateReceived: bt.date } });
      await tx.bankTransactionInvoiceSplit.create({ data: { bankTransactionId: bt.id, invoiceId: inv.id, amount } });
      splits += 1;
      primary = primary ?? inv.id;
    }
    await claim(tx, workspaceId, id, { matchedInvoiceId: primary, reconciliationConfidence: typeof row.confidence === 'number' ? row.confidence : 100 });
    return { splits };
  });
}

export async function commitReconciliationTransactions({ workspaceId, approvedInvoices, approvedExpenses, actorUserId }: CommitInput): Promise<CommitResult> {
  if (!Array.isArray(approvedInvoices) || !Array.isArray(approvedExpenses)) {
    return { ok: false, status: 400, body: { error: 'Invalid payload: approvedInvoices and approvedExpenses must be arrays.' } };
  }
  if (approvedInvoices.length === 0 && approvedExpenses.length === 0) {
    return { ok: false, status: 400, body: { error: 'Nothing to commit. Approve at least one transaction first.' } };
  }
  if (approvedInvoices.length + approvedExpenses.length > 500) {
    return { ok: false, status: 400, body: { error: 'Too many lines in one go. Commit at most 500 at a time.' } };
  }

  let expensesCreated = 0; let invoicesReconciled = 0; let bankTransactionsUpdated = 0; let splitsCreated = 0;
  const skipped: SkippedRow[] = [];
  const run = async (row: ReconciliationTransaction, fn: () => Promise<void>) => {
    try { await fn(); } catch (error) {
      if (error instanceof Skip) { skipped.push({ id: row.bankTransactionId ?? row.id ?? '', reason: error.reason, message: error.message }); return; }
      console.error('Reconciliation commit row failed:', error);
      skipped.push({ id: row.bankTransactionId ?? row.id ?? '', reason: 'INVALID', message: 'This line could not be saved.' });
    }
  };

  try {
    for (const row of approvedExpenses) {
      await run(row, async () => { const r = await commitExpense(workspaceId, row, actorUserId); if (r.created) expensesCreated += 1; bankTransactionsUpdated += 1; });
    }
    for (const row of approvedInvoices) {
      await run(row, async () => { const r = await commitInvoice(workspaceId, row); invoicesReconciled += 1; splitsCreated += r.splits; bankTransactionsUpdated += 1; });
    }
  } catch (error) {
    console.error('Reconciliation Commit Error:', error);
    return { ok: false, status: 500, body: { error: 'Failed to write to ledger. Please try again.' } };
  }

  if (bankTransactionsUpdated === 0) {
    return { ok: false, status: 422, body: { error: 'None of these lines could be matched.', skipped } };
  }
  void logActivity({ action: 'reconciliation_committed', status: 'SUCCESS', workspaceId, actor: { userId: actorUserId }, metadata: { matched: bankTransactionsUpdated, expensesCreated, invoicesReconciled, skipped: skipped.length } });
  try { await invalidateDashboardCacheForWorkspace(workspaceId); } catch { /* the cache is advisory */ }
  return {
    ok: true, status: 200,
    body: {
      success: true,
      message: `Matched ${bankTransactionsUpdated} bank line(s): ${expensesCreated} expense(s) logged, ${invoicesReconciled} invoice(s) reconciled${skipped.length ? `, ${skipped.length} skipped` : ''}.`,
      expensesCreated, invoicesReconciled, bankTransactionsUpdated, splitsCreated, skipped,
    },
  };
}
