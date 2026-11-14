import { beforeEach, describe, expect, it, vi } from "vitest";

import { PLAY_SKU_BY_INTERVAL } from "@/lib/billing/play-products";

const db = vi.hoisted(() => {
  const tx = {
    playPurchase: { upsert: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    workspace: { update: vi.fn(), findUnique: vi.fn() },
    billingTransaction: { upsert: vi.fn(), updateMany: vi.fn() },
  };
  return { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const google = vi.hoisted(() => ({ getSubscriptionPurchaseV2: vi.fn(), acknowledgeSubscription: vi.fn() }));
vi.mock("@/lib/billing/google-play-client", async (orig) => ({ ...(await orig<object>()), ...google }));

const downgrade = vi.hoisted(() => ({ downgradeWorkspaceToFree: vi.fn() }));
vi.mock("@/lib/billing/downgrade", () => downgrade);
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));

import { PlayBindingError, syncPlayPurchase } from "@/lib/billing/play-subscription";

const future = new Date(Date.now() + 30 * 86_400_000);
const TOKEN = "token-abcdefghijklmnop";

function purchase(over: Record<string, unknown> = {}) {
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    latestOrderId: "GPA.1",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    lineItems: [
      {
        productId: PLAY_SKU_BY_INTERVAL.TEAM_MONTHLY,
        expiryTime: future.toISOString(),
        autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: "INR", units: "1999", nanos: 0 } },
      },
    ],
    ...over,
  };
}

const freeWs = { id: "w1", subscriptionStatus: "FREE", subscriptionEndsAt: null, billingProvider: null, billingProviderSubscriptionId: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  db.playPurchase.findUnique.mockResolvedValue(null);
  db.workspace.findUnique.mockResolvedValue(freeWs);
  google.getSubscriptionPurchaseV2.mockResolvedValue(purchase());
  db.playPurchase.update.mockResolvedValue({});
});

