/**
 * Browser side of Google Play Billing for the Android app (Trusted Web Activity).
 *
 * Flow: Digital Goods API (`getDigitalGoodsService`) for product details + Payment Request API with the
 * `https://play.google.com/billing` method to run the purchase UI. The purchase token it returns is sent to
 * our server, which verifies it with Google (never trust the client) before granting access.
 * Only works inside a TWA built with the Play Billing feature; elsewhere every function is a safe no-op.
 */

import { PLAY_BILLING_METHOD, skuForInterval } from "@/lib/billing/play-products";
import type { SubscriptionIntervalKey } from "@/lib/subscription-checkout";

export const ANDROID_APP_FLAG = "baba_android_app";
const TWA_REFERRER_PREFIX = "android-app://";

type DigitalGoodsItem = {
  itemId: string;
  title: string;
  description?: string;
  price: { currency: string; value: string };
  subscriptionPeriod?: string;
};
type DigitalGoodsService = { getDetails(itemIds: string[]): Promise<DigitalGoodsItem[]> };
type WindowWithDigitalGoods = Window & {
  getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService>;
};

/** Remember that this session started from the Android app (the referrer is only set on first load). */
export function markAndroidAppSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (document.referrer.startsWith(TWA_REFERRER_PREFIX)) {
      sessionStorage.setItem(ANDROID_APP_FLAG, "1");
      // Survives app restarts; only used to choose which billing UI to show (not a security signal).
      document.cookie = `${ANDROID_APP_FLAG}=1; path=/; max-age=31536000; SameSite=Lax; Secure`;
      return true;
    }
  } catch {
    /* storage blocked */
  }
  return isAndroidAppSession();
}

export function isAndroidAppSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(ANDROID_APP_FLAG) === "1") return true;
  } catch {
    /* ignore */
  }
  return document.cookie.split("; ").some((c) => c === `${ANDROID_APP_FLAG}=1`) || document.referrer.startsWith(TWA_REFERRER_PREFIX);
}

export async function getPlayBillingService(): Promise<DigitalGoodsService | null> {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithDigitalGoods;
  if (typeof w.getDigitalGoodsService !== "function") return null;
  try {
    return await w.getDigitalGoodsService(PLAY_BILLING_METHOD);
  } catch {
    return null;
  }
}

export type PlayPlanDetails = {
  interval: SubscriptionIntervalKey;
  sku: string;
  title: string;
  /** Localised price exactly as Google will charge it. */
  price: { currency: string; value: string };
};

/** Fetch Google's localised titles/prices for the given intervals. Missing products are skipped. */
export async function loadPlayPlans(intervals: SubscriptionIntervalKey[]): Promise<PlayPlanDetails[]> {
  const service = await getPlayBillingService();
  if (!service) return [];
  const skus = intervals.map(skuForInterval);
  const details = await service.getDetails(skus);
  const bySku = new Map(details.map((d) => [d.itemId, d]));
  return intervals.flatMap((interval) => {
    const d = bySku.get(skuForInterval(interval));
    return d ? [{ interval, sku: d.itemId, title: d.title, price: d.price }] : [];
  });
}

export class PlayPurchaseCancelledError extends Error {
  constructor() {
    super("Purchase cancelled.");
    this.name = "PlayPurchaseCancelledError";
  }
}

/**
 * Opens Google Play's purchase sheet for `interval`, then calls `verify(token)` (our server). The payment
 * is only completed (`success`) when the server accepted it; otherwise it is reported as failed.
 */
export async function purchasePlayPlan(
  interval: SubscriptionIntervalKey,
  verify: (purchaseToken: string) => Promise<void>,
): Promise<void> {
  if (typeof PaymentRequest === "undefined") throw new Error("Payments are not supported on this device.");
  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: skuForInterval(interval) } }],
    // Play shows its own price; this total is required by the API but ignored for Play Billing.
    { total: { label: "Total", amount: { currency: "USD", value: "0" } } },
  );

  let response: PaymentResponse;
  try {
    response = await request.show();
  } catch (error) {
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "NotAllowedError")) {
      throw new PlayPurchaseCancelledError();
    }
    throw error;
  }

  const token = (response.details as { purchaseToken?: string } | undefined)?.purchaseToken;
  if (!token) {
    await response.complete("fail");
    throw new Error("Google Play did not return a purchase token.");
  }
  try {
    await verify(token);
    await response.complete("success");
  } catch (error) {
    await response.complete("fail");
    throw error;
  }
}
