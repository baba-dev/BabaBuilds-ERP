import { beforeEach, describe, expect, it, vi } from "vitest";

const shopOrderFindFirst = vi.fn();
const shopOrderUpdate = vi.fn();
const commitShopOrderPayment = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: {
      findFirst: (...args: unknown[]) => shopOrderFindFirst(...args),
      update: (...args: unknown[]) => shopOrderUpdate(...args),
    },
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(() => "test_razorpay_secret"),
}));

vi.mock("@/lib/shop/commit-shop-order-payment", () => ({
  commitShopOrderPayment: (...args: unknown[]) => commitShopOrderPayment(...args),
}));

vi.mock("@/lib/modules", () => ({
  isModuleEnabled: vi.fn().mockResolvedValue(true),
}));

describe("shop verify route signature validation", () => {
  beforeEach(() => {
    shopOrderFindFirst.mockReset();
    shopOrderUpdate.mockReset();
    commitShopOrderPayment.mockReset();
  });

  it("rejects invalid razorpay signature and marks order as failed", async () => {
    const { POST } = await import("@/app/api/shop/[slug]/verify/route");

    shopOrderFindFirst.mockResolvedValue({
      id: "so_1",
      status: "PENDING",
      gateway: "RAZORPAY",
      razorpayOrderId: "order_abc",
      workspaceId: "ws_1",
      workspace: {
        businessProfile: {
          shopSlug: "demo-shop",
          razorpayKeySecret: "encrypted",
        },
      },
    });

    const req = new Request("http://localhost/api/shop/demo-shop/verify", {
      method: "POST",
      body: JSON.stringify({
        shopOrderId: "so_1",
        razorpayOrderId: "order_abc",
        razorpayPaymentId: "pay_123",
        razorpaySignature: "bad_signature",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ slug: "demo-shop" }) });

    expect(res.status).toBe(400);
    expect(shopOrderUpdate).toHaveBeenCalledWith({ where: { id: "so_1" }, data: { status: "FAILED" } });
    expect(commitShopOrderPayment).not.toHaveBeenCalled();
  });
});
