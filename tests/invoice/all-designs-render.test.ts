import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";

import "@/lib/invoice-templates";
import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { renderInvoicePdf } from "@/lib/invoice-renderers/render-invoice-pdf";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { listInvoiceTemplates } from "@/lib/invoice-templates";
import baseline from "./fixtures/classic-modern-baseline.json";
import { pdfContentText } from "./helpers/pdf-content";

const render = (design: string, key: string) => renderInvoicePdf(buildInvoiceViewModel({ ...SAMPLE_INVOICES[key], templateId: design }));

describe("every design renders every fixture", () => {
  const designs = listInvoiceTemplates().map((t) => t.id);

  it("registers the five A4 designs", () => {
    expect(designs.sort()).toEqual(["DESIGN_1", "DESIGN_2", "DESIGN_3", "DESIGN_4", "DESIGN_5"]);
  });

  for (const design of ["DESIGN_3", "DESIGN_4", "DESIGN_5"]) {
    it(`${design} produces a reopenable PDF for all ${Object.keys(SAMPLE_INVOICES).length} fixtures`, async () => {
      for (const key of Object.keys(SAMPLE_INVOICES)) {
        const bytes = await render(design, key);
        expect((await PDFDocument.load(bytes)).getPageCount(), `${design}:${key}`).toBeGreaterThanOrEqual(1);
      }
    }, 120_000);
  }
});

describe("Classic and Modern are unchanged", () => {
  it("renders the same pages and drawing operations as before the new designs existed", async () => {
    for (const [id, expected] of Object.entries(baseline as Record<string, { pages: number; sha: string }>)) {
      const [design, key] = id.split(":");
      const bytes = await render(design, key);
      const sha = crypto.createHash("sha1").update(await pdfContentText(bytes)).digest("hex");
      expect({ pages: (await PDFDocument.load(bytes)).getPageCount(), sha }, id).toEqual(expected);
    }
  }, 120_000);
});
