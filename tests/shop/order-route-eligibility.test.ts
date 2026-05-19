import { beforeEach, describe, expect, it, vi } from "vitest";

const businessProfileFindUnique = vi.fn();
const productFindMany = vi.fn();
const shopOrderCreate = vi.fn();
const shopOrderUpdate = vi.fn();
const isModuleEnabledMock = vi.fn();
const dispatchNotificationMock = vi.fn();
const logActivityMock = vi.fn();
const razorpayOrderCreate = vi.fn();

type ProductWhere = {
  workspaceId?: string;
  id?: { in?: string[] };
  showInShop?: boolean;
  currentStock?: { gt?: number };
  status?: { in?: string[]; not?: string };
};

type ProductFindManyArgs = { where: ProductWhere };

type ShopOrderCreateArgs = {
  data: {
    workspaceId: string;
    items: { create: unknown[] };
  };
};

type ProductFixture = {
  id: string;
  workspaceId: string;
  name: string;
  sku: string;
  baselinePrice: number;
  currentStock: number;
  showInShop: boolean;
  status: string;
};

const products: ProductFixture[] = [
  {
    id: "prod_published",
    workspaceId: "ws_shop",
    name: "Published Product",
    sku: "PUB-1",
    baselinePrice: 250,
    currentStock: 10,
    showInShop: true,
    status: "IN_STOCK",
  },
  {
    id: "prod_hidden",
    workspaceId: "ws_shop",
    name: "Hidden Product",
    sku: "HID-1",
    baselinePrice: 150,
    currentStock: 10,
    showInShop: false,
    status: "IN_STOCK",
  },
  {
    id: "prod_out",
    workspaceId: "ws_shop",
    name: "Out of Stock Product",
    sku: "OUT-1",
    baselinePrice: 150,
    currentStock: 0,
    showInShop: true,
    status: "OUT_OF_STOCK",
  },
  {
    id: "prod_other_workspace",
    workspaceId: "ws_other",
    name: "Other Workspace Product",
    sku: "OTH-1",
    baselinePrice: 150,
    currentStock: 10,
    showInShop: true,
    status: "IN_STOCK",
  },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    businessProfile: {
      findUnique: (...args: unknown[]) => businessProfileFindUnique(...args),
    },
    product: {
      findMany: (...args: unknown[]) => productFindMany(...args),
    },
    shopOrder: {
      create: (...args: unknown[]) => shopOrderCreate(...args),
      update: (...args: unknown[]) => shopOrderUpdate(...args),
    },
  },
}));

vi.mock("@/lib/modules", () => ({
  isModuleEnabled: (...args: unknown[]) => isModuleEnabledMock(...args),
}));

vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn(() => "decrypted_secret") }));
vi.mock("@/lib/notifications/dispatcher", () => ({
  dispatchNotification: (...args: unknown[]) => dispatchNotificationMock(...args),
}));
vi.mock("@/lib/security/activity-log", () => ({
  logActivity: (...args: unknown[]) => logActivityMock(...args),
}));

vi.mock("razorpay", () => ({
  default: class Razorpay {
    orders = { create: razorpayOrderCreate };
  },
}));

function productMatchesWhere(product: ProductFixture, where: ProductWhere) {
  if (where.workspaceId !== product.workspaceId) return false;
  if (!where.id?.in?.includes(product.id)) return false;
  if (typeof where.showInShop === "boolean" && where.showInShop !== product.showInShop) return false;
  if (where.currentStock?.gt !== undefined && !(product.currentStock > where.currentStock.gt)) return false;
  if (where.status?.in && !where.status.in.includes(product.status)) return false;
  if (where.status?.not && product.status === where.status.not) return false;
  return true;
}

async function postOrder(productId: string, quantity = 1) {
  const { POST } = await import("@/app/api/shop/[slug]/order/route");
  return POST(
    new Request("http://localhost/api/shop/demo-shop/order", {
      method: "POST",
      body: JSON.stringify({
        buyerName: "Buyer One",
        buyerEmail: "buyer@example.com",
        items: [{ productId, quantity }],
      }),
    }),
    { params: Promise.resolve({ slug: "demo-shop" }) },
  );
}

describe("shop order product eligibility", () => {
  beforeEach(() => {
    vi.resetModules();
    businessProfileFindUnique.mockReset();
    productFindMany.mockReset();
    shopOrderCreate.mockReset();
    shopOrderUpdate.mockReset();
    isModuleEnabledMock.mockReset();
    dispatchNotificationMock.mockReset();
    logActivityMock.mockReset();
    razorpayOrderCreate.mockReset();

    businessProfileFindUnique.mockResolvedValue({
      workspaceId: "ws_shop",
      shopEnabled: true,
      companyName: "Demo Shop",
      razorpayKeyId: "rzp_test_key",
      razorpayKeySecret: "encrypted_secret",
      defaultGateway: "RAZORPAY",
      stripePublishableKey: null,
      workspace: { id: "ws_shop" },
    });
    isModuleEnabledMock.mockResolvedValue(true);
    productFindMany.mockImplementation(({ where }: ProductFindManyArgs) =>
      products.filter((product) => productMatchesWhere(product, where)),
    );
    shopOrderCreate.mockImplementation(({ data }: ShopOrderCreateArgs) =>
      Promise.resolve({
        id: "order_1",
        workspaceId: data.workspaceId,
        status: "PENDING",
        items: data.items.create,
      }),
    );
    shopOrderUpdate.mockResolvedValue({ id: "order_1" });
    dispatchNotificationMock.mockResolvedValue(undefined);
    logActivityMock.mockResolvedValue(undefined);
    razorpayOrderCreate.mockResolvedValue({
      id: "rzp_order_1",
      amount: 25000,
      currency: "INR",
    });
  });

  it("creates an order for a published in-stock product", async () => {
    const res = await postOrder("prod_published");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      gateway: "RAZORPAY",
      orderId: "order_1",
      rpOrderId: "rzp_order_1",
    });
    expect(productFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws_shop",
          id: { in: ["prod_published"] },
          showInShop: true,
          currentStock: { gt: 0 },
          status: { in: ["IN_STOCK", "LOW_STOCK"] },
        }),
      }),
    );
    expect(shopOrderCreate).toHaveBeenCalled();
  });

  it("rejects a hidden product with a generic availability error", async () => {
    const res = await postOrder("prod_hidden");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Product is not available in this shop." });
    expect(shopOrderCreate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-stock product with a generic availability error", async () => {
    const res = await postOrder("prod_out");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Product is not available in this shop." });
    expect(shopOrderCreate).not.toHaveBeenCalled();
  });

  it("rejects a product from another workspace with a generic availability error", async () => {
    const res = await postOrder("prod_other_workspace");

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Product is not available in this shop." });
    expect(shopOrderCreate).not.toHaveBeenCalled();
  });
});
