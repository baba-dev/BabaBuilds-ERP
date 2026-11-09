import { describe, expect, it } from "vitest";
import { buildOverview, type OverviewInput } from "@/lib/settings/overview";

const full: NonNullable<OverviewInput["profile"]> = {
  companyName: "Acme", proprietorName: "A", address: "1 Road", email: "a@b.in", phone: "1", website: "https://a.in", logoUrl: "/logos/x.png",
  panNumber: "ABCDE1234F", gstin: "27AAPFU0939F1ZV", udyamNumber: "UDYAM-MH-12-0000001", gstRegistrationType: "REGULAR",
  bankName: "HDFC", accountName: "A", ifscCode: "HDFC0001234", hasBankAccountNumber: true,
  smtpHost: "smtp.x.com", smtpUser: "u", hasSmtpPassword: true,
  razorpayKeyId: "rzp_live_x", stripePublishableKey: null, hasRazorpayKeySecret: true, hasStripeSecretKey: false,
  shopEnabled: true, shopSlug: "acme",
};
const input = (over: Partial<OverviewInput> = {}): OverviewInput => ({ countryCode: "IN", profile: full, gatewaysEntitled: true, activeMembers: 3, ...over });
const status = (r: ReturnType<typeof buildOverview>, key: string) => r.checks.find((c) => c.key === key)?.status;

describe("setup overview", () => {
  it("is complete when everything is in place", () => {
    const r = buildOverview(input());
    expect(r.percent).toBe(100);
    expect(r.open).toBe(0);
  });

  it("puts required gaps before optional ones and counts progress", () => {
    const r = buildOverview(input({ profile: { ...full, panNumber: "", hasBankAccountNumber: false, hasSmtpPassword: false, logoUrl: null } }));
    expect(status(r, "pan")).toBe("todo");
    expect(status(r, "bank")).toBe("todo");
    expect(status(r, "email")).toBe("optional");
    expect(status(r, "logo")).toBe("optional");
    expect(r.percent).toBeLessThan(100);
    expect(r.open).toBe(4);
  });

  it("does not ask an unregistered seller for a GSTIN, or a foreign workspace for Indian IDs", () => {
    expect(status(buildOverview(input({ profile: { ...full, gstRegistrationType: "UNREGISTERED", gstin: null } })), "gstin")).toBe("na");
    const us = buildOverview(input({ countryCode: "US", profile: { ...full, gstin: null, panNumber: "123456789" } }));
    expect(status(us, "gstin")).toBe("na");
    expect(status(us, "udyam")).toBe("na");
    expect(status(us, "pan")).toBe("done");
  });

  it("treats an invalid GSTIN, PAN or Udyam number as not done", () => {
    const r = buildOverview(input({ profile: { ...full, gstin: "27AAPFU0939F1ZX", panNumber: "12345", udyamNumber: "nope" } }));
    expect(status(r, "gstin")).toBe("todo");
    expect(status(r, "pan")).toBe("todo");
    expect(status(r, "udyam")).toBe("optional");
  });

  it("hides gateways on a free plan and asks for a second member", () => {
    const r = buildOverview(input({ gatewaysEntitled: false, activeMembers: 1 }));
    expect(status(r, "payments")).toBe("na");
    expect(status(r, "team")).toBe("optional");
  });

  it("handles a workspace with no profile yet", () => {
    const r = buildOverview(input({ profile: null }));
    expect(status(r, "identity")).toBe("todo");
    expect(r.percent).toBeLessThan(50);
  });
});
