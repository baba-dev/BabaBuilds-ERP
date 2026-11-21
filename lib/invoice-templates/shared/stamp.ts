import { degrees, rgb } from "pdf-lib";
import type { Color, PDFPage } from "pdf-lib";
import type { InvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import type { PdfFonts } from "@/lib/invoice-templates/types";
import { drawInvoiceWatermark } from "@/lib/invoice-templates/shared/watermark";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { safeText } from "@/lib/invoice-templates/shared/fonts";

const MARGIN = 24;
const PADDING = 12;
const ANGLE_DEG = 10;
const TITLE_RATIO = 0.8;

// The ink does not follow the brand accent: a paid stamp must read as a stamp on any colour scheme.
const PAID_INK = rgb(0.1, 0.5, 0.29);
const PARTIAL_INK = rgb(0.71, 0.33, 0.04);

type StampLine = { text: string; size: number; bold: boolean; width: number; dy: number };

export type StampLayout = {
  centerX: number;
  centerYFromTop: number;
  width: number;
  height: number;
  angleDeg: number;
  ink: Color;
  lines: StampLine[];
  bounds: { minX: number; maxX: number; minYFromTop: number; maxYFromTop: number };
};

const formatDate = (date: Date, locale: string) => date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

const clamp = (value: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value)));

/** Where the stamp goes and what it says. The anchor is the stamp's centre, nudged so the rotated stamp stays inside the page margins. Null when there is nothing to stamp. */
export const computeStampLayout = (args: {
  fonts: PdfFonts;
  vm: InvoiceViewModel;
  anchorX: number;
  anchorYFromTop: number;
  pageWidth: number;
  pageHeight: number;
}): StampLayout | null => {
  const { fonts, vm, anchorX, anchorYFromTop, pageWidth, pageHeight } = args;
  const { payment } = vm;
  if (payment.kind === "NONE") return null;

  const isPaid = payment.kind === "PAID";
  const titleText = isPaid ? "PAID" : "PARTIALLY PAID";
  const titleSize = isPaid ? 30 : 20;
  let subText: string | null = null;
  if (isPaid && payment.paidOn) subText = formatDate(payment.paidOn, vm.userLocale);
  if (!isPaid && payment.amountPaid > 0) subText = `Balance ${formatMoney(payment.balanceDue, vm.baseCurrency, vm.userLocale)}`;
  const subSize = 9;

  const title = safeText(fonts.bold, titleText);
  const sub = subText ? safeText(fonts.regular, subText) : null;
  const titleWidth = fonts.bold.widthOfTextAtSize(title, titleSize);
  const subWidth = sub ? fonts.regular.widthOfTextAtSize(sub, subSize) : 0;

  const contentHeight = titleSize * TITLE_RATIO + (sub ? 6 + subSize * 0.8 : 0);
  const width = Math.max(110, Math.max(titleWidth, subWidth) + PADDING * 2);
  const height = contentHeight + PADDING * 2;

  const lines: StampLine[] = [{ text: title, size: titleSize, bold: true, width: titleWidth, dy: contentHeight / 2 - titleSize * TITLE_RATIO }];
  if (sub) lines.push({ text: sub, size: subSize, bold: false, width: subWidth, dy: -contentHeight / 2 });

  const rad = (ANGLE_DEG * Math.PI) / 180;
  const halfX = (width / 2) * Math.abs(Math.cos(rad)) + (height / 2) * Math.abs(Math.sin(rad));
  const halfY = (width / 2) * Math.abs(Math.sin(rad)) + (height / 2) * Math.abs(Math.cos(rad));
  const centerX = clamp(anchorX, MARGIN + halfX, pageWidth - MARGIN - halfX);
  const centerYFromTop = clamp(anchorYFromTop, MARGIN + halfY, pageHeight - MARGIN - halfY);

  return {
    centerX,
    centerYFromTop,
    width,
    height,
    angleDeg: ANGLE_DEG,
    ink: isPaid ? PAID_INK : PARTIAL_INK,
    lines,
    bounds: { minX: centerX - halfX, maxX: centerX + halfX, minYFromTop: centerYFromTop - halfY, maxYFromTop: centerYFromTop + halfY },
  };
};

/** Bordered, slightly rotated PAID / PARTIALLY PAID stamp. Draws nothing for an unpaid invoice. */
export const drawPaymentStamp = (args: { page: PDFPage; fonts: PdfFonts; vm: InvoiceViewModel; anchorX: number; anchorYFromTop: number }): void => {
  const { page, fonts, vm, anchorX, anchorYFromTop } = args;
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const layout = computeStampLayout({ fonts, vm, anchorX, anchorYFromTop, pageWidth, pageHeight });
  if (!layout) return;

  const rad = (layout.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cy = pageHeight - layout.centerYFromTop;
  // A point (dx, dy) in the stamp's own frame (y up, origin at its centre) in page coordinates.
  const place = (dx: number, dy: number) => ({ x: layout.centerX + dx * cos - dy * sin, y: cy + dx * sin + dy * cos });
  const rotate = degrees(layout.angleDeg);

  const outer = place(-layout.width / 2, -layout.height / 2);
  page.drawRectangle({ ...outer, width: layout.width, height: layout.height, rotate, borderColor: layout.ink, borderWidth: 2.2, borderOpacity: 0.9 });
  const inner = place(-layout.width / 2 + 4, -layout.height / 2 + 4);
  page.drawRectangle({ ...inner, width: layout.width - 8, height: layout.height - 8, rotate, borderColor: layout.ink, borderWidth: 0.8, borderOpacity: 0.9 });

  for (const line of layout.lines) {
    const pos = place(-line.width / 2, line.dy);
    page.drawText(line.text, { ...pos, size: line.size, font: line.bold ? fonts.bold : fonts.regular, color: layout.ink, opacity: 0.9, rotate });
  }
};

/** The faint diagonal PAID / PARTIAL PAID watermark, shared with the classic design. */
export const drawPaymentWatermark = (page: PDFPage, fonts: PdfFonts, vm: InvoiceViewModel): void => {
  if (vm.watermarkKind === "NONE") return;
  drawInvoiceWatermark(page, fonts.bold, vm.watermarkKind);
};
