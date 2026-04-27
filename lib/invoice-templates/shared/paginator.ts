import type { PDFDocument, PDFPage } from "pdf-lib";
import type { Paginator, PaperSize } from "@/lib/invoice-templates/types";
import { INVOICE_PAPER_SIZES_PT } from "@/lib/invoice-templates/types";

type PaginatorConfig = {
  paperSize: PaperSize;
};

export const createPaginator = (
  pdfDoc: PDFDocument,
  config: PaginatorConfig,
): Paginator => {
  const pageSize = INVOICE_PAPER_SIZES_PT[config.paperSize];
  const pages: PDFPage[] = [];
  const onPageAddedHandlers: Array<(page: PDFPage, pageNumber: number) => void> = [];

  const appendPage = () => {
    const page = pdfDoc.addPage(pageSize);
    pages.push(page);
    const number = pages.length;
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
    finalize() {},
  };
};
