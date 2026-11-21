import { rgb } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import type { PdfFonts } from "@/lib/invoice-templates/types";
import type { AccentTokens } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { drawText, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.38, 0.38, 0.42);

/** "BILL TO" style block: small accent title, bold name, address lines and an optional tax id. Returns the bottom edge in y-from-top. */
export const drawPartyBlock = (args: {
  page: PDFPage;
  fonts: PdfFonts;
  tokens: AccentTokens;
  title: string;
  name: string;
  lines: string[];
  taxId?: { label: string; value: string };
  x: number;
  yFromTop: number;
  width: number;
}): number => {
  const { page, fonts, tokens, x, width } = args;
  const pageHeight = page.getSize().height;
  let y = args.yFromTop;

  drawText(page, pageHeight, fonts, safeText(fonts.bold, args.title.toUpperCase()), x, y + 8, 7.5, { isBold: true, color: tokens.accent });
  y += 16;

  for (const text of wrapTextByWidth(fonts.bold, safeText(fonts.bold, args.name), width, 11)) {
    drawText(page, pageHeight, fonts, text, x, y + 9, 11, { isBold: true, color: INK });
    y += 14;
  }
  y += 2;

  for (const line of args.lines) {
    for (const text of wrapTextByWidth(fonts.regular, safeText(fonts.regular, line), width, 9)) {
      drawText(page, pageHeight, fonts, text, x, y + 8, 9, { color: MUTED });
      y += 11.5;
    }
  }

  if (args.taxId?.value) {
    y += 3;
    const text = safeText(fonts.regular, `${args.taxId.label}: ${args.taxId.value}`);
    for (const wrapped of wrapTextByWidth(fonts.regular, text, width, 9)) {
      drawText(page, pageHeight, fonts, wrapped, x, y + 8, 9, { color: INK });
      y += 11.5;
    }
  }
  return y;
};
