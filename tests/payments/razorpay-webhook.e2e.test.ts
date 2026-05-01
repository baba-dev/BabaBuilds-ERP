import crypto from "crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

const processVerified = vi.fn();
const reverseCommission = vi.fn();

const prismaMock = {
  billingTransaction: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/razorpay-subscription", () => ({
  processRazorpaySubscriptionPaymentVerified: (...args: unknown[]) => processVerified(...args),
}));

vi.mock("@/lib/subscription-payment", () => ({
  reverseDistributorCommissionForBillingTx: (...args: unknown[]) => reverseCommission(...args),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/observability-distributor", () => ({ logDistributorEvent: vi.fn() }));

describe("Razorpay webhook safety", () => {
  beforeEach(() => {
    processVerified.mockReset();
    reverseCommission.mockReset();
    prismaMock.billingTransaction.findFirst.mockReset();
    prismaMock.billingTransaction.update.mockReset();
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec_test");
  });

  function sign(payload: string) {
    return crypto.createHmac("sha256", "whsec_test").update(payload).digest("hex");
  }

  it("processes successful payment once and ignores duplicates", async () => {
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const payload = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_123", notes: { workspaceId: "ws_1", interval: "MONTHLY" } } } },
    });

    prismaMock.billingTransaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "tx_1" });

    const first = await POST(new Request("http://localhost/api/webhooks/razorpay", { method: "POST", body: payload, headers: { "x-razorpay-signature": sign(payload) } }));
    const second = await POST(new Request("http://localhost/api/webhooks/razorpay", { method: "POST", body: payload, headers: { "x-razorpay-signature": sign(payload) } }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(processVerified).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid signatures", async () => {
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const payload = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_123" } } } });

    const res = await POST(new Request("http://localhost/api/webhooks/razorpay", { method: "POST", body: payload, headers: { "x-razorpay-signature": "bad" } }));
    expect(res.status).toBe(400);
  });

  it("marks refund events idempotently", async () => {
    const { POST } = await import("@/app/api/webhooks/razorpay/route");
    const payload = JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { payment_id: "pay_refund_1" } } },
    });

    prismaMock.billingTransaction.findFirst.mockResolvedValue({ id: "tx_ref", workspaceId: "ws_1" });
    prismaMock.billingTransaction.update.mockResolvedValue({ id: "tx_ref", status: "REFUNDED" });
    reverseCommission.mockResolvedValue(true);

    const res = await POST(new Request("http://localhost/api/webhooks/razorpay", { method: "POST", body: payload, headers: { "x-razorpay-signature": sign(payload) } }));

    expect(res.status).toBe(200);
    expect(prismaMock.billingTransaction.update).toHaveBeenCalledWith({ where: { id: "tx_ref" }, data: { status: "REFUNDED" } });
    expect(reverseCommission).toHaveBeenCalledTimes(1);
  });
});
