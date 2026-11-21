import { rgb } from "pdf-lib";
import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import type { InvoiceQrSource, InvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import type { PdfFonts } from "@/lib/invoice-templates/types";
import type { AccentTokens } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { addLinkAnnotation, drawRect, drawText, loadPrivateImage, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";
import { drawQr, qrMatrix } from "@/lib/invoice-templates/shared/qr";

/** The panel is a fixed height in every state so a design can lay out around it. */
export const SCAN_PANEL_HEIGHT = 158;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);
const PAID_INK = rgb(0.1, 0.5, 0.29);
const WHITE = rgb(1, 1, 1);
const QR_SIZE = 92;
const PAD = 14;

/** A payment QR source ready to draw: the QR matrix for links and UPI, or the loaded image for an uploaded QR. */
export type PreparedQr = { source: InvoiceQrSource; matrix: boolean[][]; image: PDFImage | null };

/** Builds what is needed to draw a source. Null when it cannot be drawn (an unreadable image or an unencodable link). */
export const prepareQr = async (pdfDoc: PDFDocument, source: InvoiceQrSource): Promise<PreparedQr | null> => {
  if (source.kind === "STATIC_IMAGE") {
    const image = await loadPrivateImage(pdfDoc, source.imagePath);
    return image ? { source, matrix: [], image } : null;
  }
  const matrix = qrMatrix(source.kind === "UPI" ? source.uri : source.url);
  return matrix.length > 0 ? { source, matrix, image: null } : null;
};

/** Draws a prepared QR (or image) inside a `size` square whose top-left is (x, yFromTop). */
export const drawPreparedQr = (page: PDFPage, prepared: PreparedQr, x: number, yFromTop: number, size: number): void => {
  const pageHeight = page.getSize().height;
  if (prepared.image) {
    const dims = prepared.image.scaleToFit(size, size);
    page.drawImage(prepared.image, { x: x + (size - dims.width) / 2, y: pageHeight - yFromTop - size + (size - dims.height) / 2, width: dims.width, height: dims.height });
    return;
  }
  drawQr(page, pageHeight, prepared.matrix, x, yFromTop, size, rgb(0, 0, 0));
};

export type ScanPanelMode = "PAID" | "NO_PAYMENT_DUE" | "QR" | "BANK";

/** Which variant the panel shows, so a design can avoid repeating what the panel already says (e.g. bank details). */
export const scanPanelMode = (vm: InvoiceViewModel): ScanPanelMode => {
  if (vm.payment.kind === "PAID") return "PAID";
  const due = vm.payment.kind === "PARTIAL" ? vm.payment.balanceDue : vm.netPayable;
  if (due <= 0) return "NO_PAYMENT_DUE";
  const source = vm.paymentQrs[0];
  if (!source) return "BANK";
  if (source.kind === "STATIC_IMAGE") return "QR";
  return qrMatrix(source.kind === "UPI" ? source.uri : source.url).length > 0 ? "QR" : "BANK";
};

const dueOf = (vm: InvoiceViewModel) => (vm.payment.kind === "PARTIAL" ? vm.payment.balanceDue : vm.netPayable);

/**
 * The "Scan to pay" panel. In priority order it shows: "Paid in full" for a paid invoice (never a QR), nothing to
 * pay for a zero total, the first payment source (link QR with a clickable link, UPI QR, or an uploaded QR image),
 * or bank details when no payment source exists. Returns the panel's bottom edge in y-from-top.
 */
export const drawScanToPay = async (args: {
  page: PDFPage;
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  tokens: AccentTokens;
  vm: InvoiceViewModel;
  x: number;
  yFromTop: number;
  width: number;
}): Promise<number> => {
  const { page, pdfDoc, fonts, tokens, vm, x, yFromTop: y, width } = args;
  const pageHeight = page.getSize().height;
  const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
  const centerX = x + width / 2;
  const mode = scanPanelMode(vm);
  const due = dueOf(vm);

  drawRect(page, pageHeight, x, y, width, SCAN_PANEL_HEIGHT, WHITE, tokens.accent);

  if (mode === "PAID") {
    drawText(page, pageHeight, fonts, "Paid in full", centerX, y + 68, 16, { isBold: true, align: "center", color: PAID_INK });
    drawText(page, pageHeight, fonts, "Thank you", centerX, y + 88, 10, { align: "center", color: MUTED });
    if (vm.payment.paidOn) {
      const received = vm.payment.paidOn.toLocaleDateString(vm.userLocale, { day: "numeric", month: "short", year: "numeric" });
      drawText(page, pageHeight, fonts, `Received ${received}`, centerX, y + 104, 8.5, { align: "center", color: MUTED });
    }
    return y + SCAN_PANEL_HEIGHT;
  }

  if (mode === "NO_PAYMENT_DUE") {
    drawText(page, pageHeight, fonts, "No payment due", centerX, y + 84, 12, { isBold: true, align: "center", color: MUTED });
    return y + SCAN_PANEL_HEIGHT;
  }

  const prepared = mode === "QR" && vm.paymentQrs[0] ? await prepareQr(pdfDoc, vm.paymentQrs[0]) : null;
  if (prepared) {
    const { source } = prepared;
    drawText(page, pageHeight, fonts, "SCAN TO PAY", x + PAD, y + 20, 8, { isBold: true, color: tokens.accent });
    const qrTop = y + 28;
    drawPreparedQr(page, prepared, x + PAD, qrTop, QR_SIZE);
    const textX = x + PAD + QR_SIZE + 14;
    const textWidth = x + width - PAD - textX;
    drawText(page, pageHeight, fonts, "AMOUNT DUE", textX, qrTop + 12, 7, { isBold: true, color: MUTED });
    drawText(page, pageHeight, fonts, safeText(fonts.bold, money(due)), textX, qrTop + 30, 13, { isBold: true, color: INK });
    const hint = source.kind === "PAYMENT_LINK" ? "UPI, cards or netbanking" : source.kind === "UPI" ? "Any UPI app" : "Scan, then type the amount";
    wrapTextByWidth(fonts.regular, hint, textWidth, 7.5).forEach((line, i) => drawText(page, pageHeight, fonts, line, textX, qrTop + 48 + i * 9.5, 7.5, { color: MUTED }));
    const belowTop = qrTop + QR_SIZE + 10;
    if (source.kind === "PAYMENT_LINK") {
      const linkLines = wrapTextByWidth(fonts.regular, source.url, width - PAD * 2, 6.5).slice(0, 3);
      linkLines.forEach((line, i) => drawText(page, pageHeight, fonts, line, x + PAD, belowTop + 6 + i * 8, 6.5, { color: tokens.accent }));
      addLinkAnnotation(pdfDoc, page, x + PAD, pageHeight - (belowTop + linkLines.length * 8 + 2), width - PAD * 2, linkLines.length * 8 + 2, source.url);
    } else if (source.kind === "UPI") {
      drawText(page, pageHeight, fonts, safeText(fonts.regular, `UPI · ${source.vpa}`), x + PAD, belowTop + 8, 8, { color: INK });
    } else {
      drawText(page, pageHeight, fonts, safeText(fonts.regular, `Enter amount ${money(due)}`), x + PAD, belowTop + 8, 8, { isBold: true, color: INK });
      drawText(page, pageHeight, fonts, safeText(fonts.regular, `Reference ${vm.invoiceNumber}`), x + PAD, belowTop + 18, 7, { color: MUTED });
    }
    return y + SCAN_PANEL_HEIGHT;
  }

  drawText(page, pageHeight, fonts, "PAY BY BANK TRANSFER", x + PAD, y + 20, 8, { isBold: true, color: tokens.accent });
  if (vm.flags.hasBankDetails) {
    const rows: Array<[string, string]> = [
      ["Bank", vm.remittanceDisplay.bankName],
      ["Account name", vm.remittanceDisplay.accountName],
      ["Account no.", vm.remittanceDisplay.accountNumber],
      [vm.safeRoutingLabel, vm.remittanceDisplay.routingCode],
    ];
    rows.forEach(([label, value], i) => {
      const rowY = y + 42 + i * 26;
      drawText(page, pageHeight, fonts, label.toUpperCase(), x + PAD, rowY, 6.5, { isBold: true, color: MUTED });
      drawText(page, pageHeight, fonts, safeText(fonts.bold, value), x + PAD, rowY + 12, 10, { isBold: true, color: INK });
    });
  } else {
    drawText(page, pageHeight, fonts, "Payment details available on request", x + PAD, y + 60, 9, { color: MUTED });
  }
  return y + SCAN_PANEL_HEIGHT;
};

const TILE_QR = 64;
const TILE_WIDTH = 165;

/**
 * The payment sources after the first (UPI QR, uploaded QR images), as a labelled row of small QRs. Draws nothing and
 * returns `yFromTop` when there is nothing to show or the invoice is paid. Returns the bottom edge in y-from-top.
 */
export const drawMoreWaysToPay = async (args: {
  page: PDFPage;
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  tokens: AccentTokens;
  vm: InvoiceViewModel;
  x: number;
  yFromTop: number;
}): Promise<number> => {
  const { page, pdfDoc, fonts, tokens, vm, x, yFromTop } = args;
  if (vm.payment.kind === "PAID" || dueOf(vm) <= 0) return yFromTop;
  const prepared = (await Promise.all(vm.paymentQrs.slice(1).map((s) => prepareQr(pdfDoc, s)))).filter((p): p is PreparedQr => p !== null).slice(0, 3);
  if (prepared.length === 0) return yFromTop;

  const pageHeight = page.getSize().height;
  const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
  drawText(page, pageHeight, fonts, "MORE WAYS TO PAY", x, yFromTop + 9, 8, { isBold: true, color: tokens.accent });
  const top = yFromTop + 20;
  prepared.forEach((p, i) => {
    const tx = x + i * TILE_WIDTH;
    page.drawRectangle({ x: tx - 3, y: pageHeight - top - TILE_QR - 3, width: TILE_QR + 6, height: TILE_QR + 6, borderColor: rgb(0.86, 0.87, 0.89), borderWidth: 0.6, color: WHITE });
    drawPreparedQr(page, p, tx, top, TILE_QR);
    const textX = tx + TILE_QR + 12;
    drawText(page, pageHeight, fonts, safeText(fonts.bold, p.source.label), textX, top + 10, 9, { isBold: true, color: INK });
    const caption = p.source.kind === "UPI" ? `Exact amount ${money(dueOf(vm))}` : `Enter amount ${money(dueOf(vm))}, ref ${vm.invoiceNumber}`;
    wrapTextByWidth(fonts.regular, safeText(fonts.regular, caption), TILE_WIDTH - TILE_QR - 18, 7).slice(0, 4).forEach((line, k) => drawText(page, pageHeight, fonts, line, textX, top + 22 + k * 9, 7, { color: MUTED }));
  });
  return top + TILE_QR + 14;
};
