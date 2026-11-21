import "@/lib/invoice-templates";
import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { renderInvoicePdf } from "@/lib/invoice-renderers/render-invoice-pdf";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { extractPdfText } from "./pdf-text";

/** Renders a sample invoice with a given design and returns the bytes plus the text of each page. */
export const renderFixture = async (fixtureKey: string, templateId: string, overrides: Record<string, unknown> = {}) => {
  const params = { ...SAMPLE_INVOICES[fixtureKey], templateId, ...overrides };
  const vm = buildInvoiceViewModel(params);
  const bytes = await renderInvoicePdf(vm);
  const pages = await extractPdfText(bytes);
  return { vm, bytes, pages, text: pages.join("\n") };
};
