import { PDFPage, degrees, rgb } from "pdf-lib";

export type InvoiceWatermarkKind = "NONE" | "PARTIAL" | "PAID";

type InvoiceWatermarkLayout = {
  text: string;
  size: number;
  x: number;
  y: number;
};

export const normalizeInvoiceWatermark = (status: string | null | undefined): InvoiceWatermarkKind => {
  if (!status || typeof status !== "string") return "NONE";
  const normalized = status.trim().toUpperCase();
  if (normalized === "PAID") return "PAID";
  if (normalized === "PARTIALLY_PAID" || normalized === "PARTIALLY PAID") return "PARTIAL";
  return "NONE";
};

const getInvoiceWatermarkLayout = (
  pageWidth: number,
  pageHeight: number,
  textWidthAtSize1: number,
  kind: InvoiceWatermarkKind,
): InvoiceWatermarkLayout | null => {
  if (kind === "NONE") return null;
  const text = kind === "PAID" ? "PAID" : "PARTIAL PAID";
  const targetWidth = kind === "PAID" ? pageWidth * 0.58 : pageWidth * 0.72;
  const baseSize = kind === "PAID" ? 130 : 96;
  const safeMargin = 28;
  const size = Math.min(baseSize, targetWidth / Math.max(textWidthAtSize1, 0.001));
  const renderedWidth = textWidthAtSize1 * size;
  const rawX = (pageWidth - renderedWidth) / 2;
  const x = Math.min(Math.max(rawX, safeMargin), pageWidth - renderedWidth - safeMargin);
  return {
    text,
    size,
    x,
    y: pageHeight * 0.48,
  };
};

export const drawInvoiceWatermark = (
  page: PDFPage,
  fontBold: import("pdf-lib").PDFFont,
  kind: InvoiceWatermarkKind,
) => {
  if (kind === "NONE") return null;
  const { width, height } = page.getSize();
  const text = kind === "PAID" ? "PAID" : "PARTIAL PAID";
  const glyphWidthAtSize1 = fontBold.widthOfTextAtSize(text, 1);
  const layout = getInvoiceWatermarkLayout(width, height, glyphWidthAtSize1, kind);
  if (!layout) return null;
  page.drawText(layout.text, {
    x: layout.x,
    y: layout.y,
    size: layout.size,
    font: fontBold,
    color: rgb(0.85, 0.15, 0.15),
    opacity: 0.1,
    rotate: degrees(45),
  });
  return {
    x: layout.x,
    renderedWidth: glyphWidthAtSize1 * layout.size,
    size: layout.size,
  };
};

export const computeWatermarkPlacement = (
  fontBold: import("pdf-lib").PDFFont,
  pageWidth: number,
  kind: Exclude<InvoiceWatermarkKind, "NONE">,
) => {
  const text = kind === "PAID" ? "PAID" : "PARTIAL PAID";
  const measuredTextWidth = fontBold.widthOfTextAtSize(text, 1);
  const textWidthAtSize1 = Number.isFinite(measuredTextWidth) && measuredTextWidth > 0
    ? measuredTextWidth
    : text.length * 0.62;
  const layout = getInvoiceWatermarkLayout(pageWidth, 841.89, textWidthAtSize1, kind);
  if (!layout) {
    return { x: 0, renderedWidth: 0, size: 0 };
  }
  return {
    x: layout.x,
    renderedWidth: textWidthAtSize1 * layout.size,
    size: layout.size,
  };
};
