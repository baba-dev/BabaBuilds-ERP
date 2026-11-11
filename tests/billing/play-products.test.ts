import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildServiceAccountAssertion } from "@/lib/billing/google-play-client";
import {
  PLAY_SKU_BY_INTERVAL,
  PlayPurchaseRejectedError,
  intervalFromSku,
  isEntitledState,
  normalizePlayPurchase,
  skuForInterval,
} from "@/lib/billing/play-products";
import { PLAN_INTERVALS } from "@/lib/pricing";

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

describe("play SKU catalogue", () => {
  it("has a unique SKU for every subscription interval and round-trips", () => {
    const skus = Object.values(PLAY_SKU_BY_INTERVAL);
    expect(new Set(skus).size).toBe(skus.length);
    for (const interval of PLAN_INTERVALS) {
      expect(intervalFromSku(skuForInterval(interval))).toBe(interval);
    }
    expect(intervalFromSku("nope")).toBeNull();
    expect(intervalFromSku(null)).toBeNull();
  });
});

describe("isEntitledState", () => {
  it.each([
    ["SUBSCRIPTION_STATE_ACTIVE", future, true],
    ["SUBSCRIPTION_STATE_CANCELED", future, true], // auto-renew off, paid until expiry
    ["SUBSCRIPTION_STATE_IN_GRACE_PERIOD", future, true], // Play requires access during grace
    ["SUBSCRIPTION_STATE_ON_HOLD", future, false],
    ["SUBSCRIPTION_STATE_PAUSED", future, false],
    ["SUBSCRIPTION_STATE_PENDING", future, false],
    ["SUBSCRIPTION_STATE_EXPIRED", past, false],
    ["SUBSCRIPTION_STATE_ACTIVE", past, false], // never entitled after expiry, whatever the state says
    ["SUBSCRIPTION_STATE_ACTIVE", null, false],
  ])("%s -> %s", (state, expiry, expected) => {
    expect(isEntitledState(state, expiry as Date | null)).toBe(expected);
  });
});

describe("normalizePlayPurchase", () => {
  const base = {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    latestOrderId: "GPA.1111-2222-3333-44444",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" as const,
    lineItems: [
      {
        productId: PLAY_SKU_BY_INTERVAL.YEARLY,
        expiryTime: future.toISOString(),
        autoRenewingPlan: { autoRenewEnabled: true, recurringPrice: { currencyCode: "INR", units: "4999", nanos: 500_000_000 } },
      },
    ],
  };

  it("flattens a valid purchase", () => {
    const n = normalizePlayPurchase(base, { allowTestPurchases: false });
    expect(n).toMatchObject({
      interval: "YEARLY",
      autoRenewing: true,
      needsAcknowledgement: true,
      isTestPurchase: false,
      latestOrderId: "GPA.1111-2222-3333-44444",
      price: { amountMajor: 4999.5, currency: "INR" },
    });
    expect(n.expiresAt?.getTime()).toBe(future.getTime());
  });

  it("rejects unknown products and empty purchases", () => {
    expect(() => normalizePlayPurchase({ ...base, lineItems: [{ productId: "other_app_sku" }] }, { allowTestPurchases: true })).toThrow(PlayPurchaseRejectedError);
    expect(() => normalizePlayPurchase({ ...base, lineItems: [] }, { allowTestPurchases: true })).toThrow(PlayPurchaseRejectedError);
  });

  it("rejects test purchases unless explicitly allowed", () => {
    const test = { ...base, testPurchase: {} };
    expect(() => normalizePlayPurchase(test, { allowTestPurchases: false })).toThrow(/Test purchases/);
    expect(normalizePlayPurchase(test, { allowTestPurchases: true }).isTestPurchase).toBe(true);
  });
});

describe("service-account JWT assertion", () => {
  it("is a valid RS256 JWT with the androidpublisher scope", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const jwt = buildServiceAccountAssertion({ client_email: "svc@proj.iam.gserviceaccount.com", private_key: privateKey }, 1_700_000_000);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({
      iss: "svc@proj.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const ok = crypto.createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });
});
