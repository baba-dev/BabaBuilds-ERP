/**
 * Google Play Billing: product catalogue and subscription-state mapping (pure, no I/O).
 *
 * Play Console setup this file assumes (see docs/android-play-store.md):
 *  - ONE subscription product per interval, each with ONE auto-renewing base plan.
 *    The Digital Goods API used by Trusted Web Activities addresses a subscription by its
 *    product id, so multiple base plans under one product are not reliably selectable.
 *  - Prices are set in Play Console (Play charges the user, not us). Distributor / reseller coupon
 *    codes do not apply to Play purchases; use Play promo codes instead.
 */

import type { SubscriptionIntervalKey } from "@/lib/subscription-checkout";

/** Play subscription product ids. Must match Play Console exactly. */
export const PLAY_SKU_BY_INTERVAL: Readonly<Record<SubscriptionIntervalKey, string>> = {
  MONTHLY: "bababuilds_pro_monthly",
  QUARTERLY: "bababuilds_pro_quarterly",
  YEARLY: "bababuilds_pro_yearly",
  TEAM_MONTHLY: "bababuilds_team_monthly",
  TEAM_YEARLY: "bababuilds_team_yearly",
};

export const PLAY_PRODUCT_IDS: readonly string[] = Object.values(PLAY_SKU_BY_INTERVAL);

/** Google Play's billing method identifier for the Payment Request API (TWA). */
export const PLAY_BILLING_METHOD = "https://play.google.com/billing";

export function skuForInterval(interval: SubscriptionIntervalKey): string {
  return PLAY_SKU_BY_INTERVAL[interval];
}

export function intervalFromSku(sku: string | null | undefined): SubscriptionIntervalKey | null {
  if (!sku) return null;
  for (const [interval, id] of Object.entries(PLAY_SKU_BY_INTERVAL)) {
    if (id === sku) return interval as SubscriptionIntervalKey;
  }
  return null;
}

/** Google `SubscriptionPurchaseV2.subscriptionState` values we act on. */
export type PlaySubscriptionState =
  | "SUBSCRIPTION_STATE_PENDING"
  | "SUBSCRIPTION_STATE_ACTIVE"
  | "SUBSCRIPTION_STATE_PAUSED"
  | "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  | "SUBSCRIPTION_STATE_ON_HOLD"
  | "SUBSCRIPTION_STATE_CANCELED"
  | "SUBSCRIPTION_STATE_EXPIRED"
  | "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"
  | "SUBSCRIPTION_STATE_UNSPECIFIED";

/**
 * Whether the user should currently have paid access.
 *  - ACTIVE: paid and renewing.
 *  - CANCELED: auto-renew switched off, but paid access lasts until `expiry`.
 *  - IN_GRACE_PERIOD: renewal payment failed, Google is retrying; Play requires keeping access.
 * ON_HOLD / PAUSED / PENDING / EXPIRED are not entitled.
 */
export function isEntitledState(state: string | null | undefined, expiry: Date | null, now = new Date()): boolean {
  if (!expiry || expiry.getTime() <= now.getTime()) return false;
  return (
    state === "SUBSCRIPTION_STATE_ACTIVE" ||
    state === "SUBSCRIPTION_STATE_CANCELED" ||
    state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  );
}

/** Subset of Google's SubscriptionPurchaseV2 resource that we read. */
export type PlaySubscriptionPurchaseV2 = {
  kind?: string;
  startTime?: string;
  regionCode?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: "ACKNOWLEDGEMENT_STATE_UNSPECIFIED" | "ACKNOWLEDGEMENT_STATE_PENDING" | "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  testPurchase?: Record<string, never>;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: {
      autoRenewEnabled?: boolean;
      recurringPrice?: { currencyCode?: string; units?: string; nanos?: number };
    };
    prepaidPlan?: { allowExtendAfterTime?: string };
  }>;
};

export type NormalizedPlayPurchase = {
  productId: string;
  interval: SubscriptionIntervalKey;
  state: string;
  expiresAt: Date | null;
  autoRenewing: boolean;
  latestOrderId: string | null;
  linkedPurchaseToken: string | null;
  isTestPurchase: boolean;
  needsAcknowledgement: boolean;
  /** Price Google actually charges per period (major units), when reported. */
  price: { amountMajor: number; currency: string } | null;
};

export class PlayPurchaseRejectedError extends Error {
  constructor(
    message: string,
    public readonly code: "UNKNOWN_PRODUCT" | "NO_LINE_ITEM" | "TEST_PURCHASE_NOT_ALLOWED",
  ) {
    super(message);
    this.name = "PlayPurchaseRejectedError";
  }
}

/** Validate and flatten Google's response. Throws PlayPurchaseRejectedError for unusable purchases. */
export function normalizePlayPurchase(
  raw: PlaySubscriptionPurchaseV2,
  opts: { allowTestPurchases: boolean },
): NormalizedPlayPurchase {
  const item = raw.lineItems?.[0];
  if (!item) throw new PlayPurchaseRejectedError("Purchase has no line items.", "NO_LINE_ITEM");

  const interval = intervalFromSku(item.productId);
  if (!interval || !item.productId) {
    throw new PlayPurchaseRejectedError(`Unknown Play product "${item.productId ?? ""}".`, "UNKNOWN_PRODUCT");
  }

  const isTestPurchase = raw.testPurchase !== undefined;
  if (isTestPurchase && !opts.allowTestPurchases) {
    throw new PlayPurchaseRejectedError("Test purchases are not accepted in this environment.", "TEST_PURCHASE_NOT_ALLOWED");
  }

  const expiry = item.expiryTime ? new Date(item.expiryTime) : null;
  const money = item.autoRenewingPlan?.recurringPrice;
  const price =
    money?.currencyCode && (money.units !== undefined || money.nanos !== undefined)
      ? {
          amountMajor: Number(money.units ?? 0) + (money.nanos ?? 0) / 1_000_000_000,
          currency: money.currencyCode,
        }
      : null;

  return {
    productId: item.productId,
    interval,
    state: raw.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED",
    expiresAt: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
    autoRenewing: item.autoRenewingPlan?.autoRenewEnabled === true,
    latestOrderId: raw.latestOrderId ?? null,
    linkedPurchaseToken: raw.linkedPurchaseToken ?? null,
    isTestPurchase,
    needsAcknowledgement: raw.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
    price,
  };
}

/** Real-time developer notification (decoded Pub/Sub message body). */
export type PlayDeveloperNotification = {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number; refundType?: number };
  testNotification?: { version?: string };
};
