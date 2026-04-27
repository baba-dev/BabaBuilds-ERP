import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import type { PDFClient, PDFParams, PDFProfile, PDFService } from "@/lib/invoice/build-invoice-view-model";
import { renderInvoicePdf } from "@/lib/invoice-renderers/render-invoice-pdf";
import {
  computeWatermarkPlacement,
  drawInvoiceWatermark,
  normalizeInvoiceWatermark,
  type InvoiceWatermarkKind,
} from "@/lib/invoice-templates/shared/watermark";

export type { PDFClient, PDFParams, PDFProfile, PDFService, InvoiceWatermarkKind };

export async function generateInvoicePDF(params: PDFParams): Promise<Uint8Array> {
  const vm = buildInvoiceViewModel(params);
  return renderInvoicePdf(vm);
}

export { normalizeInvoiceWatermark, drawInvoiceWatermark, computeWatermarkPlacement };
