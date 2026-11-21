import type { PaperSize } from "@/lib/invoice-templates/types";

/**
 * Client-safe list of invoice designs (no drawing code), for the settings picker and validation.
 * `tests/invoice/catalog.unit.test.ts` fails if this drifts from the registered templates.
 */
export const INVOICE_DESIGN_IDS = ["DESIGN_1", "DESIGN_2", "DESIGN_3", "DESIGN_4", "DESIGN_5"] as const;
export type InvoiceDesignId = (typeof INVOICE_DESIGN_IDS)[number];

export const INVOICE_DESIGN_CATALOG: ReadonlyArray<{ id: InvoiceDesignId; paperSize: PaperSize }> = INVOICE_DESIGN_IDS.map((id) => ({ id, paperSize: "A4" as const }));

export const isInvoiceDesignId = (value: unknown): value is InvoiceDesignId =>
  typeof value === "string" && (INVOICE_DESIGN_IDS as readonly string[]).includes(value);
