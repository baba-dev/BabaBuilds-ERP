import { rgb } from "pdf-lib";
import type { Color, PDFPage } from "pdf-lib";
import type { InvoiceLineView } from "@/lib/invoice/build-invoice-view-model";
import type { Paginator, PdfFonts } from "@/lib/invoice-templates/types";
import type { AccentTokens } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { drawRect, drawText, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";

export type TableColumn = {
  key: "description" | "sac" | "qty" | "rate" | "taxRate" | "discount" | "amount";
  header: string;
  width: number;
  align: "left" | "right" | "center";
};

const PAD = 6;
const FONT = 9;
const LINE_H = 11.5;
const NOTE_FONT = 7.5;
const NOTE_LINE_H = 9.5;
const ROW_PAD_Y = 6;
const MIN_ROW_H = 24;
const HEADER_H = 24;
const SECTION_H = 22;
const SUBTOTAL_H = 22;
const EMPTY_H = 36;
/** Points kept free at the bottom of every page for the footer. */
const BOTTOM_MARGIN = 56;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.86, 0.87, 0.89);

type Item =
  | { kind: "section"; title: string; height: number }
  | { kind: "line"; line: InvoiceLineView; height: number; zebra: boolean }
  | { kind: "subtotal"; title: string; amount: number; height: number };

const descriptionWidth = (columns: TableColumn[]) => (columns.find((c) => c.key === "description")?.width ?? 0) - PAD * 2;

/** Height of one line row, from the wrapped description and note. Always finite and at least MIN_ROW_H. */
export const measureLineRow = (fonts: PdfFonts, columns: TableColumn[], line: InvoiceLineView): number => {
  const width = Math.max(20, descriptionWidth(columns));
  const descLines = Math.max(1, wrapTextByWidth(fonts.regular, safeText(fonts.regular, line.description), width, FONT).length);
  const noteLines = line.note ? wrapTextByWidth(fonts.regular, safeText(fonts.regular, line.note), width, NOTE_FONT).length : 0;
  const height = ROW_PAD_Y * 2 + descLines * LINE_H + (noteLines ? 2 + noteLines * NOTE_LINE_H : 0);
  return Math.max(MIN_ROW_H, height);
};

const cellText = (line: InvoiceLineView, key: TableColumn["key"], locale: string): string => {
  switch (key) {
    case "sac": return line.sacCode ?? "";
    case "qty": return line.quantityFormatted;
    case "rate": return line.unitPriceFormatted;
    case "taxRate": return `${line.taxRatePercent}%`;
    case "discount": return line.discountAmount > 0 ? line.discountAmount.toLocaleString(locale, { minimumFractionDigits: 2 }) : "";
    case "amount": return line.amountFormatted;
    default: return "";
  }
};

const buildItems = (lines: InvoiceLineView[], fonts: PdfFonts, columns: TableColumn[], withSubtotals: boolean): Item[] => {
  const items: Item[] = [];
  let currentSection: string | null = null;
  let sectionSum = 0;
  let lineIndex = 0;
  const closeSection = () => {
    if (withSubtotals && currentSection) items.push({ kind: "subtotal", title: currentSection, amount: sectionSum, height: SUBTOTAL_H });
    sectionSum = 0;
  };
  for (const line of lines) {
    if (line.section !== currentSection) {
      closeSection();
      currentSection = line.section;
      if (currentSection) items.push({ kind: "section", title: currentSection, height: SECTION_H });
    }
    sectionSum += line.amount;
    items.push({ kind: "line", line, height: measureLineRow(fonts, columns, line), zebra: lineIndex % 2 === 1 });
    lineIndex += 1;
  }
  closeSection();
  return items;
};

/**
 * Draws the invoice line table starting at `startYFromTop` and paginates it. The header row is repeated on every
 * continuation page (which starts at `continuationTopY`). `reserveBottom` keeps that many points free below the last
 * row: if they would not fit, the last row moves to a new page so the totals that follow are never alone on a page.
 */
