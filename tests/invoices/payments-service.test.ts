import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    invoicePayment: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    invoicePayment: { findFirst: vi.fn(), update: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
    invoice: { findFirst: vi.fn(), update: vi.fn() },
    invoiceEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn(), noteDashboardCacheIncident: vi.fn() }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/invoice/pdf-stamp", () => ({ applyInvoiceStatusStamp: vi.fn(), getInvoiceStampDescriptor: vi.fn(() => null) }));
vi.mock("@/lib/invoice/pdf-storage", () => ({ resolveInvoicePdfStoragePath: vi.fn(() => null) }));

import { recordInvoicePayment, reverseInvoicePayment } from "@/lib/invoices/payments";

const base = {
  workspaceId: "ws_1",
  userId: "u_1",
  invoiceId: "inv_1",
  receivedAt: new Date("2026-11-07T00:00:00Z"),
  method: "UPI" as const,
};

describe("recordInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (cb: (tx: typeof mocks.tx) => unknown) => cb(mocks.tx));
  });

  it("rejects non-positive amounts and invalid dates before touching the database", async () => {
    expect(await recordInvoicePayment({ ...base, amount: 0, idempotencyKey: "key-12345678" })).toMatchObject({ ok: false, code: "INVALID_AMOUNT" });
    expect(await recordInvoicePayment({ ...base, amount: 10, receivedAt: new Date("nope"), idempotencyKey: "key-12345678" })).toMatchObject({ ok: false, code: "INVALID_DATE" });
    expect(mocks.prisma.invoicePayment.findUnique).not.toHaveBeenCalled();
  });

  it("replays an identical retry instead of recording a second payment", async () => {
    mocks.prisma.invoicePayment.findUnique.mockResolvedValue({ id: "pay_1", invoiceId: "inv_1", amount: new Prisma.Decimal(500), invoice: { status: "PARTIALLY_PAID" } });
    const result = await recordInvoicePayment({ ...base, amount: 500, idempotencyKey: "key-12345678" });
    expect(result).toMatchObject({ ok: true, replayed: true, paymentId: "pay_1" });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to reuse a key for a different payment", async () => {
    mocks.prisma.invoicePayment.findUnique.mockResolvedValue({ id: "pay_1", invoiceId: "inv_1", amount: new Prisma.Decimal(500), invoice: { status: "PARTIALLY_PAID" } });
    const result = await recordInvoicePayment({ ...base, amount: 600, idempotencyKey: "key-12345678" });
    expect(result).toMatchObject({ ok: false, status: 409, code: "IDEMPOTENCY_HASH_MISMATCH" });
  });

  it("does not accept payments on a voided invoice", async () => {
    mocks.prisma.invoicePayment.findUnique.mockResolvedValue(null);
    mocks.tx.invoice.findFirst.mockResolvedValue({ id: "inv_1", status: "VOID" });
    const result = await recordInvoicePayment({ ...base, amount: 10, idempotencyKey: "key-12345678" });
    expect(result).toMatchObject({ ok: false, status: 409, code: "INVOICE_VOID" });
    expect(mocks.tx.invoicePayment.create).not.toHaveBeenCalled();
  });

  it("retries a PostgreSQL serialization conflict", async () => {
    mocks.prisma.invoicePayment.findUnique.mockResolvedValue(null);
    mocks.tx.invoice.findFirst.mockResolvedValue({ id: "inv_1", status: "VOID" });
    mocks.prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("serialization conflict", {
        code: "P2034",
        clientVersion: "test",
      }),
    );

    const result = await recordInvoicePayment({ ...base, amount: 10, idempotencyKey: "key-12345678" });

    expect(result).toMatchObject({ ok: false, code: "INVOICE_VOID" });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("blocks overpayment, counting money already received", async () => {
    mocks.prisma.invoicePayment.findUnique.mockResolvedValue(null);
    mocks.tx.invoice.findFirst.mockResolvedValue({
      id: "inv_1", workspaceId: "ws_1", status: "PARTIALLY_PAID", grandTotal: new Prisma.Decimal(1000), totalAmount: new Prisma.Decimal(1000),
      amountReceived: new Prisma.Decimal(900), dateReceived: null, createdAt: new Date(),
    });
    mocks.tx.invoicePayment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(900) } });
    const result = await recordInvoicePayment({ ...base, amount: 150, idempotencyKey: "key-12345678" });
    expect(result).toMatchObject({ ok: false, status: 400, code: "OVERPAYMENT_NOT_ALLOWED" });
    expect(mocks.tx.invoicePayment.create).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
    );
  });
});

describe("reverseInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (cb: (tx: typeof mocks.tx) => unknown) => cb(mocks.tx));
  });

  it("requires a reason", async () => {
    expect(await reverseInvoicePayment({ workspaceId: "ws_1", userId: "u_1", invoiceId: "inv_1", paymentId: "p", reason: " " })).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
  });

  it("refuses to reverse a payment twice", async () => {
    mocks.tx.invoicePayment.findFirst.mockResolvedValue({ id: "p", reversedAt: new Date(), invoice: { status: "PARTIALLY_PAID" } });
    expect(await reverseInvoicePayment({ workspaceId: "ws_1", userId: "u_1", invoiceId: "inv_1", paymentId: "p", reason: "bounced cheque" })).toMatchObject({ ok: false, status: 409, code: "ALREADY_REVERSED" });
  });
});
