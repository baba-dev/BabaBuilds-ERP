// @vitest-environment node
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyPercentChanges, extendLimits, nextReminderAt } from "@/lib/retainers/schedule";
import { computeMovement } from "@/lib/retainers/movement";
import { retainerMrr } from "@/lib/retainers/mrr";

const D = (v: string | number) => new Prisma.Decimal(v);

const mocks = vi.hoisted(() => {
  const tx = { retainer: { updateMany: vi.fn() }, invoice: { create: vi.fn() }, meteredUsage: { updateMany: vi.fn() }, retainerEvent: { create: vi.fn() }, retainerItem: { update: vi.fn() }, retainerPriceChange: { updateMany: vi.fn() } };
  return {
    tx,
    requireRetainerAccess: vi.fn(),
    sendAr: vi.fn(),
    prisma: {
      retainer: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      businessProfile: { findUnique: vi.fn() },
      retainerEvent: tx.retainerEvent,
      invoice: { update: vi.fn(), findMany: vi.fn() },
      task: { findFirst: vi.fn(), create: vi.fn() },
      retainerPriceChange: { create: vi.fn(), deleteMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/retainers/access", async (orig) => ({ ...(await orig<typeof import("@/lib/retainers/access")>()), requireRetainerAccess: mocks.requireRetainerAccess }));
vi.mock("@/lib/ar-collections", () => ({ sendArReminderEmailForInvoice: mocks.sendAr }));
vi.mock("fs", () => ({ default: { promises: { writeFile: vi.fn(async () => undefined), unlink: vi.fn(async () => undefined) } } }));
vi.mock("@/lib/uploads/private-storage", () => ({ buildPrivatePath: (...a: unknown[]) => a.join("/"), ensureDir: vi.fn(async () => undefined) }));
vi.mock("@/lib/document-numbering", () => ({ getNextInvoiceNumber: vi.fn(async () => ({ invoiceNumber: "INV/26-27/009" })), isUniqueConstraintError: () => false }));
vi.mock("@/lib/entitlements", () => ({ assertFreeTierMonthlyInvoiceAllowed: vi.fn(async () => null), canInjectGatewayPaymentLinks: () => false }));
vi.mock("@/lib/invoice/build-invoice-view-model", () => ({ buildInvoiceViewModel: vi.fn(() => ({})) }));
vi.mock("@/lib/invoice-renderers/render-invoice-pdf", () => ({ renderInvoicePdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock("@/lib/razorpay-links", () => ({ generateTenantPaymentLink: vi.fn() }));
vi.mock("@/lib/stripe-links", () => ({ generateStripePaymentLink: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));
vi.mock("@/lib/mailer", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn(), noteDashboardCacheIncident: vi.fn() }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/rate-limit-memory", () => ({ checkRateLimit: vi.fn(() => ({ ok: true })) }));

describe("schedule helpers", () => {
  it("applies stacked percentage changes with rounding", () => {
    expect(applyPercentChanges(1000, [8])).toBe(1080);
    expect(applyPercentChanges(1000, [10, 10])).toBe(1210);
    expect(applyPercentChanges(999.99, [-10])).toBe(899.99);
  });
  it("extends the end date and cycle limit by whole cycles", () => {
    const ext = extendLimits({ endDate: new Date("2027-06-30T00:00:00Z"), maxCycles: 12, cyclesBilled: 12 }, "QUARTERLY", 4);
    expect(ext.maxCycles).toBe(16);
    expect(ext.endDate?.getUTCFullYear()).toBe(2028);
    expect(extendLimits({ endDate: null, maxCycles: null, cyclesBilled: 0 }, "MONTHLY", 3)).toEqual({});
  });
  it("schedules reminders 3, 7 and 14 days after the due date, then stops", () => {
    const due = new Date("2027-04-10T00:00:00Z");
    expect(nextReminderAt(due, 0)?.toISOString().slice(0, 10)).toBe("2027-04-13");
    expect(nextReminderAt(due, 1)?.toISOString().slice(0, 10)).toBe("2027-04-17");
    expect(nextReminderAt(due, 2)?.toISOString().slice(0, 10)).toBe("2027-04-24");
    expect(nextReminderAt(due, 3)).toBeNull();
    expect(nextReminderAt(null, 0)).toBeNull();
  });
});

describe("MRR", () => {
  it("only counts active retainers, normalised to months and the base currency", () => {
    const items = [{ quantity: 1, unitPrice: D(3000), taxRate: 0.18 }];
    expect(retainerMrr({ status: "ACTIVE", frequency: "QUARTERLY", exchangeRate: D(1), items })).toBe(1000);
    expect(retainerMrr({ status: "ACTIVE", frequency: "MONTHLY", exchangeRate: D(80), items })).toBe(240_000);
    expect(retainerMrr({ status: "PAUSED", frequency: "MONTHLY", exchangeRate: D(1), items })).toBe(0);
  });
  it("classifies movement into new, expansion, contraction and churn", () => {
    const at = (s: string) => new Date(`${s}T10:00:00Z`);
    const ev = (type: string, d: string, mrr: number) => ({ retainerId: "r1", type, createdAt: at(d), metadata: JSON.stringify({ mrr }) });
    const rows = computeMovement(
      [{ id: "r1", createdAt: at("2027-01-05"), currentMrr: 0 }],
      [ev("CREATED", "2027-01-05", 1000), ev("EDITED", "2027-02-10", 1500), ev("EDITED", "2027-03-10", 1200), ev("CANCELLED", "2027-04-10", 0)],
      ["2027-01", "2027-02", "2027-03", "2027-04"],
    );
    expect(rows.map((r) => [r.new, r.expansion, r.contraction, r.churn])).toEqual([[1000, 0, 0, 0], [0, 500, 0, 0], [0, 0, 300, 0], [0, 0, 0, 1200]]);
    expect(rows.map((r) => r.endingMrr)).toEqual([1000, 1500, 1200, 0]);
  });
});

describe("payment reminders", () => {
  const inv = (over: Record<string, unknown> = {}) => ({ id: "i1", workspaceId: "ws_1", retainerId: "r1", dueDate: new Date("2027-04-10T00:00:00Z"), reminderCount: 0, lastReminderSentAt: null, invoiceNumber: "INV-1", ...over });
  beforeEach(() => { vi.clearAllMocks(); mocks.prisma.invoice.update.mockResolvedValue({}); mocks.tx.retainerEvent.create.mockResolvedValue({}); });
  const run = async (now: string) => (await import("@/lib/retainers/reminders")).runRetainerReminders(new Date(now));

  it("waits for the offset, then sends and counts the reminder", async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([inv()]);
    expect(await run("2027-04-12T08:00:00Z")).toMatchObject({ sent: 0 });
    mocks.sendAr.mockResolvedValue({ ok: true });
    expect(await run("2027-04-14T08:00:00Z")).toMatchObject({ sent: 1 });
    expect(mocks.prisma.invoice.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { reminderCount: { increment: 1 } } });
    expect(mocks.tx.retainerEvent.create.mock.calls[0][0].data.type).toBe("REMINDER_SENT");
  });
  it("gives up quietly when there is no client email, and retries transient failures", async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([inv()]);
    mocks.sendAr.mockResolvedValueOnce({ ok: false, code: "NO_CLIENT_EMAIL" });
    expect(await run("2027-04-20T08:00:00Z")).toMatchObject({ gaveUp: 1 });
    expect(mocks.prisma.invoice.update.mock.calls[0][0].data.reminderCount).toBe(3);
    mocks.sendAr.mockResolvedValueOnce({ ok: false, code: "SEND_FAILED" });
    expect(await run("2027-04-20T08:00:00Z")).toMatchObject({ failed: 1 });
  });
  it("never sends twice within a day", async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([inv({ lastReminderSentAt: new Date("2027-04-20T02:00:00Z") })]);
    expect(await run("2027-04-20T08:00:00Z")).toMatchObject({ sent: 0 });
  });
});

describe("billing follow-ups", () => {
  const retainer = (over: Record<string, unknown> = {}) => ({
    id: "r1", workspaceId: "ws_1", clientId: "c1", status: "ACTIVE", name: "SEO", frequency: "MONTHLY", currency: "INR", exchangeRate: D(1),
    nextBillingDate: new Date("2027-04-01T00:00:00Z"), endDate: null, maxCycles: null, cyclesBilled: 0, autoAppendMonth: false, emailInvoice: false, paymentTermsDays: 7, sacCode: null,
    autoRenew: false, renewCycles: null, lastError: null,
    client: { id: "c1", name: "Acme", email: "a@acme.test", isExport: false, address: null, country: null, taxId: null, logoUrl: null },
    items: [{ id: "i1", title: "SEO", quantity: 1, unitPrice: D(1000), taxRate: 0.18, sacCode: null }],
    meteredUsages: [{ id: "u1", description: "Hours", quantity: D(1), unitPrice: D(100), taxRate: null }],
    priceChanges: [], ...over,
  });
  const bill = async () => (await import("@/lib/retainers/billing")).billRetainer({ retainerId: "r1", trigger: "cron", now: new Date("2027-04-02T05:00:00Z") });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer());
    mocks.prisma.retainer.update.mockResolvedValue({});
    mocks.prisma.businessProfile.findUnique.mockResolvedValue({ invoicePrefix: "INV", companyName: "Me", defaultTaxRate: 0.18, workspace: { countryCode: "IN", baseCurrency: "INR" } });
    mocks.prisma.task.findFirst.mockResolvedValue(null);
    mocks.prisma.task.create.mockResolvedValue({});
    mocks.tx.retainer.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.invoice.create.mockResolvedValue({ id: "inv1", invoiceNumber: "INV/26-27/009" });
    mocks.tx.retainerEvent.create.mockResolvedValue({});
  });

  it("taxes metered usage at the retainer's rate unless it has its own", async () => {
    await bill();
    const lines = mocks.tx.invoice.create.mock.calls[0][0].data.items.create;
    expect(lines.map((l: { taxRate: number }) => l.taxRate)).toEqual([0.18, 0.18]);
    mocks.tx.invoice.create.mockClear();
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ meteredUsages: [{ id: "u1", description: "Hours", quantity: D(1), unitPrice: D(100), taxRate: 0.05 }] }));
    await bill();
    expect(mocks.tx.invoice.create.mock.calls[0][0].data.items.create[1].taxRate).toBe(0.05);
  });

  it("applies a due price change to the invoice and stores the new prices", async () => {
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ priceChanges: [{ id: "pc1", effectiveDate: new Date("2027-03-01T00:00:00Z"), percent: 10 }] }));
    await bill();
    expect(mocks.tx.invoice.create.mock.calls[0][0].data.items.create[0].totalAmount.toString()).toBe("1100");
    expect(mocks.tx.retainerItem.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { unitPrice: 1100 } });
    expect(mocks.tx.retainerPriceChange.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["pc1"] } } }));
    expect(mocks.tx.retainerEvent.create.mock.calls.some((c) => c[0].data.type === "PRICE_CHANGED")).toBe(true);
  });

  it("ignores price changes that take effect after this cycle", async () => {
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ priceChanges: [{ id: "pc1", effectiveDate: new Date("2027-09-01T00:00:00Z"), percent: 50 }] }));
    await bill();
    expect(mocks.tx.retainerItem.update).not.toHaveBeenCalled();
  });

  it("renews instead of completing when auto-renew is on", async () => {
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ maxCycles: 3, cyclesBilled: 2, autoRenew: true, renewCycles: 6 }));
    const r = await bill();
    expect(r).toMatchObject({ ok: true, completed: false });
    const data = mocks.tx.retainer.updateMany.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(data.maxCycles).toBe(9);
    expect(mocks.tx.retainerEvent.create.mock.calls.some((c) => c[0].data.type === "RENEWED")).toBe(true);
  });

  it("opens one follow-up task on the first failure only", async () => {
    mocks.prisma.businessProfile.findUnique.mockResolvedValue(null);
    await bill();
    expect(mocks.prisma.task.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.task.create.mock.calls[0][0].data.description).toContain("retainer:r1");
    mocks.prisma.task.create.mockClear();
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ lastError: "still broken" }));
    await bill();
    expect(mocks.prisma.task.create).not.toHaveBeenCalled();
  });

  it("renders the next invoice as a PDF without writing anything", async () => {
    const { renderNextInvoicePreview } = await import("@/lib/retainers/billing");
    const out = await renderNextInvoicePreview({ retainerId: "r1", workspaceId: "ws_1", now: new Date("2027-04-02T05:00:00Z") });
    expect(out).toMatchObject({ ok: true });
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled();
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ status: "CANCELLED" }));
    expect(await renderNextInvoicePreview({ retainerId: "r1", workspaceId: "ws_1" })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("new routes", () => {
  const access = { ok: true, access: { workspaceId: "ws_1", userId: "u_1", email: "o@x.y" } };
  const json = (body: unknown) => new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const ctx = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id: "r1", ...extra }) });
  beforeEach(() => { vi.clearAllMocks(); mocks.requireRetainerAccess.mockResolvedValue(access); });

  it("bulk: needs the manage permission and returns one result per retainer", async () => {
    const { POST } = await import("@/app/api/retainers/bulk/route");
    mocks.requireRetainerAccess.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await POST(json({ action: "pause", ids: ["a"] }))).status).toBe(403);
    expect((await POST(json({ action: "delete", ids: ["a"] }))).status).toBe(400);
    expect((await POST(json({ action: "pause", ids: [] }))).status).toBe(400);
    mocks.prisma.retainer.findFirst.mockResolvedValue({ status: "ACTIVE", nextBillingDate: new Date(), frequency: "MONTHLY", exchangeRate: D(1), items: [] });
    mocks.prisma.retainer.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mocks.tx.retainerEvent.create.mockResolvedValue({});
    const body = await (await POST(json({ action: "pause", ids: ["a", "b", "a"] }))).json();
    expect(body).toMatchObject({ succeeded: 1, failed: 1 });
    expect(body.results).toHaveLength(2);
  });

  it("price changes: validates, refuses finished retainers and removes only pending ones", async () => {
    const { POST } = await import("@/app/api/retainers/[id]/price-changes/route");
    expect((await POST(json({ effectiveDate: "2027-07-01", percent: 0 }), ctx())).status).toBe(400);
    expect((await POST(json({ effectiveDate: "2027-07-01", percent: 900 }), ctx())).status).toBe(400);
    mocks.prisma.retainer.findFirst.mockResolvedValue({ status: "CANCELLED", _count: { priceChanges: 0 } });
    expect((await POST(json({ effectiveDate: "2027-07-01", percent: 8 }), ctx())).status).toBe(409);
    mocks.prisma.retainer.findFirst.mockResolvedValue({ status: "ACTIVE", _count: { priceChanges: 0 } });
    mocks.prisma.retainerPriceChange.create.mockResolvedValue({ id: "pc1" });
    mocks.tx.retainerEvent.create.mockResolvedValue({});
    expect((await POST(json({ effectiveDate: "2027-07-01", percent: 8 }), ctx())).status).toBe(200);
    const { DELETE } = await import("@/app/api/retainers/[id]/price-changes/[changeId]/route");
    mocks.prisma.retainerPriceChange.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(json({}), ctx({ changeId: "pc1" }))).status).toBe(404);
    expect(mocks.prisma.retainerPriceChange.deleteMany.mock.calls[0][0].where).toMatchObject({ appliedAt: null });
  });
});
