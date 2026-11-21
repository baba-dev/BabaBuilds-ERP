import { describe, expect, it } from "vitest";

import { invoicingSchema } from "@/lib/settings/schemas";
import { normalizeClientInput } from "@/lib/clients/schema";
import { GenerateInvoiceSchema } from "@/lib/invoice/generate-schema";

const base = { invoiceTheme: "DESIGN_1", invoicePrefix: "INV", invoiceTermsDays: 7 };

describe("workspace accent colour (invoicing schema)", () => {
  it("normalises a valid colour", () => {
    expect(invoicingSchema.parse({ ...base, invoiceAccentColor: "#0b5fff" }).invoiceAccentColor).toBe("#0B5FFF");
    expect(invoicingSchema.parse({ ...base, invoiceAccentColor: "0b5" }).invoiceAccentColor).toBe("#00BB55");
  });

  it("clears on empty or null and leaves the field alone when omitted", () => {
    expect(invoicingSchema.parse({ ...base, invoiceAccentColor: "" }).invoiceAccentColor).toBeNull();
    expect(invoicingSchema.parse({ ...base, invoiceAccentColor: null }).invoiceAccentColor).toBeNull();
    expect(invoicingSchema.parse(base).invoiceAccentColor).toBeUndefined();
  });

  it("rejects junk instead of storing it", () => {
    for (const bad of ["red", "#GGGGGG", "javascript:alert(1)", "#12"]) {
      expect(invoicingSchema.safeParse({ ...base, invoiceAccentColor: bad }).success).toBe(false);
    }
  });
});

describe("client accent colour", () => {
  const opts = { workspaceCountry: "IN", partial: true } as const;

  it("stores a normalised colour", () => {
    const r = normalizeClientInput({ invoiceAccentColor: "#0b5fff" }, opts);
    expect(r.ok && r.data.invoiceAccentColor).toBe("#0B5FFF");
  });

  it("clears with an empty value", () => {
    const r = normalizeClientInput({ invoiceAccentColor: "" }, opts);
    expect(r.ok && r.data.invoiceAccentColor).toBeNull();
  });

  it("reports an invalid colour as a field issue", () => {
    const r = normalizeClientInput({ invoiceAccentColor: "red" }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields).toContainEqual({ field: "invoiceAccentColor", code: "INVALID" });
  });
});

describe("invoice accent colour override (generate schema)", () => {
  const payload = { clientId: "c1", billingMonth: "April 2026", services: [{ title: "Work", amount: 100 }] };

  it("normalises a valid override", () => {
    expect(GenerateInvoiceSchema.parse({ ...payload, accentColor: "#0b5fff" }).accentColor).toBe("#0B5FFF");
  });

  it("clears on empty or null and is undefined when omitted", () => {
    expect(GenerateInvoiceSchema.parse({ ...payload, accentColor: "" }).accentColor).toBeNull();
    expect(GenerateInvoiceSchema.parse({ ...payload, accentColor: null }).accentColor).toBeNull();
    expect(GenerateInvoiceSchema.parse(payload).accentColor).toBeUndefined();
  });

  it("rejects junk", () => {
    expect(GenerateInvoiceSchema.safeParse({ ...payload, accentColor: "not-a-colour" }).success).toBe(false);
  });
});
