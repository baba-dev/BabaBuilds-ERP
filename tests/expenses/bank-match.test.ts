// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    expense: { findFirst: vi.fn(), update: vi.fn() },
    bankTransaction: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn() }));

const ctx = { workspaceId: "ws", userId: "u1", email: null, countryCode: "IN" };
const expense = (over: Record<string, unknown> = {}) => ({ id: "e1", vendor: "WeWork India", amount: 42000, date: new Date("2026-10-20T00:00:00Z"), paymentStatus: "UNPAID", category: "Office & Rent", ...over });
const txn = (over: Record<string, unknown> = {}) => ({ id: "t1", date: new Date("2026-11-02T00:00:00Z"), description: "NEFT WEWORK INDIA MGMT", amount: -42000, matchedExpenseId: null, matchedInvoiceId: null, isReconciled: false, ...over });

beforeEach(() => { vi.clearAllMocks(); mocks.prisma.$transaction.mockImplementation(async (ops: unknown[]) => ops); });

describe("bank matching", () => {
  it("suggests unmatched debits of the same amount and ranks a vendor name in the narration first", async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(expense());
    mocks.prisma.bankTransaction.findMany.mockResolvedValue([txn({ id: "far", description: "UPI 9918", date: new Date("2026-10-21T00:00:00Z") }), txn(), txn({ id: "wrong", amount: -100 })]);
    const { bankMatchesForExpense } = await import("@/lib/expenses/bank-match");
    const out = await bankMatchesForExpense("ws", "e1");
    expect(out?.map((m) => m.id)).toEqual(["t1", "far"]);
    expect(out?.[0].vendorInNarration).toBe(true);
  });

  it("marks a bill on credit paid on the bank date when matched", async () => {
    mocks.prisma.expense.findFirst.mockResolvedValue(expense());
    mocks.prisma.bankTransaction.findFirst.mockResolvedValue(txn());
    const { linkBankTransaction } = await import("@/lib/expenses/bank-match");
    const r = await linkBankTransaction(ctx, "e1", "t1");
    expect(r).toEqual({ ok: true, markedPaid: true });
    expect(mocks.prisma.expense.update).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentStatus: "PAID", paidAt: new Date("2026-11-02T00:00:00Z") } }));
  });

  it("refuses a line that is already matched, a credit, or a different amount", async () => {
    const { linkBankTransaction } = await import("@/lib/expenses/bank-match");
    mocks.prisma.expense.findFirst.mockResolvedValue(expense({ paymentStatus: "PAID" }));
    mocks.prisma.bankTransaction.findFirst.mockResolvedValue(txn({ isReconciled: true }));
    expect(await linkBankTransaction(ctx, "e1", "t1")).toMatchObject({ ok: false, code: "ALREADY_MATCHED" });
    mocks.prisma.bankTransaction.findFirst.mockResolvedValue(txn({ amount: 42000 }));
    expect(await linkBankTransaction(ctx, "e1", "t1")).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
    mocks.prisma.bankTransaction.findFirst.mockResolvedValue(txn({ amount: -40000 }));
    expect(await linkBankTransaction(ctx, "e1", "t1")).toMatchObject({ ok: false, code: "AMOUNT_MISMATCH" });
    expect(mocks.prisma.expense.update).not.toHaveBeenCalled();
  });
});
