import { rgb } from "pdf-lib";
import type { PDFDocument, PDFPage } from "pdf-lib";
import type { Paginator, PaperSize } from "@/lib/invoice-templates/types";
import { INVOICE_PAPER_SIZES_PT } from "@/lib/invoice-templates/types";

type PaginatorConfig = {
  paperSize: PaperSize;
  continuation?: {
    invoiceNumber: string;
    clientName: string;
    drawContinuedTableHeader?: (page: PDFPage, yFromTop: number) => number;
  };
};

export const createPaginator = (
  pdfDoc: PDFDocument,
  config: PaginatorConfig,
): Paginator => {
  const pageSize = INVOICE_PAPER_SIZES_PT[config.paperSize];
  const pages: PDFPage[] = [];
  const onPageAddedHandlers: Array<(page: PDFPage, pageNumber: number) => void> = [];
  const finalizeHandlers: Array<(page: PDFPage, pageNumber: number, totalPages: number) => void> = [];

  const appendPage = () => {
    const page = pdfDoc.addPage(pageSize);
    pages.push(page);
    const number = pages.length;
    if (number > 1 && config.continuation) {
      const { width, height } = page.getSize();
      page.drawText(`Invoice: ${config.continuation.invoiceNumber}`, {
        x: 40,
        y: height - 36,
        size: 8,
        color: rgb(0.35, 0.35, 0.35),
      });
      page.drawText(`Client: ${config.continuation.clientName}`, {
        x: 230,
        y: height - 36,
        size: 8,
        color: rgb(0.35, 0.35, 0.35),
      });
      page.drawText("Continued", {
        x: width - 80,
        y: height - 36,
        size: 8,
        color: rgb(0.35, 0.35, 0.35),
      });
      page.drawLine({
        start: { x: 40, y: height - 42 },
        end: { x: width - 40, y: height - 42 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      if (config.continuation.drawContinuedTableHeader) {
        config.continuation.drawContinuedTableHeader(page, 56);
      }
    }
    onPageAddedHandlers.forEach((handler) => handler(page, number));
    return page;
  };

  appendPage();

  return {
    currentPage() {
      return pages[pages.length - 1];
    },
    ensureRoom(estimatedHeight: number, minBottomY = 90) {
      const page = pages[pages.length - 1];
      const { height } = page.getSize();
      if (height - estimatedHeight < minBottomY) {
        return appendPage();
      }
      return page;
    },
    addPage() {
      return appendPage();
    },
    pageNumber() {
      return pages.length;
    },
    pageCount() {
      return pages.length;
    },
    onPageAdded(handler) {
      onPageAddedHandlers.push(handler);
    },
    onFinalize(handler) {
      finalizeHandlers.push(handler);
    },
    finalize() {
      const total = pages.length;
      pages.forEach((page, index) => {
        finalizeHandlers.forEach((handler) => handler(page, index + 1, total));
      });
    },
  };
};
