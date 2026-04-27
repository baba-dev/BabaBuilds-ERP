import { rgb } from "pdf-lib";
import type { InvoiceTemplate } from "@/lib/invoice-templates/types";
import { registerInvoiceTemplate } from "@/lib/invoice-templates/registry";
import { addLinkAnnotation, drawRect, drawText, loadLogo, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";
import { drawInvoiceWatermark } from "@/lib/invoice-templates/shared/watermark";

const classicTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_1",
    title: "Classic",
    paperSize: "A4",
    supportsSignature: true,
    supportsPaymentLink: true,
    supportsMultiPage: true,
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    let page = paginator.currentPage();
    const { width, height } = page.getSize();
    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);
    const textDark = rgb(0.1, 0.1, 0.1);
    const textMuted = rgb(0.4, 0.4, 0.4);
    const bgLight = rgb(0.96, 0.96, 0.96);
    const borderGray = rgb(0.85, 0.85, 0.85);

    const leftMargin = 40;
    const rightMargin = width - 40;
    const clientSectionX = 320;

    const drawHeader = async () => {
      const loaded = vm.profile.logoUrl
        ? await loadLogo(pdfDoc, page, height, vm.profile.logoUrl, leftMargin, 30, 180, 45)
        : false;
      if (!loaded) {
        drawText(page, height, fonts, vm.profile.companyName, leftMargin, 46, 18, { isBold: true, color: black });
      }
      drawText(page, height, fonts, "INVOICE", rightMargin, 45, 24, { isBold: true, align: "right", color: black });
      drawText(page, height, fonts, vm.headerTitle, rightMargin, 60, 10, { isBold: true, align: "right", color: textMuted });
      drawText(page, height, fonts, vm.subHeader, rightMargin, 72, 8, { isItalic: true, align: "right", color: textMuted });
      page.drawLine({
        start: { x: leftMargin, y: height - 85 },
        end: { x: rightMargin, y: height - 85 },
        thickness: 2,
        color: black,
      });
    };

    await drawHeader();

    drawText(page, height, fonts, "From:", leftMargin, 110, 9, { isBold: true, color: textMuted });
    drawText(page, height, fonts, vm.profile.companyName, leftMargin, 125, 11, { isBold: true, color: black });
    if (vm.profile.proprietorName) {
      drawText(page, height, fonts, `(Proprietor: ${vm.profile.proprietorName})`, leftMargin, 140, 9, { color: textMuted });
    }
    drawText(page, height, fonts, vm.profileAddress.lines[0] || "", leftMargin, 155, 10, { color: textDark });
    if (vm.profileAddress.lines[1]) {
      drawText(page, height, fonts, vm.profileAddress.lines[1], leftMargin, 170, 10, { color: textDark });
    }

    drawText(page, height, fonts, "To:", clientSectionX, 110, 9, { isBold: true, color: textMuted });
    const clientLogoLoaded = vm.clientRaw.logoUrl
      ? await loadLogo(pdfDoc, page, height, vm.clientRaw.logoUrl, clientSectionX, 118, 140, 35)
      : false;
    const clientNameY = clientLogoLoaded ? 165 : 125;
    drawText(page, height, fonts, vm.clientRaw.name, clientSectionX, clientNameY, 11, { isBold: true, color: black });
    drawText(page, height, fonts, vm.clientAddress.lines[0] || "", clientSectionX, clientNameY + 15, 9, { color: textMuted });
    if (vm.clientAddress.lines[1]) {
      drawText(page, height, fonts, vm.clientAddress.lines[1], clientSectionX, clientNameY + 30, 9, { color: textMuted });
    }
    drawText(page, height, fonts, vm.clientRaw.country, clientSectionX, clientNameY + (vm.clientAddress.lines[1] ? 45 : 30), 10, {
      isBold: true,
      color: textDark,
    });

    drawRect(page, height, leftMargin, 220, width - 80, 50, bgLight, borderGray);
    drawText(page, height, fonts, "Invoice No:", 55, 240, 9, { isBold: true, color: textMuted });
    drawText(page, height, fonts, vm.invoiceNumber, 115, 240, 10, { isBold: true, color: black });
    drawText(page, height, fonts, "Date:", 250, 240, 9, { isBold: true, color: textMuted });
    drawText(page, height, fonts, vm.date.toLocaleDateString(vm.userLocale), 280, 240, 10, { isBold: true, color: black });
    drawText(page, height, fonts, "Billing Month:", 390, 240, 9, { isBold: true, color: textMuted });
    drawText(page, height, fonts, vm.billingMonth, 465, 240, 10, { isBold: true, color: black });

    drawText(page, height, fonts, "Place of Supply:", 55, 258, 9, { isBold: true, color: textMuted });
    drawText(page, height, fonts, `${vm.clientRaw.country} (${vm.clientRaw.isExport ? "Export" : "Domestic"})`, 135, 258, 10, {
      isBold: true,
      color: black,
    });
    drawText(page, height, fonts, "Tax Identification:", 390, 258, 9, { isBold: true, color: textMuted });
    drawText(page, height, fonts, vm.clientRaw.taxId || "N/A", 475, 258, 10, { isBold: true, color: black });

    drawRect(page, height, leftMargin, 290, width - 80, 25, black);
    drawText(page, height, fonts, "Classification", 50, 307, 9, { isBold: true, color: white });
    drawText(page, height, fonts, "Description of Services", 180, 307, 9, { isBold: true, color: white });
    drawText(page, height, fonts, `Amount (${vm.baseCurrency})`, width - 50, 307, 9, { isBold: true, align: "right", color: white });

    if (vm.watermarkKind !== "NONE") {
      drawInvoiceWatermark(page, fonts.bold, vm.watermarkKind);
    }

    let currentY = 335;
    for (const service of vm.services) {
      const titleLines = wrapTextByWidth(fonts.bold, service.titleClamped, 300, 10).slice(0, 3);
      const rowHeight = Math.max(40, titleLines.length * 12 + 24);
      paginator.ensureRoom(currentY + rowHeight + 250, 70);
      page = paginator.currentPage();

      drawText(page, height, fonts, vm.sacCodeShort, 50, currentY, 10, { color: textDark });
      titleLines.forEach((line, index) => {
        drawText(page, height, fonts, line, 180, currentY + index * 12, 10, { isBold: true, color: black });
      });
      drawText(page, height, fonts, `(${service.nicDetails || "Billing period"} for ${vm.billingMonth})`, 180, currentY + titleLines.length * 12 + 3, 8, {
        color: textMuted,
      });
      drawText(page, height, fonts, service.amountFormatted, width - 50, currentY, 10, { align: "right", color: textDark });
      currentY += rowHeight;
    }

    const dividerY = currentY - 10;
    page.drawLine({
      start: { x: leftMargin, y: height - dividerY },
      end: { x: rightMargin, y: height - dividerY },
      thickness: 1,
      color: borderGray,
    });

    drawText(page, height, fonts, "Subtotal", width - 150, currentY + 10, 9, { align: "right", color: textMuted });
    drawText(page, height, fonts, vm.totals.subtotal.toLocaleString(vm.userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 10, 10, {
      align: "right",
      color: textDark,
    });
    drawText(page, height, fonts, vm.taxRowLabel, width - 150, currentY + 25, 9, { align: "right", color: textMuted });
    drawText(page, height, fonts, vm.totals.taxAmount.toLocaleString(vm.userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 25, 10, {
      align: "right",
      color: textDark,
    });
    drawText(page, height, fonts, "Total", width - 150, currentY + 40, 9, { align: "right", color: textMuted });
    drawText(page, height, fonts, vm.totals.total.toLocaleString(vm.userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 40, 10, {
      align: "right",
      color: textDark,
    });

    drawRect(page, height, width - 250, currentY + 70, 210, 35, black);
    drawText(page, height, fonts, "Total Amount", width - 175, currentY + 92, 11, { isBold: true, align: "right", color: white });
    drawText(
      page,
      height,
      fonts,
      `${vm.baseCurrency} ${vm.totals.total.toLocaleString(vm.userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      width - 55,
      currentY + 92,
      11,
      { isBold: true, align: "right", color: white },
    );

    const bankY = currentY + 118;
    let paymentLinkRendered = false;
    if (vm.paymentLink) {
      const linkLabel = "Pay Online via UPI / Card / Net Banking / Apple Pay:";
      const leftStartX = 40;
      const maxUrlWidth = width - 40 - 220;
      const urlFontSize = 9;
      const lineHeight = 12;
      const urlLinesToDraw = wrapTextByWidth(fonts.regular, vm.paymentLink, maxUrlWidth, urlFontSize);
      const urlBottomY = bankY - 10;
      urlLinesToDraw.forEach((line, index) => {
        const lineY = urlBottomY - ((urlLinesToDraw.length - 1 - index) * lineHeight);
        drawText(page, height, fonts, line, leftStartX, lineY, urlFontSize, { color: rgb(0.33, 0.7, 0) });
      });
      const topUrlLineY = urlBottomY - ((urlLinesToDraw.length - 1) * lineHeight);
      drawText(page, height, fonts, linkLabel, leftStartX, topUrlLineY - lineHeight, 9, { isBold: true, color: black });
      const maxRenderedLineWidth = Math.max(...urlLinesToDraw.map((line) => fonts.regular.widthOfTextAtSize(line, urlFontSize)), 0);
      const urlBlockHeight = lineHeight * Math.max(1, urlLinesToDraw.length);
      addLinkAnnotation(pdfDoc, page, leftStartX, height - (topUrlLineY + urlBlockHeight), maxRenderedLineWidth, urlBlockHeight, vm.paymentLink);
      paymentLinkRendered = true;
    }

    drawText(page, height, fonts, "Bank Details for Remittance", leftMargin, bankY, 10, { isBold: true, color: black });
    drawText(page, height, fonts, `Bank Name: ${vm.remittanceDisplay.bankName}`, leftMargin, bankY + 20, 9, { color: textDark });
    drawText(page, height, fonts, `Account Name: ${vm.remittanceDisplay.accountName}`, leftMargin, bankY + 35, 9, { color: textDark });
    drawText(page, height, fonts, `Account No: ${vm.remittanceDisplay.accountNumber}`, leftMargin, bankY + 50, 9, { isBold: true, color: black });
    drawText(page, height, fonts, `${vm.safeRoutingLabel}: ${vm.remittanceDisplay.routingCode}`, leftMargin, bankY + 65, 9, { color: textDark });

    drawText(page, height, fonts, `For ${vm.profile.companyName}`, width - 40, bankY + 20, 10, { isBold: true, align: "right", color: black });
    if (vm.profile.signatureUrl) {
      await loadLogo(pdfDoc, page, height, vm.profile.signatureUrl, width - 40, bankY + 30, 140, 35, "right");
    }
    page.drawLine({
      start: { x: width - 180, y: height - (bankY + 70) },
      end: { x: width - 40, y: height - (bankY + 70) },
      thickness: 1,
      color: black,
    });
    drawText(page, height, fonts, "Authorized Signatory", width - 40, bankY + 85, 9, { align: "right", color: textMuted });

    const declarationLines = vm.isIndiaWorkspace
      ? [
          "1. GST Exemption: We hereby declare that our aggregate turnover is below the statutory registration threshold",
          "   prescribed under Section 22 of the CGST Act, 2017. Hence, GST is not applicable on this invoice.",
          vm.clientRaw.isExport
            ? "2. Export of Service: This supply qualifies as an 'Export of Services' as defined under Section 2(6) of the"
            : "2. Nature of Supply: This invoice represents a domestic supply of services within the territory of India.",
          vm.clientRaw.isExport
            ? "   IGST Act, 2017. The recipient and place of supply are located outside India."
            : "3. MSME Status: The service provider is a registered Micro Enterprise under the MSMED Act, 2006.",
          vm.clientRaw.isExport ? "3. MSME Status: The service provider is a registered Micro Enterprise under the MSMED Act, 2006." : null,
        ].filter((line): line is string => Boolean(line))
      : [
          "1. Tax Treatment: This document applies the workspace's configured tax profile and registration settings.",
          `   Applicable label: ${vm.taxLabel || "VAT/Tax"} | Registration field: ${vm.safeTaxIdLabel}.`,
          vm.clientRaw.isExport
            ? "2. Cross-border Supply: Recipient and place-of-supply details are captured for export/international billing."
            : "2. Domestic Supply: This invoice is issued as a domestic supply under the workspace's configured jurisdiction.",
          "3. Compliance Note: Confirm filing obligations with your local tax advisor or authority guidance.",
        ];

    const declarationHeight = 45 + declarationLines.length * 12;
    const decY = bankY + 95 + (paymentLinkRendered ? 15 : 0);
    drawRect(page, height, leftMargin, decY, width - 80, declarationHeight, bgLight, borderGray);
    drawText(page, height, fonts, "Statutory Declarations:", 55, decY + 20, 9, { isBold: true, color: black });
    declarationLines.forEach((line, index) => {
      drawText(page, height, fonts, line, 55, decY + 35 + index * 12, 8, { color: textDark });
    });

    let metaStringValue = `${vm.profile.companyName} | PAN: ${vm.profile.panNumber}`;
    if (vm.profile.udyamNumber) metaStringValue += ` | MSME: ${vm.profile.udyamNumber}`;
    if (vm.profile.gstin) metaStringValue += ` | ${vm.safeTaxIdLabel}: ${vm.profile.gstin}`;
    const contactString = `${vm.profile.email || "billing@company.com"}${vm.profile.phone ? ` | ${vm.profile.phone}` : ""}${
      vm.profile.website ? ` | ${vm.profile.website}` : ""
    }`;

    drawRect(page, height, 0, height - 72, width, 72, black);
    drawText(page, height, fonts, metaStringValue, width / 2, height - 43, 9, { align: "center", color: white });
    drawText(page, height, fonts, contactString, width / 2, height - 24, 9, { align: "center", color: white });
    if (vm.showFreePlanFooter) {
      drawText(page, height, fonts, "This document was prepared on erp.bababuilds.com | Make yours.", width / 2, height - 9, 7, {
        align: "center",
        color: rgb(0.5, 0.5, 0.5),
        isItalic: true,
      });
    }
  },
};

registerInvoiceTemplate(classicTemplate);

export default classicTemplate;
