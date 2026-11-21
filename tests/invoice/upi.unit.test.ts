import { describe, expect, it } from "vitest";

import { buildUpiUri, normalizePayeeName, normalizeUpiVpa, parseOptionalUpiVpa } from "@/lib/invoice/upi";

describe("normalizeUpiVpa", () => {
  it("accepts handle@provider and lower-cases it", () => {
    expect(normalizeUpiVpa("shop@okhdfc")).toBe("shop@okhdfc");
    expect(normalizeUpiVpa("  Shop.Name-1@OKAXIS ")).toBe("shop.name-1@okaxis");
    expect(normalizeUpiVpa("9876543210@ybl")).toBe("9876543210@ybl");
  });

  it("rejects anything else", () => {
    for (const bad of ["a b@c", "x", "a@b", "@bank", "name@", "javascript:alert(1)", "a".repeat(100) + "@okhdfc", "name@bank@x", "na me@bank", "näme@bank", "", "   ", null, undefined, 42, {}]) {
      expect(normalizeUpiVpa(bad), String(bad)).toBeNull();
    }
  });
});

describe("normalizePayeeName", () => {
  it("trims, collapses spaces and strips control characters", () => {
    expect(normalizePayeeName("  Baba   & Sons ")).toBe("Baba & Sons");
    expect(normalizePayeeName("Ab\u0000c\u0007d")).toBe("Abcd");
    expect(normalizePayeeName("शर्मा ट्रेडर्स")).toBe("शर्मा ट्रेडर्स");
  });

  it("rejects empty, too long or non-text names", () => {
    for (const bad of ["", "   ", "x".repeat(61), null, undefined, 5]) expect(normalizePayeeName(bad), String(bad)).toBeNull();
  });
});

describe("buildUpiUri", () => {
  it("builds the standard link with the amount and reference", () => {
    expect(buildUpiUri({ vpa: "shop@okhdfc", payeeName: "Baba & Sons", amount: 17280, note: "INV/26-27/001" })).toBe(
      "upi://pay?pa=shop%40okhdfc&pn=Baba%20%26%20Sons&am=17280.00&cu=INR&tn=INV%2F26-27%2F001",
    );
  });

  it("omits the amount when it is missing or not positive", () => {
    for (const amount of [undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildUpiUri({ vpa: "shop@okhdfc", amount: amount as number | null | undefined })).not.toContain("am=");
    }
  });

  it("rounds to paise and caps the note at 50 characters", () => {
    expect(buildUpiUri({ vpa: "shop@okhdfc", amount: 10.005 })).toMatch(/am=10\.0[01]/);
    const uri = buildUpiUri({ vpa: "shop@okhdfc", note: "x".repeat(80) }) ?? "";
    expect(decodeURIComponent(uri.split("tn=")[1])).toHaveLength(50);
  });

  it("encodes hostile payee names and drops an invalid payee", () => {
    const uri = buildUpiUri({ vpa: "shop@okhdfc", payeeName: "a=b&c?d#e%f" }) ?? "";
    expect(uri).toContain("pn=a%3Db%26c%3Fd%23e%25f");
    expect(uri.split("&").filter((p) => p.startsWith("pn="))).toHaveLength(1);
    expect(buildUpiUri({ vpa: "shop@okhdfc", payeeName: "x".repeat(200) })).not.toContain("pn=");
  });

  it("returns null for an invalid VPA", () => {
    expect(buildUpiUri({ vpa: "not a vpa" })).toBeNull();
    expect(buildUpiUri({ vpa: "javascript:alert(1)" })).toBeNull();
  });
});

describe("parseOptionalUpiVpa", () => {
  it("treats empty input as nothing to save", () => {
    for (const empty of ["", "   ", null, undefined]) expect(parseOptionalUpiVpa(empty), String(empty)).toEqual({ ok: true, value: null });
  });

  it("normalises a valid ID and rejects anything else", () => {
    expect(parseOptionalUpiVpa(" Shop@OKHDFC ")).toEqual({ ok: true, value: "shop@okhdfc" });
    for (const bad of ["not a vpa", "javascript:alert(1)", 42, {}, "a".repeat(100)]) expect(parseOptionalUpiVpa(bad), String(bad)).toEqual({ ok: false });
  });
});
