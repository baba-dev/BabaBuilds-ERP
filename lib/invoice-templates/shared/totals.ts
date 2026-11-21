import { rgb } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import type { InvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import type { PdfFonts } from "@/lib/invoice-templates/types";
import type { AccentTokens } from "@/lib/invoice-templates/shared/tokens";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { drawRect, drawText, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";

const ROW_H = 18;
const TOTAL_H = 30;
const NET_H = 28;
const NOTE_H = 16;
const WORDS_SIZE = 8;
const WORDS_LINE_H = 10.5;
const WORDS_GAP = 8;
const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);

type Row = { label: string; value: string; style: "normal" | "muted" | "total" | "net" | "note" };

type BlockOptions = { showGstSplit: boolean; showAmountInWords: boolean };

const trimRate = (rate: number) => String(Math.round(rate * 100) / 100);

const buildRows = (vm: InvoiceViewModel, showGstSplit: boolean): Row[] => {
  const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
  const rows: Row[] = [];
  const discount = vm.lines.reduce((sum, l) => sum + l.discountAmount, 0);
  if (discount > 0) {
    rows.push({ label: "Amount before discount", value: money(vm.totals.subtotal + discount), style: "muted" });
    rows.push({ label: "Discount", value: `-${money(discount)}`, style: "muted" });
  }
  rows.push({ label: "Subtotal", value: money(vm.totals.subtotal), style: "normal" });

  const { gst } = vm;
  const splitKind = showGstSplit && (gst.kind === "INTRA" || gst.kind === "INTER");
  if (splitKind) {
    const single = gst.rows.length === 1 ? gst.rows[0].ratePercent : null;
    if (gst.kind === "INTRA") {
      const half = single === null ? "" : ` @ ${trimRate(single / 2)}%`;
      rows.push({ label: `CGST${half}`, value: money(gst.cgst), style: "normal" });
      rows.push({ label: `SGST${half}`, value: money(gst.sgst), style: "normal" });
    } else {
      rows.push({ label: `IGST${single === null ? "" : ` @ ${trimRate(single)}%`}`, value: money(gst.igst), style: "normal" });
    }
  } else {
    rows.push({ label: vm.taxRowLabel, value: money(vm.totals.taxAmount), style: "normal" });
  }
  rows.push({ label: "Total", value: money(vm.totals.total), style: "total" });
  if (vm.tds) {
    const section = vm.tds.sectionLabel ? ` (${vm.tds.sectionLabel})` : "";
    rows.push({ label: `Less: TDS @ ${trimRate(vm.tds.ratePercent)}%${section}`, value: `-${money(vm.tds.amount)}`, style: "muted" });
    rows.push({ label: "Net payable", value: money(vm.netPayable), style: "net" });
    if (vm.profile.panNumber) rows.push({ label: `Our PAN: ${vm.profile.panNumber}`, value: "", style: "note" });
  }
  return rows;
};

const wordsLines = (vm: InvoiceViewModel, fonts: PdfFonts, width: number, enabled: boolean): string[] =>
  enabled && vm.amountInWords ? wrapTextByWidth(fonts.regular, safeText(fonts.regular, `Amount in words: ${vm.amountInWords}`), width, WORDS_SIZE) : [];

/** Height `drawTotalsBlock` will use, so callers can keep the block together on one page. */
export const measureTotalsBlock = (vm: InvoiceViewModel, opts: BlockOptions & { fonts: PdfFonts; width: number }): number => {
  const rows = buildRows(vm, opts.showGstSplit);
  const heightOf = (r: Row) => (r.style === "total" ? TOTAL_H : r.style === "net" ? NET_H : r.style === "note" ? NOTE_H : ROW_H);
  const rowsHeight = rows.reduce((sum, r) => sum + heightOf(r), 0);
  const words = wordsLines(vm, opts.fonts, opts.width, opts.showAmountInWords);
  return rowsHeight + (words.length ? WORDS_GAP + words.length * WORDS_LINE_H : 0);
};

/**
 * Subtotal, discount, GST (CGST/SGST/IGST when the breakdown is known, otherwise one row), emphasised total and,
 * for INR, the amount in words. Returns the bottom edge in y-from-top.
 */
export const drawTotalsBlock = (args: BlockOptions & {
  page: PDFPage;
  fonts: PdfFonts;
  tokens: AccentTokens;
  vm: InvoiceViewModel;
  x: number;
  yFromTop: number;
  width: number;
  /** "filled" (default): accent bars for the total and net payable. "plain": text and rules only. */
  style?: "filled" | "plain";
}): number => {
  const { page, fonts, tokens, vm, x, width } = args;
  const plain = args.style === "plain";
  const pageHeight = page.getSize().height;
  let y = args.yFromTop;

  for (const row of buildRows(vm, args.showGstSplit)) {
    const label = safeText(fonts.regular, row.label);
    const value = safeText(fonts.bold, row.value);
    if (row.style === "total") {
      if (plain) {
        page.drawLine({ start: { x, y: pageHeight - y - 2 }, end: { x: x + width, y: pageHeight - y - 2 }, thickness: 0.9, color: INK });
      } else {
        drawRect(page, pageHeight, x, y, width, TOTAL_H, tokens.accent);
      }
      const ink = plain ? INK : tokens.onAccent;
      drawText(page, pageHeight, fonts, label, x + 10, y + 19.5, 11, { isBold: true, color: ink });
      drawText(page, pageHeight, fonts, value, x + width - 10, y + 19.5, 12.5, { isBold: true, align: "right", color: ink });
      y += TOTAL_H;
    } else if (row.style === "net") {
      if (!plain) drawRect(page, pageHeight, x, y, width, NET_H, tokens.accentTintStrong);
      drawText(page, pageHeight, fonts, label, x + 10, y + 18, 10.5, { isBold: true, color: plain ? INK : tokens.accentDark });
      drawText(page, pageHeight, fonts, value, x + width - 10, y + 18, 11.5, { isBold: true, align: "right", color: plain ? INK : tokens.accentDark });
      y += NET_H;
    } else if (row.style === "note") {
      drawText(page, pageHeight, fonts, label, x + 10, y + 11, 7.5, { color: MUTED });
      y += NOTE_H;
    } else {
      const color = row.style === "muted" ? MUTED : INK;
      drawText(page, pageHeight, fonts, label, x + 10, y + 12.5, 9, { color });
      drawText(page, pageHeight, fonts, value, x + width - 10, y + 12.5, 9, { isBold: row.style === "normal", align: "right", color });
      y += ROW_H;
    }
  }

  const words = wordsLines(vm, fonts, width, args.showAmountInWords);
  if (words.length) {
    y += WORDS_GAP;
    for (const text of words) {
      drawText(page, pageHeight, fonts, text, x, y + 7.5, WORDS_SIZE, { isItalic: true, color: MUTED });
      y += WORDS_LINE_H;
    }
  }
  return y;
};
