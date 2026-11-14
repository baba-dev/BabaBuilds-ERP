// @vitest-environment node
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireReconAccess: vi.fn(),
  tx: { invoice: { findFirst: vi.fn(), update: vi.fn() }, expense: { findFirst: vi.fn(), update: vi.fn() }, bankTransaction: { update: vi.fn() }, bankTransactionInvoiceSplit: { deleteMany: vi.fn() } },
  prisma: { bankTransaction: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn() },
  deleteExpenses: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/reconciliation/access", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/reconciliation/access")>()), requireReconAccess: mocks.requireReconAccess }));
vi.mock("@/lib/expenses/service", () => ({ deleteExpenses: mocks.deleteExpenses }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn() }));
vi.mock("@/lib/reconciliation/reconciliation-settings", () => ({ getOrCreateReconciliationSettings: vi.fn(async () => ({ autoMatchMinScore: 95, autoMatchSuggestionMin: 70 })) }));

const ok = { ok: true, ctx: { workspaceId: "ws", userId: "u1", email: null } };
const denied = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
const json = (url: string, method: string, body: unknown) => new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireReconAccess.mockResolvedValue(ok);
  mocks.prisma.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.deleteExpenses.mockResolvedValue({ ok: true, deleted: 1 });
});

describe("reconciliation routes", () => {
  it("need a permission, and changing rules, settings, matches or ignoring needs commit", async () => {
    mocks.requireReconAccess.mockResolvedValue(denied);
    const settings = await import("@/app/api/reconcile/settings/route");
    const rules = await import("@/app/api/reconcile/rules/route");
    const queue = await import("@/app/api/reconcile/queue/route");
    const tx = await import("@/app/api/reconcile/transactions/route");
    const ignore = await import("@/app/api/reconcile/ignore/route");
    const unmatch = await import("@/app/api/reconcile/unmatch/route");
    expect((await queue.GET(new Request("http://x/q"))).status).toBe(403);
    expect((await tx.GET(new Request("http://x/t"))).status).toBe(403);
    expect((await rules.GET()).status).toBe(403);
    expect((await settings.PATCH(json("http://x/s", "PATCH", { autoMatchMinScore: 50 }))).status).toBe(403);
    expect((await ignore.POST(json("http://x/i", "POST", { ids: ["a"], ignored: true }))).status).toBe(403);
    expect((await unmatch.POST(json("http://x/u", "POST", { bankTransactionId: "a" }))).status).toBe(403);
    expect(mocks.requireReconAccess).toHaveBeenCalledWith("reconciliation.commit");
    expect(mocks.prisma.bankTransaction.updateMany).not.toHaveBeenCalled();
  });

  it("rejects out-of-range settings", async () => {
    const settings = await import("@/app/api/reconcile/settings/route");
    expect((await settings.PATCH(json("http://x/s", "PATCH", { autoMatchMinScore: 10 }))).status).toBe(422);
    expect((await settings.PATCH(json("http://x/s", "PATCH", { importRawRetentionDays: -5 }))).status).toBe(422);
  });

  it("undoing a match gives the money back to the invoice and removes an expense the match created", async () => {
    const { unmatchBankTransaction } = await import("@/lib/reconciliation/workspace");
    mocks.prisma.bankTransaction.findFirst.mockResolvedValue({ id: "b1", isReconciled: true, amount: 3000, date: new Date("2026-11-03T00:00:00Z"), matchedInvoiceId: "i1", matchedExpenseId: null, invoiceSplits: [{ invoiceId: "i1", amount: 3000 }] });
    mocks.tx.invoice.findFirst.mockResolvedValue({ id: "i1", amountReceived: 5000, status: "PAID" });
    const inv = await unmatchBankTransaction(ok.ctx, "b1");
    expect(inv).toMatchObject({ ok: true, reversedInvoices: 1 });
    expect(mocks.tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountReceived: 2000, status: "PARTIALLY_PAID" }) }));
    expect(mocks.tx.bankTransaction.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isReconciled: false, matchedInvoiceId: null }) }));

    mocks.prisma.bankTransaction.findFirst.mockResolvedValue({ id: "b2", isReconciled: true, amount: -1180, date: new Date("2026-11-03T00:00:00Z"), matchedInvoiceId: null, matchedExpenseId: "e1", invoiceSplits: [] });
    mocks.tx.expense.findFirst.mockResolvedValue({ id: "e1", source: "BANK", billedInvoiceId: null });
    const exp = await unmatchBankTransaction(ok.ctx, "b2");
    expect(exp).toMatchObject({ ok: true, removedExpense: true });
    expect(mocks.deleteExpenses).toHaveBeenCalled();
  });

  it("reopens a bill the match had paid, and refuses a line that is not matched", async () => {
    const { unmatchBankTransaction } = await import("@/lib/reconciliation/workspace");
    const date = new Date("2026-11-03T00:00:00Z");
    mocks.prisma.bankTransaction.findFirst.mockResolvedValue({ id: "b3", isReconciled: true, amount: -500, date, matchedInvoiceId: null, matchedExpenseId: "e2", invoiceSplits: [] });
    mocks.tx.expense.findFirst.mockResolvedValue({ id: "e2", source: "MANUAL", billedInvoiceId: null, paymentStatus: "PAID", paidAt: date, dueDate: new Date("2026-10-30T00:00:00Z") });
    expect(await unmatchBankTransaction(ok.ctx, "b3")).toMatchObject({ ok: true, reopenedBill: true });
    expect(mocks.tx.expense.update).toHaveBeenCalledWith(expect.objectContaining({ data: { paymentStatus: "UNPAID", paidAt: null } }));
    mocks.prisma.bankTransaction.findFirst.mockResolvedValue({ id: "b4", isReconciled: false, invoiceSplits: [] });
    expect(await unmatchBankTransaction(ok.ctx, "b4")).toMatchObject({ ok: false, code: "NOT_MATCHED" });
  });
});
