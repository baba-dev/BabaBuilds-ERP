// @vitest-environment node
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const D = (v: string | number) => new Prisma.Decimal(v);

const mocks = vi.hoisted(() => {
  const tx = {
    retainer: { updateMany: vi.fn() },
    invoice: { create: vi.fn() },
    meteredUsage: { updateMany: vi.fn() },
    retainerEvent: { create: vi.fn() },
  };
  return {
    tx,
    requireRetainerAccess: vi.fn(),
    prisma: {
      retainer: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
      businessProfile: { findUnique: vi.fn() },
      retainerEvent: tx.retainerEvent,
      invoice: { update: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/retainers/access", async (orig) => ({ ...(await orig<typeof import("@/lib/retainers/access")>()), requireRetainerAccess: mocks.requireRetainerAccess }));
vi.mock("fs", () => ({ default: { promises: { writeFile: vi.fn(async () => undefined), unlink: vi.fn(async () => undefined) } } }));
vi.mock("@/lib/uploads/private-storage", () => ({ buildPrivatePath: (...a: unknown[]) => a.join("/"), ensureDir: vi.fn(async () => undefined) }));
vi.mock("@/lib/document-numbering", () => ({ getNextInvoiceNumber: vi.fn(async () => ({ invoiceNumber: "INV/26-27/007" })), isUniqueConstraintError: () => false }));
vi.mock("@/lib/entitlements", () => ({ assertFreeTierMonthlyInvoiceAllowed: vi.fn(async () => null), canInjectGatewayPaymentLinks: () => false }));
vi.mock("@/lib/invoice/build-invoice-view-model", () => ({ buildInvoiceViewModel: vi.fn(() => ({})) }));
vi.mock("@/lib/invoice-renderers/render-invoice-pdf", () => ({ renderInvoicePdf: vi.fn(async () => new Uint8Array([1])) }));
vi.mock("@/lib/razorpay-links", () => ({ generateTenantPaymentLink: vi.fn() }));
vi.mock("@/lib/stripe-links", () => ({ generateStripePaymentLink: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decrypt: (v: string) => v }));
vi.mock("@/lib/mailer", () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn(), noteDashboardCacheIncident: vi.fn() }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/rate-limit-memory", () => ({ checkRateLimit: vi.fn(() => ({ ok: true })) }));

const access = { ok: true, access: { workspaceId: "ws_1", userId: "u_1", email: "o@x.y" } };
const denied = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
const ctx = (id = "r1") => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) => new Request("http://localhost/api/retainers/r1", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const retainer = (over: Record<string, unknown> = {}) => ({
  id: "r1", workspaceId: "ws_1", clientId: "c1", status: "ACTIVE", name: "SEO", frequency: "MONTHLY", currency: "USD", exchangeRate: D(83),
  nextBillingDate: new Date("2027-04-01T00:00:00Z"), endDate: null, maxCycles: null, cyclesBilled: 0, autoAppendMonth: true, emailInvoice: false,
  paymentTermsDays: 14, sacCode: null,
  client: { id: "c1", name: "Acme", email: "a@acme.test", isExport: false, address: null, country: null, taxId: null, logoUrl: null },
  items: [{ id: "i1", title: "SEO", quantity: 2, unitPrice: D(500), taxRate: 0.18, sacCode: null }],
  meteredUsages: [{ id: "u1", description: "Extra hours", quantity: D(2), unitPrice: D(100) }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRetainerAccess.mockResolvedValue(access);
  mocks.prisma.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.prisma.retainer.findFirst.mockResolvedValue(retainer());
  mocks.prisma.businessProfile.findUnique.mockResolvedValue({ invoicePrefix: "INV", companyName: "Me", defaultTaxRate: 0.18, workspace: { countryCode: "IN", baseCurrency: "INR" }, defaultGateway: "RAZORPAY" });
  mocks.tx.retainer.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.invoice.create.mockResolvedValue({ id: "inv1", invoiceNumber: "INV/26-27/007" });
  mocks.prisma.retainer.update.mockResolvedValue({});
  mocks.tx.retainerEvent.create.mockResolvedValue({});
});

describe("billRetainer", () => {
  const bill = async (args: Record<string, unknown> = {}) => (await import("@/lib/retainers/billing")).billRetainer({ retainerId: "r1", trigger: "cron", now: new Date("2027-04-02T05:00:00Z"), ...args });

  it("issues one invoice per cycle, linked to the retainer, in its own currency, with usage and an advanced schedule", async () => {
    const r = await bill();
    expect(r).toMatchObject({ ok: true, completed: false, emailed: false });
    const data = mocks.tx.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ retainerId: "r1", source: "RETAINER", currency: "USD", paymentTermsDays: 14, clientId: "c1" });
    expect(String(data.exchangeRate)).toBe("83");
    expect(data.items.create).toHaveLength(2); // the item and the metered usage
    expect(mocks.tx.meteredUsage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "BILLED" }) }));
    const claim = mocks.tx.retainer.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "r1", status: "ACTIVE", nextBillingDate: new Date("2027-04-01T00:00:00Z") });
    expect(claim.data.cyclesBilled).toEqual({ increment: 1 });
    expect(claim.data.nextBillingDate.getTime()).toBeGreaterThan(new Date("2027-04-01T00:00:00Z").getTime());
  });

  it("completes the retainer on its last cycle", async () => {
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ maxCycles: 3, cyclesBilled: 2 }));
    const r = await bill();
    expect(r).toMatchObject({ ok: true, completed: true });
    expect(mocks.tx.retainer.updateMany.mock.calls[0][0].data.status).toBe("COMPLETED");
  });

  it("does not bill when another request already took this cycle", async () => {
    mocks.tx.retainer.updateMany.mockResolvedValue({ count: 0 });
    const r = await bill();
    expect(r).toMatchObject({ ok: false, code: "ALREADY_BILLED", skipped: true });
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled();
  });

  it("skips paused retainers and cycles that are not due yet (cron)", async () => {
    mocks.prisma.retainer.findFirst.mockResolvedValueOnce(retainer({ status: "PAUSED" }));
    expect(await bill()).toMatchObject({ ok: false, code: "NOT_ACTIVE", skipped: true });
    mocks.prisma.retainer.findFirst.mockResolvedValueOnce(retainer({ nextBillingDate: new Date("2027-05-01T00:00:00Z") }));
    expect(await bill()).toMatchObject({ ok: false, code: "NOT_DUE", skipped: true });
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled();
  });

  it("allows manual billing before the due date", async () => {
    mocks.prisma.retainer.findFirst.mockResolvedValueOnce(retainer({ nextBillingDate: new Date("2027-05-01T00:00:00Z") }));
    expect(await bill({ trigger: "manual" })).toMatchObject({ ok: true });
  });

  it("marks a retainer past its end date as completed instead of billing", async () => {
    mocks.prisma.retainer.findFirst.mockResolvedValue(retainer({ endDate: new Date("2027-03-15T00:00:00Z") }));
    mocks.tx.retainer.updateMany.mockResolvedValue({ count: 1 });
    expect(await bill()).toMatchObject({ ok: false, code: "COMPLETED", skipped: true });
    expect(mocks.tx.invoice.create).not.toHaveBeenCalled();
  });

  it("records a failure on the retainer when billing cannot proceed", async () => {
    mocks.prisma.businessProfile.findUnique.mockResolvedValue(null);
    const r = await bill();
    expect(r).toMatchObject({ ok: false, code: "PROFILE_REQUIRED" });
    expect(mocks.prisma.retainer.update.mock.calls[0][0].data.lastError).toMatch(/profile/i);
  });
});

