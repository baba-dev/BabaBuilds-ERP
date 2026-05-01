import { describe, expect, it, vi, beforeEach } from "vitest";

const shopOrderFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shopOrder: {
      findFirst: (...args: unknown[]) => shopOrderFindFirst(...args),
      update: vi.fn(),
    },
  },
}));

const isModuleEnabledMock = vi.fn();
vi.mock("@/lib/modules", () => ({
  isModuleEnabled: (...args: unknown[]) => isModuleEnabledMock(...args),
}));

const commitShopOrderPaymentMock = vi.fn();
vi.mock("@/lib/shop/commit-shop-order-payment", () => ({
  commitShopOrderPayment: (...args: unknown[]) => commitShopOrderPaymentMock(...args),
}));

vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn(() => "secret") }));

describe("shop verify route module gating", () => {
  beforeEach(() => {
    shopOrderFindFirst.mockReset();
    isModuleEnabledMock.mockReset();
    commitShopOrderPaymentMock.mockReset();
  });

  it("returns 404 without verifying/committing when SHOP module is disabled", async () => {
    shopOrderFindFirst.mockResolvedValue({
      id: "order_1",
      workspaceId: "ws_1",
      status: "PENDING",
      gateway: "RAZORPAY",
      razorpayOrderId: "rzp_order_1",
      workspace: {
        businessProfile: {
          razorpayKeySecret: "encrypted",
        },
      },
    });
    isModuleEnabledMock.mockResolvedValue(false);

    const { POST } = await import("@/app/api/shop/[slug]/verify/route");
    const res = await POST(
      new Request("http://localhost/api/shop/demo/verify", {
        method: "POST",
        body: JSON.stringify({
          shopOrderId: "order_1",
          razorpayOrderId: "rzp_order_1",
          razorpayPaymentId: "pay_1",
          razorpaySignature: "sig",
        }),
      }),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Order not found." });
    expect(isModuleEnabledMock).toHaveBeenCalledWith("ws_1", "SHOP");
    expect(commitShopOrderPaymentMock).not.toHaveBeenCalled();
  });
});