describe("syncPlayPurchase", () => {
  it("binds a new purchase, grants the tier until Google's expiry, records the charge and acknowledges", async () => {
    const result = await syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" });

    expect(result).toMatchObject({ ok: true, ignored: false, entitled: true, interval: "TEAM_MONTHLY" });
    expect(db.playPurchase.upsert.mock.calls[0][0].create).toMatchObject({ workspaceId: "w1", purchaseToken: TOKEN, productId: PLAY_SKU_BY_INTERVAL.TEAM_MONTHLY });
    expect(db.workspace.update.mock.calls[0][0].data).toMatchObject({
      subscriptionStatus: "TEAM",
      planTier: "TEAM",
      planInterval: "TEAM_MONTHLY",
      subscriptionEndsAt: future,
      billingProvider: "GOOGLE_PLAY",
      billingContractType: "RECURRING",
      billingProviderSubscriptionId: TOKEN,
      subscriptionCancelAtPeriodEnd: false,
    });
    const tx = db.billingTransaction.upsert.mock.calls[0][0];
    expect(tx.where.workspaceId_providerReference).toEqual({ workspaceId: "w1", providerReference: "GPA.1" });
    expect(Number(tx.create.amount)).toBe(1999);
    expect(google.acknowledgeSubscription).toHaveBeenCalledWith(PLAY_SKU_BY_INTERVAL.TEAM_MONTHLY, TOKEN);
  });

  it("refuses a token that is already bound to another workspace", async () => {
    db.playPurchase.findUnique.mockResolvedValue({ purchaseToken: TOKEN, workspaceId: "someone-else" });
    await expect(syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" })).rejects.toBeInstanceOf(PlayBindingError);
    expect(google.getSubscriptionPurchaseV2).not.toHaveBeenCalled();
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("refuses a resubscribe that links to another workspace's token", async () => {
    google.getSubscriptionPurchaseV2.mockResolvedValue(purchase({ linkedPurchaseToken: "old-token" }));
    db.playPurchase.findUnique.mockImplementation(async ({ where }: { where: { purchaseToken: string } }) =>
      where.purchaseToken === "old-token" ? { purchaseToken: "old-token", workspaceId: "someone-else" } : null,
    );
    await expect(syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" })).rejects.toBeInstanceOf(PlayBindingError);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("ignores RTDN for an unknown token without calling Google", async () => {
    const result = await syncPlayPurchase({ purchaseToken: TOKEN, source: "rtdn" });
    expect(result).toEqual({ ok: true, ignored: true, reason: "UNKNOWN_TOKEN" });
    expect(google.getSubscriptionPurchaseV2).not.toHaveBeenCalled();
  });

  it("resolves the workspace from the stored binding for RTDN", async () => {
    db.playPurchase.findUnique.mockResolvedValue({ purchaseToken: TOKEN, workspaceId: "w1" });
    const result = await syncPlayPurchase({ purchaseToken: TOKEN, source: "rtdn" });
    expect(result).toMatchObject({ ignored: false, workspaceId: "w1", entitled: true });
  });

  it("mirrors auto-renew off as cancel-at-period-end while keeping access", async () => {
    google.getSubscriptionPurchaseV2.mockResolvedValue(
      purchase({
        subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
        lineItems: [{ productId: PLAY_SKU_BY_INTERVAL.YEARLY, expiryTime: future.toISOString(), autoRenewingPlan: { autoRenewEnabled: false } }],
      }),
    );
    await syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" });
    expect(db.workspace.update.mock.calls[0][0].data).toMatchObject({
      subscriptionStatus: "PRO",
      subscriptionCancelAtPeriodEnd: true,
      subscriptionCancelEffectiveAt: future,
    });
    expect(downgrade.downgradeWorkspaceToFree).not.toHaveBeenCalled();
  });

  it("does not record a ledger charge during a payment grace period, but keeps access", async () => {
    google.getSubscriptionPurchaseV2.mockResolvedValue(purchase({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }));
    const result = await syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" });
    expect(result).toMatchObject({ entitled: true });
    expect(db.billingTransaction.upsert).not.toHaveBeenCalled();
  });

  it("keeps a longer-running purchase from another provider instead of shortening it", async () => {
    const later = new Date(future.getTime() + 200 * 86_400_000);
    db.workspace.findUnique.mockResolvedValue({ ...freeWs, subscriptionStatus: "PRO", subscriptionEndsAt: later, billingProvider: "RAZORPAY" });
    await syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" });
    expect(db.workspace.update.mock.calls[0][0].data.subscriptionEndsAt).toEqual(later);
  });

  it("does not acknowledge or grant access for a pending purchase", async () => {
    google.getSubscriptionPurchaseV2.mockResolvedValue(purchase({ subscriptionState: "SUBSCRIPTION_STATE_PENDING" }));
    const result = await syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" });
    expect(result).toMatchObject({ entitled: false, state: "SUBSCRIPTION_STATE_PENDING" });
    expect(db.workspace.update).not.toHaveBeenCalled();
    expect(google.acknowledgeSubscription).not.toHaveBeenCalled();
    expect(downgrade.downgradeWorkspaceToFree).not.toHaveBeenCalled();
  });

  describe("losing entitlement", () => {
    const expired = purchase({
      subscriptionState: "SUBSCRIPTION_STATE_EXPIRED",
      lineItems: [{ productId: PLAY_SKU_BY_INTERVAL.MONTHLY, expiryTime: new Date(Date.now() - 1000).toISOString() }],
    });

    it("downgrades when this token is what powers the workspace", async () => {
      google.getSubscriptionPurchaseV2.mockResolvedValue(expired);
      db.playPurchase.findUnique.mockResolvedValue({ purchaseToken: TOKEN, workspaceId: "w1" });
      db.workspace.findUnique.mockResolvedValue({ ...freeWs, subscriptionStatus: "PRO", billingProvider: "GOOGLE_PLAY", billingProviderSubscriptionId: TOKEN });
      await syncPlayPurchase({ purchaseToken: TOKEN, source: "rtdn" });
      expect(downgrade.downgradeWorkspaceToFree).toHaveBeenCalledWith("w1", "subscription_expired");
    });

    it("never downgrades because of an old token when a newer one is active", async () => {
      google.getSubscriptionPurchaseV2.mockResolvedValue(expired);
      db.playPurchase.findUnique.mockResolvedValue({ purchaseToken: TOKEN, workspaceId: "w1" });
      db.workspace.findUnique.mockResolvedValue({ ...freeWs, subscriptionStatus: "PRO", billingProvider: "GOOGLE_PLAY", billingProviderSubscriptionId: "newer-token" });
      await syncPlayPurchase({ purchaseToken: TOKEN, source: "rtdn" });
      expect(downgrade.downgradeWorkspaceToFree).not.toHaveBeenCalled();
    });

    it("never touches a Razorpay/Stripe subscription", async () => {
      google.getSubscriptionPurchaseV2.mockResolvedValue(expired);
      db.playPurchase.findUnique.mockResolvedValue({ purchaseToken: TOKEN, workspaceId: "w1" });
      db.workspace.findUnique.mockResolvedValue({ ...freeWs, subscriptionStatus: "PRO", billingProvider: "RAZORPAY", billingProviderSubscriptionId: "sub_x" });
      await syncPlayPurchase({ purchaseToken: TOKEN, source: "rtdn" });
      expect(downgrade.downgradeWorkspaceToFree).not.toHaveBeenCalled();
    });
  });

  it("rejects test purchases in production unless allowed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    google.getSubscriptionPurchaseV2.mockResolvedValue(purchase({ testPurchase: {} }));
    await expect(syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" })).rejects.toThrow(/Test purchases/);
    expect(db.workspace.update).not.toHaveBeenCalled();

    vi.stubEnv("GOOGLE_PLAY_ALLOW_TEST_PURCHASES", "true");
    await expect(syncPlayPurchase({ purchaseToken: TOKEN, workspaceId: "w1", source: "client_verify" })).resolves.toMatchObject({ entitled: true });
  });
});
