import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { INVOICE_DESIGN_CATALOG, INVOICE_DESIGN_IDS, isInvoiceDesignId } from "@/lib/invoice-templates/catalog";
import { listInvoiceTemplates } from "@/lib/invoice-templates";
import { invoicingSchema } from "@/lib/settings/schemas";

const LOCALES = ["en-IN", "hi", "es", "ar"] as const;
const messages = (locale: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"));

describe("invoice design catalog", () => {
  it("matches the registered templates exactly (guards drift)", () => {
    const registered = listInvoiceTemplates().map((t) => ({ id: t.id, paperSize: t.paperSize }));
    const catalog = INVOICE_DESIGN_CATALOG.map((d) => ({ id: d.id, paperSize: d.paperSize }));
    expect([...catalog].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...registered].sort((a, b) => a.id.localeCompare(b.id)));
    expect([...INVOICE_DESIGN_IDS]).toEqual(INVOICE_DESIGN_CATALOG.map((d) => d.id));
  });

  it("recognises catalog ids only", () => {
    expect(isInvoiceDesignId("DESIGN_3")).toBe(true);
    expect(isInvoiceDesignId("DESIGN_99")).toBe(false);
    expect(isInvoiceDesignId(undefined)).toBe(false);
    expect(isInvoiceDesignId("design_1")).toBe(false);
  });

  it("is accepted by the invoicing settings schema, and nothing else is", () => {
    for (const id of INVOICE_DESIGN_IDS) {
      expect(invoicingSchema.safeParse({ invoiceTheme: id, invoicePrefix: "INV", invoiceTermsDays: 7 }).success).toBe(true);
    }
    expect(invoicingSchema.safeParse({ invoiceTheme: "DESIGN_99", invoicePrefix: "INV", invoiceTermsDays: 7 }).success).toBe(false);
  });

  it("has a name and a hint in every locale for every design", () => {
    for (const locale of LOCALES) {
      const inv = messages(locale).SettingsHub.invoicing;
      for (const id of INVOICE_DESIGN_IDS) {
        expect(inv.design[id], `${locale} design.${id}`).toBeTruthy();
        expect(inv.designHint[id], `${locale} designHint.${id}`).toBeTruthy();
      }
    }
  });
});
