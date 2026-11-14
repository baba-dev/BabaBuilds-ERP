// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    bankTransaction: { findFirst: vi.fn(), updateMany: vi.fn() },
    expense: { findFirst: vi.fn(), updateMany: vi.fn() },
    invoice: { findFirst: vi.fn(), update: vi.fn() },
    bankTransactionInvoiceSplit: { create: vi.fn() },
  };
  return { tx, createExpense: vi.fn(), prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/expenses/create-expense-with-side-effects", () => ({ createExpenseWithSideEffectsTx: mocks.createExpense }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn() }));

const line = (over: Record<string, unknown> = {}) => ({ id: "b1", amount: -1180, date: new Date("2026-11-03T00:00:00Z"), description: "UPI AWS INDIA 998", isReconciled: false, matchedExpenseId: null, matchedInvoiceId: null, account: { currency: "INR" }, ...over });
const invoice = (over: Record<string, unknown> = {}) => ({ id: "i1", currency: "INR", totalAmount: 5000, grandTotal: 5000, amountReceived: 0, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.tx.bankTransaction.updateMany.mockResolvedValue({ count: 1 });
  mocks.createExpense.mockResolvedValue({ id: "e1" });
});

describe("commitReconciliationTransactions", () => {
  it("takes the amount, date and description from the stored bank line, not the request", async () => {
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line());
    const { commitReconciliationTransactions } = await import("@/lib/reconciliation/commit");
    const r = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [], approvedExpenses: [{ bankTransactionId: "b1", aiVendor: "AWS", aiCategory: "Hosting & Cloud", amount: 1, date: "1999-01-01" }] });
    expect(r.ok).toBe(true);
    expect(mocks.createExpense).toHaveBeenCalledWith(mocks.tx, expect.objectContaining({ amount: 1180, vendor: "AWS", source: "BANK", date: new Date("2026-11-03T00:00:00.000Z") }));
  });

  it("skips a line that is already matched, and one that loses the race for it", async () => {
    const { commitReconciliationTransactions } = await import("@/lib/reconciliation/commit");
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line({ isReconciled: true }));
    const done = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [], approvedExpenses: [{ bankTransactionId: "b1" }] });
    expect(done).toMatchObject({ ok: false, status: 422 });
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line());
    mocks.tx.bankTransaction.updateMany.mockResolvedValue({ count: 0 });
    const raced = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [], approvedExpenses: [{ bankTransactionId: "b1" }] });
    expect(raced).toMatchObject({ ok: false, body: { skipped: [{ reason: "ALREADY_RECONCILED" }] } });
  });

  it("refuses a credit as an expense and a debit as an invoice payment", async () => {
    const { commitReconciliationTransactions } = await import("@/lib/reconciliation/commit");
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line({ amount: 500 }));
    const a = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [], approvedExpenses: [{ bankTransactionId: "b1" }] });
    expect(a).toMatchObject({ ok: false, body: { skipped: [{ reason: "WRONG_DIRECTION" }] } });
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line({ amount: -500 }));
    const b = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [{ bankTransactionId: "b1", matchId: "INV-1" }], approvedExpenses: [] });
    expect(b).toMatchObject({ ok: false, body: { skipped: [{ reason: "WRONG_DIRECTION" }] } });
  });

  it("applies a credit to an invoice and marks it paid on the bank date", async () => {
    const { commitReconciliationTransactions } = await import("@/lib/reconciliation/commit");
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line({ amount: 5000 }));
    mocks.tx.invoice.findFirst.mockResolvedValue(invoice());
    const r = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [{ bankTransactionId: "b1", matchId: "INV-1" }], approvedExpenses: [] });
    expect(r.ok).toBe(true);
    expect(mocks.tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PAID", amountReceived: 5000, dateReceived: new Date("2026-11-03T00:00:00.000Z") }) }));
  });

  it("does not take more than is owed, and does not mix currencies", async () => {
    const { commitReconciliationTransactions } = await import("@/lib/reconciliation/commit");
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line({ amount: 6000 }));
    mocks.tx.invoice.findFirst.mockResolvedValue(invoice());
    const over = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [{ bankTransactionId: "b1", matchId: "INV-1" }], approvedExpenses: [] });
    expect(over).toMatchObject({ ok: false, body: { skipped: [{ reason: "OVERPAYMENT" }] } });
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line({ amount: 5000 }));
    mocks.tx.invoice.findFirst.mockResolvedValue(invoice({ currency: "USD" }));
    const fx = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [{ bankTransactionId: "b1", matchId: "INV-1" }], approvedExpenses: [] });
    expect(fx).toMatchObject({ ok: false, body: { skipped: [{ reason: "CURRENCY_MISMATCH" }] } });
    expect(mocks.tx.invoice.update).not.toHaveBeenCalled();
  });

  it("linking a debit to an unpaid bill settles it on the bank date, and rejects a different amount", async () => {
    const { commitReconciliationTransactions } = await import("@/lib/reconciliation/commit");
    mocks.tx.bankTransaction.findFirst.mockResolvedValue(line());
    mocks.tx.expense.findFirst.mockResolvedValue({ id: "e9", amount: 1180, category: "Hosting & Cloud" });
    const ok = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [], approvedExpenses: [{ bankTransactionId: "b1", linkToExpenseId: "e9" }] });
    expect(ok.ok).toBe(true);
    expect(mocks.tx.expense.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentStatus: "PAID", paidAt: new Date("2026-11-03T00:00:00.000Z") } }));
    mocks.tx.expense.findFirst.mockResolvedValue({ id: "e9", amount: 900, category: "Hosting & Cloud" });
    const bad = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [], approvedExpenses: [{ bankTransactionId: "b1", linkToExpenseId: "e9" }] });
    expect(bad).toMatchObject({ ok: false, body: { skipped: [{ reason: "AMOUNT_MISMATCH" }] } });
  });

  it("applies the good lines and reports the skipped ones", async () => {
    const { commitReconciliationTransactions } = await import("@/lib/reconciliation/commit");
    mocks.tx.bankTransaction.findFirst.mockResolvedValueOnce(line()).mockResolvedValueOnce(null);
    const r = await commitReconciliationTransactions({ workspaceId: "ws", approvedInvoices: [], approvedExpenses: [{ bankTransactionId: "b1" }, { bankTransactionId: "gone" }] });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.body.expensesCreated).toBe(1); expect(r.body.skipped).toEqual([expect.objectContaining({ id: "gone", reason: "NOT_FOUND" })]); }
  });
});
