import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeCtor = vi.fn();

vi.mock("stripe", () => ({
  default: class Stripe {
    webhooks = {
      constructEvent: (rawBody: string, signature: string) => {
        if (signature !== "sig_ok") {
          throw new Error("invalid signature");
        }
        return JSON.parse(rawBody);
      },
    };
    constructor(...args: unknown[]) {
      stripeCtor(...args);
    }
  },
}));

const prismaMock = {
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<void>) => fn(prismaMock)),
  processedWebhookEvent: {
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  invoice: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  billingTransaction: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/dashboard-cache", () => ({
  invalidateDashboardCacheForWorkspace: vi.fn(),
  noteDashboardCacheIncident: vi.fn(),
}));

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    prismaMock.$transaction.mockClear();
    prismaMock.processedWebhookEvent.create.mockReset();
    prismaMock.processedWebhookEvent.updateMany.mockReset();
    prismaMock.invoice.findFirst.mockReset();
    prismaMock.invoice.updateMany.mockReset();
    prismaMock.billingTransaction.upsert.mockReset();
    prismaMock.billingTransaction.updateMany.mockReset();
    prismaMock.billingTransaction.findMany.mockReset();
    prismaMock.processedWebhookEvent.create.mockResolvedValue({ id: "pwe_1" });
    prismaMock.processedWebhookEvent.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.billingTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.billingTransaction.findMany.mockResolvedValue([
      { workspaceId: "ws_1", description: "Invoice INV-1 Settlement" },
    ]);
  });

  it("rejects invalid signatures", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const event = { id: "evt_bad", type: "checkout.session.completed", data: { object: {} } };
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "stripe-signature": "bad" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("settles invoice for checkout.session.completed", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    prismaMock.invoice.findFirst.mockResolvedValue({
      id: "inv_1",
      workspaceId: "ws_1",
      invoiceNumber: "INV-1",
      grandTotal: 100,
      status: "PENDING",
      workspace: { baseCurrency: "INR" },
    });

    const event = {
      id: "evt_ok_1",
      type: "checkout.session.completed",
      data: {
        object: {
          payment_link: "plink_1",
          payment_status: "paid",
          amount_total: 10000,
          payment_intent: "pi_1",
        },
      },
    };
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "stripe-signature": "sig_ok" },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.processedWebhookEvent.create).toHaveBeenCalled();
    expect(prismaMock.billingTransaction.upsert).toHaveBeenCalled();
  });

  it("ignores duplicate event ids", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    prismaMock.processedWebhookEvent.create.mockRejectedValueOnce(new Error("Unique constraint failed"));

    const event = { id: "evt_dup", type: "checkout.session.expired", data: { object: {} } };
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "stripe-signature": "sig_ok" },
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "duplicate_ignored" });
  });

  it("marks payment intent failed and reverts invoice settlement", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    prismaMock.billingTransaction.findMany.mockResolvedValue([
      { workspaceId: "ws_1", description: "Invoice INV-1 Settlement" },
    ]);

    const event = { id: "evt_fail", type: "payment_intent.payment_failed", data: { object: { id: "pi_1" } } };
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify(event),
        headers: { "stripe-signature": "sig_ok" },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.billingTransaction.updateMany).toHaveBeenCalled();
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws_1", invoiceNumber: "INV-1" } }),
    );
  });
});
