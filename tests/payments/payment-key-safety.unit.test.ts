import { describe, expect, it, vi } from "vitest";
import { isProductionSecurityMode, isTestRazorpayKeyId, isTestRazorpaySecretKey, isTestStripePublishableKey, isTestStripeSecretKey } from "@/lib/payment-key-safety";

describe("payment key safety", () => {
  it("detects test keys", () => {
    expect(isTestRazorpayKeyId("rzp_test_abc")).toBe(true);
    expect(isTestRazorpaySecretKey("test_abc")).toBe(true);
    expect(isTestStripePublishableKey("pk_test_abc")).toBe(true);
    expect(isTestStripeSecretKey("sk_test_abc")).toBe(true);
  });

  it("production mode on ERP_SECURITY_MODE or NODE_ENV", () => {
    vi.stubEnv("ERP_SECURITY_MODE", "PRODUCTION");
    expect(isProductionSecurityMode()).toBe(true);
    vi.unstubAllEnvs();
  });
});
