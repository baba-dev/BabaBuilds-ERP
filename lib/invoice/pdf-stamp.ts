import fs from "node:fs/promises";

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export const applyInvoiceStatusStamp = async ({
  filePath,
  stampLabel,
  receivedDateText,
}: {
  filePath: string;
  stampLabel: "PAID" | "PARTIALLY PAID";
  receivedDateText?: string;
}) => {
  const existingPdfBytes = await fs.readFile(filePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.setTitle(`STAMP:${stampLabel}`);
  if (receivedDateText) {
    pdfDoc.setSubject(`RECEIVED:${receivedDateText}`);
  }
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const stampSize = stampLabel === "PARTIALLY PAID" ? 96 : 130;
    const stampX = stampLabel === "PARTIALLY PAID" ? width / 2 - 220 : width / 2 - 140;
    page.drawText(stampLabel, {
      x: stampX,
      y: height / 2 - 50,
      size: stampSize,
      font: fontBold,
      color: rgb(0.85, 0.15, 0.15),
      opacity: 0.1,
      rotate: degrees(45),
    });

    if (receivedDateText) {
      page.drawText(`RECEIVED: ${receivedDateText}`, {
        x: width / 2 - 140,
        y: height / 2 - 130,
        size: 24,
        font: fontBold,
        color: rgb(0.85, 0.15, 0.15),
        opacity: 0.1,
        rotate: degrees(45),
      });
    }
  });

  const stampedBytes = await pdfDoc.save();
  await fs.writeFile(filePath, stampedBytes);
};

export const getInvoiceStampDescriptor = ({
  status,
  dateReceivedIso,
}: {
  status: string;
  dateReceivedIso?: string;
}) => {
  const normalized = status.trim().toUpperCase();
  if (normalized === "PARTIALLY_PAID" || normalized === "PARTIALLY PAID") {
    return {
      stampLabel: "PARTIALLY PAID" as const,
      receivedDateText: undefined,
    };
  }
  if (normalized === "PAID") {
    const paymentDateObj = dateReceivedIso ? new Date(dateReceivedIso) : null;
    const formattedDate =
      paymentDateObj && !Number.isNaN(paymentDateObj.getTime())
        ? paymentDateObj
            .toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
            .toUpperCase()
        : undefined;
    return {
      stampLabel: "PAID" as const,
      receivedDateText: formattedDate,
    };
  }
  return null;
};
