import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRICING,
  getMonthlyPriceForInterval,
  getPlanPriceFromInterval,
  getPricingRegion,
  getPricingRegionFromCountry,
  majorAmountToRazorpayMinor,
  normalizeGatewayCurrency,
  razorpayMinorAmountToMajor,
  resolvePricingIntervalByAmount,
  roundMajorAmount,
} from "@/lib/pricing";
import { amountMajorToGatewayMinor, paidMatchesPlan } from "@/lib/subscription-checkout";

const paymentsFetch = vi.fn();

vi.mock("razorpay", () => ({
  default: class {
    payments = { fetch: (...args: unknown[]) => paymentsFetch(...args) };
  },
}));

vi.mock("@/lib/observability-distributor", () => ({
  logDistributorEvent: vi.fn(),
}));

const finalizeSubscriptionPayment = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/subscription-payment", () => ({
  finalizeSubscriptionPayment: (...args: unknown[]) => finalizeSubscriptionPayment(...args),
}));

describe("regional pricing matrix", () => {
  it("keeps India monthly catalog aligned with legacy PRICING export", () => {
    expect(PRICING.MONTHLY).toBe(1499);
    expect(PRICING.TEAM_MONTHLY).toBe(3499);
    expect(PRICING.YEARLY).toBe(14990);
    expect(PRICING.TEAM_YEARLY).toBe(34990);
    expect(PRICING.QUARTERLY).toBe(1499 * 3);
  });

  it("applies 10× annual rule for USD", () => {
    const y = getPlanPriceFromInterval({ interval: "YEARLY", region: "US" });
    expect(y.currency).toBe("USD");
    expect(y.amountMajor).toBe(50);
    const m = getPlanPriceFromInterval({ interval: "MONTHLY", region: "US" });
    expect(m.amountMajor).toBe(5);
  });

  it("uses 1000 minor units for OMR", () => {
    const p = getPlanPriceFromInterval({ interval: "MONTHLY", region: "OM" });
    expect(p.currency).toBe("OMR");
    expect(p.amountMinor).toBe(3000);
    expect(majorAmountToRazorpayMinor(p.amountMajor, "OMR")).toBe(3000);
  });

  it("resolves region from country and currency hints", () => {
    expect(getPricingRegionFromCountry("IN")).toBe("IN");
    expect(getPricingRegionFromCountry("DE")).toBe("EU");
    expect(getPricingRegionFromCountry("AE")).toBe("ROW");
    expect(
      getPricingRegion({
        explicitCountryCode: "IN",
        explicitCurrency: "USD",
      }),
    ).toBe("IN");
  });

  it("computes MRR helper per region", () => {
    const inM = getMonthlyPriceForInterval("YEARLY", "IN");
    const usM = getMonthlyPriceForInterval("YEARLY", "US");
    expect(inM).toBeCloseTo(14990 / 12, 5);
    expect(usM).toBeCloseTo(50 / 12, 5);
  });
});

describe("Razorpay amount ↔ major (gateway contract)", () => {
  it("round-trips INR/USD/EUR via ÷100", () => {
    for (const cur of ["INR", "USD", "EUR"] as const) {
      const major = 49.99;
      const minor = majorAmountToRazorpayMinor(major, cur);
      expect(minor).toBe(4999);
      expect(razorpayMinorAmountToMajor(minor, cur)).toBeCloseTo(major, 8);
    }
  });

  it("uses ÷1000 for OMR minor units", () => {
    const minor = 12_345;
    expect(razorpayMinorAmountToMajor(minor, "OMR")).toBeCloseTo(12.345, 8);
    expect(majorAmountToRazorpayMinor(12.345, "OMR")).toBe(12345);
  });

  it("normalizes unknown gateway currency to INR for safety", () => {
    expect(normalizeGatewayCurrency("gbp")).toBe("INR");
  });
});

describe("resolvePricingIntervalByAmount", () => {
  it("matches paid amount for each supported currency", () => {
    const us = getPlanPriceFromInterval({ interval: "MONTHLY", region: "US" });
    expect(
      resolvePricingIntervalByAmount({
        amountMajor: us.amountMajor,
        currency: "USD",
        region: "US",
      }),
    ).toBe("MONTHLY");

    const om = getPlanPriceFromInterval({ interval: "TEAM_YEARLY", region: "OM" });
    expect(
      resolvePricingIntervalByAmount({
        amountMajor: om.amountMajor,
        currency: "OMR",
        region: "OM",
      }),
    ).toBe("TEAM_YEARLY");
  });
});

describe("paidMatchesPlan (discounted totals)", () => {
  it("accepts exact list price in INR", () => {
    expect(paidMatchesPlan(1499, "MONTHLY", 0, "IN")).toBe(true);
  });

  it("accepts rounded OMR discount totals", () => {
    const list = getPlanPriceFromInterval("MONTHLY", "OM");
    const pct = 10;
    const charged = roundMajorAmount(list.amountMajor * (1 - pct / 100), "OMR");
    expect(paidMatchesPlan(charged, "MONTHLY", pct, "OM")).toBe(true);
  });
});

describe("processRazorpaySubscriptionPaymentVerified (mocked Razorpay + Prisma)", () => {
  beforeEach(() => {
    paymentsFetch.mockReset();
    finalizeSubscriptionPayment.mockClear();
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret_test");
  });

  it("converts OMR payment.amount using 1000 minor units, not ÷100", async () => {
    paymentsFetch.mockResolvedValue({
      amount: 27_000,
      currency: "OMR",
      notes: {
        workspaceId: "ws-omr",
        interval: "TEAM_MONTHLY",
        listAmountMajor: "9",
        chargeAmountMajor: "9",
        currency: "OMR",
        pricingRegion: "OM",
      },
    });

    const { prisma } = await import("@/lib/prisma");
    const wsSpy = vi.spyOn(prisma.workspace, "findUnique").mockResolvedValue({
      countryCode: "OM",
      baseCurrency: "OMR",
    } as never);

    const { processRazorpaySubscriptionPaymentVerified } = await import("@/lib/razorpay-subscription");

    await processRazorpaySubscriptionPaymentVerified("pay_omr_test", "ws-omr");

    expect(finalizeSubscriptionPayment).toHaveBeenCalledTimes(1);
    const arg = finalizeSubscriptionPayment.mock.calls[0][0] as { amountPaid: number; currency: string };
    expect(arg.currency).toBe("OMR");
    expect(arg.amountPaid).toBeCloseTo(27, 5);

    wsSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});
