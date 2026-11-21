import { describe, expect, it } from "vitest";

import { computeTds, netPayable, normalizeTdsSection } from "@/lib/invoice/tds";
import { GenerateInvoiceSchema } from "@/lib/invoice/generate-schema";
import { normalizeClientInput } from "@/lib/clients/schema";

describe("computeTds", () => {
  it("takes the rate on the pre-GST subtotal", () => {
    expect(computeTds({ subtotal: 16000, ratePercent: 10 })).toEqual({ ratePercent: 10, amount: 1600 });
    expect(computeTds({ subtotal: 100.01, ratePercent: 2 })).toEqual({ ratePercent: 2, amount: 2 });
  });

  it("still applies to a GST-exempt invoice (TDS is on the fee itself)", () => {
    expect(computeTds({ subtotal: 5000, ratePercent: 10, isExport: false })).toEqual({ ratePercent: 10, amount: 500 });
  });

  it("returns null when there is nothing to deduct", () => {
    for (const rate of [0, undefined, null, Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      expect(computeTds({ subtotal: 1000, ratePercent: rate as number | null | undefined }), String(rate)).toBeNull();
    }
    expect(computeTds({ subtotal: 0, ratePercent: 10 })).toBeNull();
    expect(computeTds({ subtotal: -50, ratePercent: 10 })).toBeNull();
    expect(computeTds({ subtotal: 1000, ratePercent: 10, isExport: true })).toBeNull();
  });

  it("clamps a rate above 100", () => {
    expect(computeTds({ subtotal: 1000, ratePercent: 150 })).toEqual({ ratePercent: 100, amount: 1000 });
  });
});

describe("netPayable", () => {
  it("subtracts TDS from the total and never goes below zero", () => {
    expect(netPayable(18880, 1600)).toBe(17280);
    expect(netPayable(100, 500)).toBe(0);
    expect(netPayable(100, null)).toBe(100);
    expect(netPayable(100, undefined)).toBe(100);
    expect(netPayable(0, 0)).toBe(0);
  });
});

describe("normalizeTdsSection", () => {
  it("accepts short section codes and rejects anything else", () => {
    expect(normalizeTdsSection(" 194J ")).toBe("194J");
    expect(normalizeTdsSection("194J(b)")).toBe("194J(b)");
    for (const bad of ["<script>", "", "   ", "x".repeat(13), null, undefined, 194, "a;b"]) {
      expect(normalizeTdsSection(bad), String(bad)).toBeNull();
    }
  });
});

describe("generate schema tds", () => {
  const payload = { clientId: "c1", billingMonth: "April 2026", services: [{ title: "Work", amount: 100 }] };

  it("accepts a section and rate", () => {
    expect(GenerateInvoiceSchema.parse({ ...payload, tds: { section: "194J", ratePercent: 10 } }).tds).toEqual({ section: "194J", ratePercent: 10 });
    expect(GenerateInvoiceSchema.parse(payload).tds).toBeUndefined();
  });

  it("rejects junk rates and sections", () => {
    for (const tds of [{ ratePercent: "abc" }, { ratePercent: -1 }, { ratePercent: 101 }, { section: "<b>", ratePercent: 10 }]) {
      expect(GenerateInvoiceSchema.safeParse({ ...payload, tds }).success, JSON.stringify(tds)).toBe(false);
    }
  });
});

describe("client TDS default", () => {
  const opts = { workspaceCountry: "IN", partial: true } as const;

  it("stores a section and rate", () => {
    const r = normalizeClientInput({ tdsSection: "194J", tdsRatePercent: "10" }, opts);
    expect(r.ok && r.data.tdsSection).toBe("194J");
    expect(r.ok && r.data.tdsRatePercent).toBe(10);
  });

  it("clears with empty values", () => {
    const r = normalizeClientInput({ tdsSection: "", tdsRatePercent: "" }, opts);
    expect(r.ok && r.data.tdsSection).toBeNull();
    expect(r.ok && r.data.tdsRatePercent).toBeNull();
  });

  it("reports junk as field issues", () => {
    const rate = normalizeClientInput({ tdsRatePercent: "abc" }, opts);
    expect(rate.ok).toBe(false);
    if (!rate.ok) expect(rate.fields).toContainEqual({ field: "tdsRatePercent", code: "INVALID" });
    const high = normalizeClientInput({ tdsRatePercent: "101" }, opts);
    expect(high.ok).toBe(false);
    const section = normalizeClientInput({ tdsSection: "<b>" }, opts);
    expect(section.ok).toBe(false);
    if (!section.ok) expect(section.fields).toContainEqual({ field: "tdsSection", code: "INVALID" });
  });
});