describe("retainer routes", () => {
  it("require the manage permission for writes and the view permission for reads", async () => {
    const list = await import("@/app/api/retainers/route");
    const status = await import("@/app/api/retainers/[id]/status/route");
    const bill = await import("@/app/api/retainers/[id]/bill-now/route");
    mocks.requireRetainerAccess.mockResolvedValue(denied);
    expect((await list.GET(new Request("http://localhost/api/retainers"))).status).toBe(403);
    expect((await status.PATCH(req("PATCH", { status: "PAUSED" }), ctx())).status).toBe(403);
    expect((await bill.POST(req("POST", {}), ctx())).status).toBe(403);
    mocks.requireRetainerAccess.mockResolvedValue(access);
    mocks.prisma.retainer.findFirst.mockResolvedValue({ status: "ACTIVE", nextBillingDate: new Date(), frequency: "MONTHLY" });
    mocks.prisma.retainer.updateMany.mockResolvedValue({ count: 1 });
    await status.PATCH(req("PATCH", { status: "PAUSED" }), ctx());
    expect(mocks.requireRetainerAccess).toHaveBeenLastCalledWith("retainers.manage");
  });

  it("pauses for real: the status is written, not ignored", async () => {
    const { PATCH } = await import("@/app/api/retainers/[id]/status/route");
    mocks.prisma.retainer.findFirst.mockResolvedValue({ status: "ACTIVE", nextBillingDate: new Date(), frequency: "MONTHLY" });
    mocks.prisma.retainer.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(req("PATCH", { status: "PAUSED" }), ctx());
    expect(res.status).toBe(200);
    expect(mocks.prisma.retainer.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "r1", workspaceId: "ws_1", status: "ACTIVE" }, data: { status: "PAUSED" } });
  });

  it("rejects illegal transitions and unknown statuses", async () => {
    const { PATCH } = await import("@/app/api/retainers/[id]/status/route");
    mocks.prisma.retainer.findFirst.mockResolvedValue({ status: "CANCELLED", nextBillingDate: new Date(), frequency: "MONTHLY" });
    expect((await PATCH(req("PATCH", { status: "ACTIVE" }), ctx())).status).toBe(409);
    expect((await PATCH(req("PATCH", { status: "COMPLETED" }), ctx())).status).toBe(400);
  });

  it("resuming after a long pause rolls the schedule forward instead of back-billing", async () => {
    const { PATCH } = await import("@/app/api/retainers/[id]/status/route");
    mocks.prisma.retainer.findFirst.mockResolvedValue({ status: "PAUSED", nextBillingDate: new Date("2020-01-15T00:00:00Z"), frequency: "MONTHLY" });
    mocks.prisma.retainer.updateMany.mockResolvedValue({ count: 1 });
    const body = await (await PATCH(req("PATCH", { status: "ACTIVE" }), ctx())).json();
    expect(body.rolledForward).toBe(true);
    expect(mocks.prisma.retainer.updateMany.mock.calls[0][0].data.nextBillingDate.getTime()).toBeGreaterThan(Date.now() - 86_400_000);
  });

  it("deletes only retainers that never billed; billed ones must be cancelled", async () => {
    const { DELETE } = await import("@/app/api/retainers/[id]/route");
    mocks.prisma.retainer.findFirst.mockResolvedValue({ cyclesBilled: 2, _count: { invoices: 2 } });
    const blocked = await DELETE(req("DELETE"), ctx());
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).cancellable).toBe(true);
    expect(mocks.prisma.retainer.deleteMany).not.toHaveBeenCalled();
    mocks.prisma.retainer.findFirst.mockResolvedValue({ cyclesBilled: 0, _count: { invoices: 0 } });
    mocks.prisma.retainer.deleteMany.mockResolvedValue({ count: 1 });
    expect((await DELETE(req("DELETE"), ctx())).status).toBe(200);
  });
});
