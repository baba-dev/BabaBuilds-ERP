import { describe, expect, it } from "vitest";
import { matchCountry, countryName, isForeignTo } from "@/lib/clients/country";
import { parseTags, serializeTags, tagLike } from "@/lib/clients/tags";
import { duplicateKey } from "@/lib/clients/names";
import { clientHealth, creditStatus, paymentStats } from "@/lib/clients/metrics";
import { normalizeClientInput, normalizePhone, normalizeWebsite } from "@/lib/clients/schema";

const IN = { workspaceCountry: "IN" };

describe("country matching", () => {
  it("understands codes, names and the spellings people type", () => {
    for (const t of ["IN", "in", "India", " india ", "Bharat", "INDIA."]) expect(matchCountry(t)).toEqual({ code: "IN", exact: true });
    expect(matchCountry("U.S.A.")?.code).toBe("US");
    expect(matchCountry("United States")?.code).toBe("US");
    expect(matchCountry("UK")?.code).toBe("GB");
    expect(matchCountry("UAE")?.code).toBe("AE");
    expect(matchCountry("Türkiye")?.code).toBe("TR");
  });
  it("flags a near miss instead of accepting a typo that would flip GST treatment", () => {
    expect(matchCountry("Indai")).toEqual({ code: "IN", exact: false });
    expect(matchCountry("Germny")).toEqual({ code: "DE", exact: false });
    expect(matchCountry("Narnia")).toBeNull();
    expect(matchCountry("")).toBeNull();
  });
  it("names codes and decides foreign relative to the workspace", () => {
    expect(countryName("DE")).toBe("Germany");
    expect(isForeignTo("IN", "US")).toBe(true);
    expect(isForeignTo("IN", "IN")).toBe(false);
    expect(isForeignTo("US", "IN")).toBe(true);
  });
});

describe("tags and duplicates", () => {
  it("stores tags so an exact match is a LIKE", () => {
    expect(serializeTags([" VIP ", "agency", "vip", "", "a|b"])).toBe("|vip|agency|a b|");
    expect(parseTags("|vip|agency|")).toEqual(["vip", "agency"]);
    expect(tagLike("VIP")).toBe("%|vip|%");
    expect(serializeTags([])).toBe("");
  });
  it("sees the same company behind different spellings", () => {
    const k = duplicateKey("Acme Pvt. Ltd.");
    expect(duplicateKey("ACME Private Limited")).toBe(k);
    expect(duplicateKey("acme")).toBe(k);
    expect(duplicateKey("Acme & Sons LLP")).toBe(duplicateKey("ACME AND SONS"));
    expect(duplicateKey("Acme Labs")).not.toBe(k);
  });
});

describe("client health and credit", () => {
  const base = { invoiceCount: 5, outstanding: 0, overdue: 0, onTimeRate: 1, avgDaysToPay: 5, termsDays: 7 };
  it("is NEW without invoices and excellent for a clean record", () => {
    expect(clientHealth({ ...base, invoiceCount: 0 })).toMatchObject({ score: null, label: "NEW" });
    expect(clientHealth(base)).toMatchObject({ score: 100, label: "EXCELLENT", reasons: ["RELIABLE"] });
  });
  it("drops for overdue balances and slow payers, and explains why", () => {
    const h = clientHealth({ ...base, outstanding: 1000, overdue: 1000, onTimeRate: 0.4, avgDaysToPay: 40 });
    expect(h.label).toBe("AT_RISK");
    expect(h.reasons).toEqual(expect.arrayContaining(["OVERDUE", "SLOW_PAYER", "OFTEN_LATE"]));
    expect(clientHealth({ ...base, outstanding: 1000, overdue: 100 }).label).not.toBe("EXCELLENT");
  });
  it("credit limit: none, ok, near and over", () => {
    expect(creditStatus(null, 500).state).toBe("NONE");
    expect(creditStatus(1000, 100, 100).state).toBe("OK");
    expect(creditStatus(1000, 800, 100).state).toBe("NEAR");
    expect(creditStatus(1000, 800, 300)).toMatchObject({ state: "OVER", after: 1100, headroom: -100 });
  });
  it("payment stats: average days and on-time share", () => {
    const d = (s: string) => new Date(s);
    const s = paymentStats([
      { invoiceDate: d("2026-01-01"), dueDate: d("2026-01-08"), paidAt: d("2026-01-05"), termsDays: 7 },
      { invoiceDate: d("2026-02-01"), dueDate: d("2026-02-08"), paidAt: d("2026-02-21"), termsDays: 7 },
    ]);
    expect(s).toEqual({ avgDaysToPay: 12, onTimeRate: 0.5, sample: 2 });
    expect(paymentStats([])).toEqual({ avgDaysToPay: null, onTimeRate: null, sample: 0 });
  });
});

