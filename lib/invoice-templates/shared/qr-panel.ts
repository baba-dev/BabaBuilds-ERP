import { rgb } from "pdf-lib";
import type { PDFDocument, PDFPage } from "pdf-lib";
import type { InvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import type { PdfFonts } from "@/lib/invoice-templates/types";
import type { AccentTokens } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { addLinkAnnotation, drawRect, drawText, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";
import { drawQr, qrMatrix } from "@/lib/invoice-templates/shared/qr";

/** The panel is a fixed height in every state so a design can lay out around it. */
export const SCAN_PANEL_HEIGHT = 158;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);
const PAID_INK = rgb(0.1, 0.5, 0.29);
const WHITE = rgb(1, 1, 1);
const QR_SIZE = 92;
const PAD = 14;

export type ScanPanelMode = "PAID" | "NO_PAYMENT_DUE" | "QR" | "BANK";

/** Which variant the panel shows, so a design can avoid repeating what the panel already says (e.g. bank details). */
export const scanPanelMode = (vm: InvoiceViewModel): ScanPanelMode => {
  if (vm.payment.kind === "PAID") return "PAID";
  const due = vm.payment.kind === "PARTIAL" ? vm.payment.balanceDue : vm.totals.total;
  if (due <= 0) return "NO_PAYMENT_DUE";
  const source = vm.paymentQrs[0];
  return source && qrMatrix(source.url).length > 0 ? "QR" : "BANK";
};

/**
 * The "Scan to pay" panel. In priority order it shows: "Paid in full" for a paid invoice (never a QR), nothing to
 * pay for a zero total, the QR of the first payment source with the amount and a clickable link, or bank details
 * when no payment source exists. Returns the panel's bottom edge in y-from-top.
 */
export const drawScanToPay = (args: {
  page: PDFPage;
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  tokens: AccentTokens;
  vm: InvoiceViewModel;
  x: number;
  yFromTop: number;
  width: number;
}): number => {
  const { page, pdfDoc, fonts, tokens, vm, x, yFromTop: y, width } = args;
  const pageHeight = page.getSize().height;
  const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
  const centerX = x + width / 2;

  drawRect(page, pageHeight, x, y, width, SCAN_PANEL_HEIGHT, WHITE, tokens.accent);

  const mode = scanPanelMode(vm);
  const due = vm.payment.kind === "PARTIAL" ? vm.payment.balanceDue : vm.totals.total;

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

  const source = vm.paymentQrs[0];
  const matrix = source ? qrMatrix(source.url) : [];
  if (mode === "QR" && source) {
    drawText(page, pageHeight, fonts, "SCAN TO PAY", x + PAD, y + 20, 8, { isBold: true, color: tokens.accent });
    const qrTop = y + 28;
    drawQr(page, pageHeight, matrix, x + PAD, qrTop, QR_SIZE, rgb(0, 0, 0));
    const textX = x + PAD + QR_SIZE + 14;
    drawText(page, pageHeight, fonts, "AMOUNT DUE", textX, qrTop + 12, 7, { isBold: true, color: MUTED });
    drawText(page, pageHeight, fonts, safeText(fonts.bold, money(due)), textX, qrTop + 30, 13, { isBold: true, color: INK });
    wrapTextByWidth(fonts.regular, "UPI, cards or netbanking", x + width - PAD - textX, 7.5).forEach((line, i) =>
      drawText(page, pageHeight, fonts, line, textX, qrTop + 48 + i * 9.5, 7.5, { color: MUTED }),
    );
    const linkLines = wrapTextByWidth(fonts.regular, source.url, width - PAD * 2, 6.5).slice(0, 3);
    const linkTop = qrTop + QR_SIZE + 10;
    linkLines.forEach((line, i) => drawText(page, pageHeight, fonts, line, x + PAD, linkTop + 6 + i * 8, 6.5, { color: tokens.accent }));
    addLinkAnnotation(pdfDoc, page, x + PAD, pageHeight - (linkTop + linkLines.length * 8 + 2), width - PAD * 2, linkLines.length * 8 + 2, source.url);
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
