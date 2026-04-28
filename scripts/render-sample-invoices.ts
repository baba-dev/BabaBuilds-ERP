import fs from "node:fs/promises";
import path from "node:path";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { renderInvoicePdf } from "@/lib/invoice-renderers/render-invoice-pdf";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { listInvoiceTemplates } from "@/lib/invoice-templates/registry";
import "@/lib/invoice-templates";

async function main() {
  const templates = listInvoiceTemplates({ paperSize: "A4" });
  const root = path.join(process.cwd(), "tmp", "sample-invoices");
  await fs.mkdir(root, { recursive: true });

  for (const template of templates) {
    const outDir = path.join(root, template.id);
    await fs.mkdir(outDir, { recursive: true });

    for (const [fixtureName, params] of Object.entries(SAMPLE_INVOICES)) {
      const vm = buildInvoiceViewModel({
        ...params,
        templateId: template.id,
      });
      const bytes = await renderInvoicePdf(vm);
      const outPath = path.join(outDir, `${fixtureName}.pdf`);
      await fs.writeFile(outPath, bytes);
      console.log(`wrote ${outPath}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
