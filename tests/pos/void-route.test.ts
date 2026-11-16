import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePos: vi.fn(),
  findFirst: vi.fn(),
  reverse: vi.fn(),
  voidInvoice: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/app/api/pos/_guard", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requirePos: mocks.requirePos,
    readJson: (r: Request) => r.json().catch(() => null),
    posErrorResponse: (e: unknown) => NextResponse.json({ error: String(e) }, { status: 500 }),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/invoices/payments", () => ({ reverseInvoicePayment: mocks.reverse }));
vi.mock("@/lib/invoices/void", () => ({ voidInvoice: mocks.voidInvoice }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/route-rate-limit", () => ({ enforceRouteRateLimit: mocks.rate }));

async function call(body: unknown) {
  const { POST } = await import("@/app/api/pos/sales/[id]/void/route");
  return POST(new Request("http://x/api/pos/sales/s1/void", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "s1" }) });
}

describe("POST /api/pos/sales/[id]/void", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePos.mockResolvedValue({ access: { userId: "u1", workspaceId: "ws", email: null } });
    mocks.rate.mockReturnValue({ ok: true });
    mocks.findFirst.mockResolvedValue({ id: "s1", invoiceNumber: "INV-1", status: "PAID", payments: [{ id: "p1", amount: 100, method: "CASH" }, { id: "p2", amount: 50.5, method: "UPI" }] });
    mocks.reverse.mockResolvedValue({ ok: true, status: "PENDING" });
    mocks.voidInvoice.mockResolvedValue({ ok: true, creditNoteNumber: "CN/26-27/001" });
  });

  it("reverses every payment, then voids, and reports the refund", async () => {
    const res = await call({ reason: "Customer returned goods" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, refunded: 150.5, methods: ["CASH", "UPI"], creditNoteNumber: "CN/26-27/001" });
    expect(mocks.reverse).toHaveBeenCalledTimes(2);
    expect(mocks.reverse.mock.invocationCallOrder[1]).toBeLessThan(mocks.voidInvoice.mock.invocationCallOrder[0]);
  });

  it("needs a reason", async () => {
    const res = await call({ reason: "x" });
    expect(res.status).toBe(500); // zod error is mapped by the shared handler
    expect(mocks.voidInvoice).not.toHaveBeenCalled();
  });

  it("refuses a sale that was already refunded", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "s1", invoiceNumber: "INV-1", status: "VOID", payments: [] });
    const res = await call({ reason: "Again" });
    expect(res.status).toBe(409);
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("stops and reports when a payment cannot be reversed", async () => {
    mocks.reverse.mockResolvedValueOnce({ ok: false, status: 409, code: "ALREADY_REVERSED", message: "This payment was already reversed." });
    const res = await call({ reason: "Customer returned goods" });
    expect(res.status).toBe(409);
    expect(mocks.voidInvoice).not.toHaveBeenCalled();
  });

  it("returns the permission response when the user may not refund", async () => {
    const { NextResponse } = await import("next/server");
    mocks.requirePos.mockResolvedValueOnce({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const res = await call({ reason: "Customer returned goods" });
    expect(res.status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
