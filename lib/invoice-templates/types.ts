import type { PDFDocument, PDFPage, PDFFont } from "pdf-lib";
import type { InvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";

export type PaperSize = "A4" | "THERMAL_80MM" | "THERMAL_58MM";

export const INVOICE_PAPER_SIZES_PT: Record<PaperSize, [number, number]> = {
  A4: [595.28, 841.89],
  THERMAL_80MM: [226.77, 1000],
  THERMAL_58MM: [164.41, 1000],
};

export type PdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  oblique: PDFFont;
};

export interface InvoiceTemplateMeta {
  id: string;
  title: string;
  paperSize: PaperSize;
  supportsSignature: boolean;
  supportsPaymentLink: boolean;
  supportsMultiPage: boolean;
}

export interface Paginator {
  currentPage(): PDFPage;
  ensureRoom(estimatedHeight: number, minBottomY?: number): PDFPage;
  addPage(): PDFPage;
  pageNumber(): number;
  pageCount(): number;
  onPageAdded(handler: (page: PDFPage, pageNumber: number) => void): void;
  onFinalize(handler: (page: PDFPage, pageIndex: number, totalPages: number) => void): void;
  finalize(): void;
}

export interface InvoiceTemplateContext {
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  vm: InvoiceViewModel;
  paginator: Paginator;
}

export interface InvoiceTemplate {
  meta: InvoiceTemplateMeta;
  draw(ctx: InvoiceTemplateContext): Promise<void> | void;
}
