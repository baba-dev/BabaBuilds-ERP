// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  prisma: { recurringExpense: { findMany: vi.fn(), update: vi.fn() }, expense: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/expenses/create-expense-with-side-effects", () => ({ createExpenseWithSideEffects: mocks.create }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/gst/data", () => ({ loadGstProfile: vi.fn(async () => ({ stateCode: "27" })) }));
vi.mock("@/lib/expenses/payables-data", () => ({ openPayables: vi.fn(async () => []) }));

const NOW = new Date("2026-11-09T06:00:00Z");
const tpl = (over: Record<string, unknown> = {}) => ({ id: "r1", workspaceId: "ws", vendorId: "v1", vendor: "WeWork", category: "Office & Rent", amount: 42000, description: "Desk", frequency: "MONTHLY", nextRunDate: new Date("2026-09-30T00:00:00Z"), endDate: null, autoPost: false, status: "ACTIVE", paymentStatus: "PAID", dueInDays: null, itcStatus: "NONE", gstRate: null, createdByUserId: "u1", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.expense.findFirst.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "e1" });
});

describe("runDueRecurring", () => {
  it("posts every missed date once as drafts and moves the schedule past today", async () => {
    mocks.prisma.recurringExpense.findMany.mockResolvedValue([tpl()]);
    const { runDueRecurring } = await import("@/lib/expenses/automation");
    const r = await runDueRecurring(NOW);
    expect(r).toMatchObject({ created: 2, drafts: 2, failed: 0 }); // Sep 30 and Oct 30
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ approvalStatus: "DRAFT", source: "RECURRING", recurringId: "r1", vendorId: "v1" }));
    const update = mocks.prisma.recurringExpense.update.mock.calls[0][0];
    expect((update.data.nextRunDate as Date).toISOString().slice(0, 10)).toBe("2026-11-30");
  });

  it("autopost schedules post approved, and a date already posted is skipped", async () => {
    mocks.prisma.recurringExpense.findMany.mockResolvedValue([tpl({ autoPost: true })]);
    mocks.prisma.expense.findFirst.mockResolvedValueOnce({ id: "already" }).mockResolvedValue(null);
    const { runDueRecurring } = await import("@/lib/expenses/automation");
    const r = await runDueRecurring(NOW);
    expect(r.created).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ approvalStatus: "APPROVED" }));
  });

  it("ends a schedule whose end date has passed and keeps going when one schedule fails", async () => {
    mocks.prisma.recurringExpense.findMany.mockResolvedValue([tpl({ id: "bad" }), tpl({ id: "r2", endDate: new Date("2026-10-15T00:00:00Z") })]);
    mocks.create.mockRejectedValueOnce(new Error("boom"));
    const { runDueRecurring } = await import("@/lib/expenses/automation");
    const r = await runDueRecurring(NOW);
    expect(r.failed).toBe(1);
    const ended = mocks.prisma.recurringExpense.update.mock.calls.map((c) => c[0]).find((c) => c.where.id === "r2");
    expect(ended.data.status).toBe("ENDED");
  });
});