describe("normalising client input", () => {
  const good = { name: "  Acme   Studios ", address: "1 Road", country: "india", email: "Ops@Acme.IN", phone: "+91 98765-43210", taxId: "27AAPFU0939F1ZV", tags: "VIP, agency", currency: "inr", paymentTermsDays: "30", creditLimit: "250000" };

  it("cleans a good domestic client and derives everything from the country", () => {
    const r = normalizeClientInput(good, IN);
    if (!r.ok) throw new Error(JSON.stringify(r.fields));
    expect(r.data).toMatchObject({ name: "Acme Studios", country: "India", countryCode: "IN", email: "ops@acme.in", phone: "+91 98765 43210", taxId: "27AAPFU0939F1ZV", gstStateCode: "27", tags: "|vip|agency|", currency: "INR", paymentTermsDays: 30, creditLimit: 250000, isExport: false });
  });

  it("a foreign client is an export unless told otherwise; an explicit choice wins", () => {
    expect(normalizeClientInput({ ...good, country: "United States", taxId: "EIN-12" }, IN)).toMatchObject({ ok: true, data: { countryCode: "US", isExport: true, gstStateCode: null } });
    expect(normalizeClientInput({ ...good, isExport: "true" }, IN)).toMatchObject({ ok: true, data: { isExport: true } });
  });

  it("rejects what the old API accepted", () => {
    const f = (raw: Record<string, unknown>) => { const r = normalizeClientInput(raw, IN); return r.ok ? [] : r.fields.map((x) => `${x.field}:${x.code}`); };
    expect(f({ address: "x", country: "India" })).toContain("name:REQUIRED");
    expect(f({ ...good, name: "   " })).toContain("name:REQUIRED");
    expect(f({ ...good, name: "x".repeat(200) })).toContain("name:TOO_LONG");
    expect(f({ ...good, email: "not-an-email" })).toContain("email:EMAIL");
    expect(f({ ...good, phone: "abc" })).toContain("phone:PHONE");
    expect(f({ ...good, country: "Narnia" })).toContain("country:COUNTRY_UNKNOWN");
    expect(f({ ...good, taxId: "27AAPFU0939F1ZX" })).toContain("taxId:GSTIN_INVALID");
    expect(f({ ...good, paymentTermsDays: "400" })).toContain("paymentTermsDays:TERMS");
    expect(f({ ...good, currency: "RUPEE" })).toContain("currency:CURRENCY");
    expect(f({ ...good, creditLimit: "-5" })).toContain("creditLimit:CREDIT");
  });

  it("asks 'did you mean India?' for a typo instead of storing it", () => {
    const r = normalizeClientInput({ ...good, country: "Indai" }, IN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.suggestion).toEqual({ field: "country", code: "IN", name: "India" });
  });

  it("an edit only touches what was sent and clears optional fields on empty", () => {
    const r = normalizeClientInput({ email: "", paymentTermsDays: "" }, { ...IN, partial: true, existing: { countryCode: "IN", country: "India", taxId: null, isExport: false } });
    expect(r).toEqual({ ok: true, data: { email: null, paymentTermsDays: null } });
  });

  it("phone and website helpers", () => {
    expect(normalizePhone("(022) 2345-6789")).toBe("022 2345 6789");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizeWebsite("acme.in")).toBe("https://acme.in");
    expect(normalizeWebsite("not a url")).toBeNull();
  });
});
