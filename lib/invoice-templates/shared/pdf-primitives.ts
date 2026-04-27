import fs from "fs";
import type { Color, PDFArray, PDFDocument, PDFPage } from "pdf-lib";
import { PDFName, PDFString } from "pdf-lib";
import { buildPrivatePath } from "@/lib/uploads/private-storage";
import type { PdfFonts } from "@/lib/invoice-templates/types";

export const drawText = (
  page: PDFPage,
  pageHeight: number,
  fonts: PdfFonts,
  text: string,
  x: number,
  yFromTop: number,
  size: number,
  options?: {
    isBold?: boolean;
    isItalic?: boolean;
    align?: "left" | "right" | "center";
    color?: Color;
  },
) => {
  const align = options?.align ?? "left";
  const font = options?.isBold ? fonts.bold : options?.isItalic ? fonts.oblique : fonts.regular;
  let textX = x;
  if (align === "right") textX = x - font.widthOfTextAtSize(text, size);
  if (align === "center") textX = x - font.widthOfTextAtSize(text, size) / 2;
  page.drawText(text, {
    x: textX,
    y: pageHeight - yFromTop,
    size,
    font,
    color: options?.color,
  });
};

export const drawRect = (
  page: PDFPage,
  pageHeight: number,
  x: number,
  yFromTop: number,
  width: number,
  height: number,
  color: Color,
  borderColor?: Color,
) => {
  page.drawRectangle({
    x,
    y: pageHeight - yFromTop - height,
    width,
    height,
    color,
    borderColor: borderColor || undefined,
    borderWidth: borderColor ? 1 : 0,
  });
};

export const wrapTextByWidth = (
  font: import("pdf-lib").PDFFont,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] => {
  if (!text) return [];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  const pushCurrentLine = () => {
    if (currentLine) lines.push(currentLine);
    currentLine = "";
  };

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) pushCurrentLine();

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      currentLine = word;
      continue;
    }

    let segment = "";
    for (const char of word) {
      const testSegment = `${segment}${char}`;
      if (font.widthOfTextAtSize(testSegment, fontSize) <= maxWidth) {
        segment = testSegment;
      } else {
        if (segment) lines.push(segment);
        segment = char;
      }
    }
    currentLine = segment;
  }

  pushCurrentLine();
  return lines;
};

export const addLinkAnnotation = (
  doc: PDFDocument,
  page: PDFPage,
  x: number,
  absoluteY: number,
  width: number,
  height: number,
  url: string,
) => {
  const linkAnnotation = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [x, absoluteY, x + width, absoluteY + height],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFString.of(url),
    },
  });

  const ref = doc.context.register(linkAnnotation);
  const annots = page.node.get(PDFName.of("Annots")) as PDFArray | undefined;
  if (annots) {
    annots.push(ref);
  } else {
    page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));
  }
};

export const loadLogo = async (
  pdfDoc: PDFDocument,
  page: PDFPage,
  pageHeight: number,
  logoUrl: string | null | undefined,
  x: number,
  yFromTop: number,
  maxWidth: number,
  maxHeight: number,
  align: "left" | "right" = "left",
) => {
  if (!logoUrl) return false;

  try {
    const cleanUrl = logoUrl.split("?")[0];
    const relativeLogoPath = cleanUrl.startsWith("/") ? cleanUrl.substring(1) : cleanUrl;
    const parts = relativeLogoPath.split("/").filter(Boolean);
    const kind = parts.shift();
    if (!kind) return false;
    const fullPath = buildPrivatePath(kind as never, parts);
    if (!fs.existsSync(fullPath)) return false;

    const imageData = fs.readFileSync(fullPath);
    let image;
    const lowerPath = cleanUrl.toLowerCase();
    if (lowerPath.endsWith(".png")) {
      image = await pdfDoc.embedPng(imageData);
    } else if (lowerPath.endsWith(".webp")) {
      const sharp = (await import("sharp")).default;
      const pngData = await sharp(imageData).png().toBuffer();
      image = await pdfDoc.embedPng(pngData);
    } else {
      image = await pdfDoc.embedJpg(imageData);
    }

    const dims = image.scaleToFit(maxWidth, maxHeight);
    const drawX = align === "right" ? x - dims.width : x;
    page.drawImage(image, {
      x: drawX,
      y: pageHeight - yFromTop - dims.height,
      width: dims.width,
      height: dims.height,
    });
    return true;
  } catch (error) {
    console.log(`Logo load failed: ${logoUrl}`, error);
    return false;
  }
};
