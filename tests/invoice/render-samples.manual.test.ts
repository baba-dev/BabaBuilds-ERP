import { describe, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

import "@/lib/invoice-templates";
import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { renderInvoicePdf } from "@/lib/invoice-renderers/render-invoice-pdf";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

/**
 * Manual visual-review harness. Skipped unless RENDER_SAMPLES_DIR is set.
 *   RENDER_SAMPLES_DIR=/some/dir [RENDER_DESIGNS=DESIGN_3,DESIGN_4] [RENDER_FIXTURES=gstIntra,paidWithLink] npx vitest run tests/invoice/render-samples.manual.test.ts
 * then: pdftoppm -r 110 -png <pdf> <prefix>
 */
const dir = process.env.RENDER_SAMPLES_DIR;
const designs = (process.env.RENDER_DESIGNS ?? "DESIGN_1,DESIGN_2,DESIGN_3,DESIGN_4,DESIGN_5").split(",");
const fixtures = process.env.RENDER_FIXTURES ? process.env.RENDER_FIXTURES.split(",") : Object.keys(SAMPLE_INVOICES);

describe.skipIf(!dir)("render samples", () => {
  it("writes every fixture for every design", async () => {
    await fs.mkdir(dir as string, { recursive: true });
    for (const design of designs) {
      for (const key of fixtures) {
        const vm = buildInvoiceViewModel({ ...SAMPLE_INVOICES[key], templateId: design });
        const bytes = await renderInvoicePdf(vm);
        await fs.writeFile(path.join(dir as string, `${design}-${key}.pdf`), bytes);
      }
    }
  }, 600_000);
});