export const drawLineTable = (args: {
  paginator: Paginator;
  fonts: PdfFonts;
  tokens: AccentTokens;
  lines: InvoiceLineView[];
  columns: TableColumn[];
  x: number;
  startYFromTop: number;
  locale: string;
  emptyLabel: string;
  continuationTopY: number;
  reserveBottom?: number;
  zebra?: boolean;
  sectionSubtotals?: boolean;
  /** "filled" (default): accent header, zebra rows and tinted section bands. "minimal": rules only, no fills. */
  style?: "filled" | "minimal";
}): { page: PDFPage; yFromTop: number } => {
  const { paginator, fonts, tokens, lines, columns, x, locale, emptyLabel, continuationTopY } = args;
  const reserveBottom = args.reserveBottom ?? 0;
  const minimal = args.style === "minimal";
  const useZebra = (args.zebra ?? true) && !minimal;
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const items = buildItems(lines, fonts, columns, Boolean(args.sectionSubtotals));

  let page = paginator.currentPage();
  let y = args.startYFromTop;

  const colX = (index: number) => x + columns.slice(0, index).reduce((sum, c) => sum + c.width, 0);
  const pageHeight = () => page.getSize().height;

  const textInCell = (text: string, index: number, baselineYFromTop: number, opts: { bold?: boolean; color?: Color; size?: number }) => {
    const col = columns[index];
    const font = opts.bold ? fonts.bold : fonts.regular;
    const safe = safeText(font, text);
    const left = colX(index) + PAD;
    const right = colX(index) + col.width - PAD;
    const textX = col.align === "right" ? right : col.align === "center" ? (left + right) / 2 : left;
    drawText(page, pageHeight(), fonts, safe, textX, baselineYFromTop, opts.size ?? FONT, { isBold: opts.bold, align: col.align, color: opts.color ?? INK });
  };

  const rule = (atYFromTop: number) =>
    page.drawLine({ start: { x, y: pageHeight() - atYFromTop }, end: { x: x + totalWidth, y: pageHeight() - atYFromTop }, thickness: 0.5, color: RULE });

  const drawHeader = () => {
    if (minimal) {
      columns.forEach((col, i) => textInCell(col.header.toUpperCase(), i, y + 15, { bold: true, color: MUTED, size: 7 }));
      page.drawLine({ start: { x, y: pageHeight() - (y + HEADER_H) }, end: { x: x + totalWidth, y: pageHeight() - (y + HEADER_H) }, thickness: 0.9, color: INK });
    } else {
      drawRect(page, pageHeight(), x, y, totalWidth, HEADER_H, tokens.accent);
      columns.forEach((col, i) => textInCell(col.header, i, y + 15.5, { bold: true, color: tokens.onAccent, size: 8 }));
    }
    y += HEADER_H;
  };

  const startNewPageIfNeeded = (needFromTop: number): boolean => {
    const next = paginator.ensureRoom(needFromTop, BOTTOM_MARGIN);
    if (next === page) return false;
    page = next;
    y = continuationTopY;
    return true;
  };

  const firstHeight = items.length ? items[0].height : EMPTY_H;
  startNewPageIfNeeded(y + HEADER_H + firstHeight);
  drawHeader();

  if (items.length === 0) {
    if (startNewPageIfNeeded(y + EMPTY_H)) drawHeader();
    textInCell(emptyLabel, 0, y + 22, { color: MUTED });
    y += EMPTY_H;
    rule(y);
    return { page, yFromTop: y };
  }

  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    // A section heading stays with its first row; the last row stays with the space reserved for the totals.
    const follower = item.kind === "section" && items[index + 1] ? items[index + 1].height : 0;
    if (startNewPageIfNeeded(y + item.height + follower + (isLast ? reserveBottom : 0))) drawHeader();

    if (item.kind === "section") {
      if (!minimal) drawRect(page, pageHeight(), x, y, totalWidth, item.height, tokens.accentTintStrong);
      drawText(page, pageHeight(), fonts, safeText(fonts.bold, item.title), x + PAD, y + 15, FONT, { isBold: true, color: minimal ? INK : tokens.accentDark });
    } else if (item.kind === "subtotal") {
      const amountIndex = columns.findIndex((c) => c.key === "amount");
      const label = `Subtotal: ${item.title}`;
      if (!minimal) drawRect(page, pageHeight(), x, y, totalWidth, item.height, tokens.accentTint);
      drawText(page, pageHeight(), fonts, safeText(fonts.bold, label), colX(Math.max(0, amountIndex)) - PAD, y + 15, FONT, { isBold: true, align: "right", color: INK });
      if (amountIndex >= 0) {
        textInCell(item.amount.toLocaleString(locale, { minimumFractionDigits: 2 }), amountIndex, y + 15, { bold: true });
      }
    } else {
      if (useZebra && item.zebra) drawRect(page, pageHeight(), x, y, totalWidth, item.height, tokens.accentTint);
      const { line } = item;
      let baseline = y + ROW_PAD_Y + FONT * 0.9;
      const descIndex = columns.findIndex((c) => c.key === "description");
      if (descIndex >= 0) {
        const width = Math.max(20, columns[descIndex].width - PAD * 2);
        for (const text of wrapTextByWidth(fonts.regular, safeText(fonts.regular, line.description), width, FONT)) {
          textInCell(text, descIndex, baseline, {});
          baseline += LINE_H;
        }
        if (line.note) {
          baseline += 2 - (LINE_H - NOTE_FONT) * 0.5;
          for (const text of wrapTextByWidth(fonts.regular, safeText(fonts.regular, line.note), width, NOTE_FONT)) {
            textInCell(text, descIndex, baseline, { color: MUTED, size: NOTE_FONT });
            baseline += NOTE_LINE_H;
          }
        }
      }
      columns.forEach((col, i) => {
        if (col.key === "description") return;
        textInCell(cellText(line, col.key, locale), i, y + ROW_PAD_Y + FONT * 0.9, {});
      });
    }
    y += item.height;
    rule(y);
  });

  return { page, yFromTop: y };
};
