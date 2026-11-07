// @vitest-environment node
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireInvoiceAccess: vi.fn(),
  recordInvoicePayment: vi.fn(),
  prisma: { invoice: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() }, $transaction: vi.fn() },
}));

vi.mock("@/lib/invoices/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoices/auth")>()),
  requireInvoiceAccess: mocks.requireInvoiceAccess,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/invoices/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/invoices/payments")>()),
  recordInvoicePayment: mocks.recordInvoicePayment,
}));
vi.mock("@/lib/rbac", () => ({ withPermission: vi.fn(async () => ({ granted: true, role: "OWNER" })) }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));

const access = { ok: true, access: { workspaceId: "ws_1", userId: "u_1", email: "a@b.c" } };
const ctx = (id = "inv_1") => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/invoices/inv_1/payments", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("POST /api/invoices/[id]/payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireInvoiceAccess.mockResolvedValue(access);
  });

  it("returns the auth response when the caller lacks permission", async () => {
    mocks.requireInvoiceAccess.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const { POST } = await import("@/app/api/invoices/[id]/payments/route");
    expect((await POST(json({ amount: 10, receivedAt: "2026-11-01" }), ctx())).status).toBe(403);
    expect(mocks.recordInvoicePayment).not.toHaveBeenCalled();
  });

  it("requires an Idempotency-Key so a retry can never double-record", async () => {
    const { POST } = await import("@/app/api/invoices/[id]/payments/route");
    const res = await POST(json({ amount: 10, receivedAt: "2026-11-01" }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("validates the payload", async () => {
    const { POST } = await import("@/app/api/invoices/[id]/payments/route");
    const res = await POST(json({ amount: -5, receivedAt: "2026-11-01" }, { "Idempotency-Key": "key-12345678" }), ctx());
    expect(res.status).toBe(400);
    expect(mocks.recordInvoicePayment).not.toHaveBeenCalled();
  });

  it("records the payment, scoped to the session workspace, and maps replays to 200", async () => {
    mocks.recordInvoicePayment.mockResolvedValueOnce({ ok: true, replayed: false, paymentId: "p1", status: "PARTIALLY_PAID" });
    mocks.recordInvoicePayment.mockResolvedValueOnce({ ok: true, replayed: true, paymentId: "p1", status: "PARTIALLY_PAID" });
    const { POST } = await import("@/app/api/invoices/[id]/payments/route");
    const headers = { "Idempotency-Key": "key-12345678" };
    const first = await POST(json({ amount: "250.50", receivedAt: "2026-11-01", method: "UPI" }, headers), ctx());
    const second = await POST(json({ amount: "250.50", receivedAt: "2026-11-01", method: "UPI" }, headers), ctx());
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(mocks.recordInvoicePayment).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_1", invoiceId: "inv_1", amount: 250.5, idempotencyKey: "key-12345678" }));
  });
});

describe("DELETE /api/invoices/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireInvoiceAccess.mockResolvedValue(access);
  });

  const row = (over: Record<string, unknown> = {}) => ({
    id: "inv_1", status: "PENDING", sentAt: null, lastReminderSentAt: null, amountReceived: null, pdfPath: "", workspaceId: "ws_1",
    invoiceNumber: "INV/1", payments: [], creditNotes: [], ...over,
  });

  it.each([
    ["sent", { sentAt: new Date() }],
    ["paid", { status: "PAID" }],
    ["partly paid", { status: "PARTIALLY_PAID", amountReceived: new Prisma.Decimal(10) }],
    ["has a payment row", { payments: [{ id: "p" }] }],
    ["has a credit note", { creditNotes: [{ id: "c" }] }],
  ])("refuses to hard-delete an invoice that is %s (void it instead)", async (_label, over) => {
    mocks.prisma.invoice.findFirst.mockResolvedValue(row(over));
    const { DELETE } = await import("@/app/api/invoices/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/invoices/inv_1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVOICE_NOT_DELETABLE");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
