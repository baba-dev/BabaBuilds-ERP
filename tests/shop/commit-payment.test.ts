import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  order: { findFirst: vi.fn(), update: vi.fn() },
  tx: {
    product: { findMany: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    inventoryMovement: { findFirst: vi.fn(), create: vi.fn() },
    client: { findFirst: vi.fn(), create: vi.fn() },
    invoice: { create: vi.fn() },
    invoicePayment: { create: vi.fn() },
    shopOrder: { update: vi.fn() },
  },
  notify: vi.fn(),
  email: vi.fn(),
  number: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { shopOrder: m.order, $transaction: (fn: (t: typeof m.tx) => unknown) => fn(m.tx) } }));
vi.mock("@/lib/document-numbering", async (orig) => ({ ...(await orig<typeof import("@/lib/document-numbering")>()), getNextInvoiceNumber: m.number }));
vi.mock("@/lib/dashboard-cache", () => ({ invalidateDashboardCacheForWorkspace: vi.fn() }));
vi.mock("@/lib/notifications/dispatcher", () => ({ dispatchNotification: m.notify }));
vi.mock("@/lib/shop/buyer-email", () => ({ emailBuyer: m.email }));

const ORDER = {
  id: "o1", workspaceId: "ws", status: "PENDING", gateway: "RAZORPAY", currency: "INR", amount: 590, taxTotal: 90, buyerName: "Asha", buyerEmail: "asha@example.com", buyerPhone: null,
  buyerStateCode: "27", buyerGstin: null, shippingAddress: "12 Market Road, Pune", razorpayOrderId: "rp1", razorpayPaymentId: null, razorpaySignature: null, stripePaymentIntentId: null, linkedInvoiceId: null, linkedInvoice: null,
  items: [{ productId: "p1", productName: "Cement", sku: "C1", quantity: 2, unitPrice: 250, taxRate: 18, lineTotal: 500 }],
  workspace: { countryCode: "IN", businessProfile: { shopSlug: "demo", invoicePrefix: "BB", gstin: null, gstStateCode: "27" } },
};

async function run(source: "VERIFY" | "ADMIN" = "VERIFY") {
  const { commitShopOrderPayment } = await import("@/lib/shop/commit-shop-order-payment");
  return commitShopOrderPayment({ shopOrderId: "o1", workspaceId: "ws", source, expectedSlug: "demo", gatewayBinding: { gateway: "RAZORPAY", orderId: "rp1", paymentId: "pay_1", signature: "sig" } });
}

describe("commitShopOrderPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.order.findFirst.mockResolvedValue(ORDER);
    m.order.update.mockResolvedValue({});
    m.notify.mockResolvedValue(undefined);
    m.number.mockResolvedValue({ invoiceNumber: "BB/26-27/001", financialYear: "26-27" });
    m.tx.product.findMany.mockResolvedValue([{ id: "p1", hsnCode: "2523" }]);
    m.tx.product.updateMany.mockResolvedValue({ count: 1 });
    m.tx.product.findUniqueOrThrow.mockResolvedValue({ currentStock: 8, safetyStock: 3 });
    m.tx.product.update.mockResolvedValue({});
    m.tx.inventoryMovement.findFirst.mockResolvedValue(null);
    m.tx.client.findFirst.mockResolvedValue(null);
    m.tx.client.create.mockResolvedValue({ id: "c1", name: "Asha", gstStateCode: "27", country: "IN" });
    m.tx.invoice.create.mockResolvedValue({ id: "inv1" });
    m.tx.shopOrder.update.mockResolvedValue({ id: "o1", linkedInvoiceId: "inv1" });
  });

  it("takes stock, adds the buyer to the CRM and raises a paid invoice with its payment", async () => {
    const r = await run();
    expect(r).toMatchObject({ ok: true, alreadyPaid: false, linkedInvoiceId: "inv1" });
    expect(m.tx.client.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "asha@example.com", source: "SHOP", gstStateCode: "27" }) });
    expect(m.tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: "SHOP", status: "PAID", clientId: "c1", invoiceNumber: "BB/26-27/001" }) });
    expect(m.tx.invoicePayment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reference: "pay_1", idempotencyKey: "shop-order-o1" }) });
    expect(m.tx.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: -2, balanceAfter: 8 }) });
    expect(m.tx.shopOrder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PAID", linkedInvoiceId: "inv1" }) }));
    expect(m.email).toHaveBeenCalledWith("o1", "PAID");
  });

  it("reuses an existing customer with the same email", async () => {
    m.tx.client.findFirst.mockResolvedValueOnce({ id: "c9", name: "Asha K", gstStateCode: null });
    await run();
    expect(m.tx.client.create).not.toHaveBeenCalled();
    expect(m.tx.invoice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ clientId: "c9" }) });
  });

  it("parks a paid order as REFUND_DUE when stock ran out, and keeps no partial changes", async () => {
    m.tx.product.updateMany.mockResolvedValue({ count: 0 });
    const r = await run();
    expect(r).toMatchObject({ ok: false, code: "STOCK_COMMIT_FAILED", refundDue: true });
    expect(m.tx.invoice.create).not.toHaveBeenCalled();
    expect(m.order.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: expect.objectContaining({ status: "REFUND_DUE" }) });
    expect(m.email).toHaveBeenCalledWith("o1", "REFUND_DUE");
  });

  it("leaves the order alone when an owner marks it paid by hand and stock is short", async () => {
    m.tx.product.updateMany.mockResolvedValue({ count: 0 });
    const { commitShopOrderPayment } = await import("@/lib/shop/commit-shop-order-payment");
    const r = await commitShopOrderPayment({ shopOrderId: "o1", workspaceId: "ws", source: "ADMIN" });
    expect(r).toMatchObject({ ok: false, refundDue: false });
    expect(m.order.update).not.toHaveBeenCalled();
  });

  it("is idempotent for an order that is already paid", async () => {
    m.order.findFirst.mockResolvedValueOnce({ ...ORDER, status: "SHIPPED", linkedInvoiceId: "inv1" });
    const r = await run();
    expect(r).toMatchObject({ ok: true, alreadyPaid: true, linkedInvoiceId: "inv1" });
    expect(m.tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a payment whose amount does not match the order", async () => {
    const { commitShopOrderPayment } = await import("@/lib/shop/commit-shop-order-payment");
    const r = await commitShopOrderPayment({ shopOrderId: "o1", workspaceId: "ws", source: "VERIFY", gatewayBinding: { gateway: "RAZORPAY", orderId: "rp1", amountSubunits: 100, currency: "INR" } });
    expect(r).toMatchObject({ ok: false, code: "VERIFY_BINDING_FAILED" });
  });
});
