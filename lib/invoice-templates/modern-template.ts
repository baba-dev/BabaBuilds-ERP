import { rgb } from "pdf-lib";
import type { InvoiceTemplate } from "@/lib/invoice-templates/types";
import { registerInvoiceTemplate } from "@/lib/invoice-templates/registry";
import { addLinkAnnotation, drawRect, drawText, loadLogo, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";

const modernTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_2",
    title: "Modern",
    paperSize: "A4",
    supportsSignature: false,
    supportsPaymentLink: true,
    supportsMultiPage: true,
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    let page = paginator.currentPage();
    const { width, height } = page.getSize();
    const leftMargin = 40;
    const rightMargin = width - 40;

    const black = rgb(0, 0, 0);
    const textDark = rgb(0.1, 0.1, 0.1);
    const textMuted = rgb(0.4, 0.4, 0.4);
    const borderGray = rgb(0.85, 0.85, 0.85);
    const cfOrange = rgb(0.95, 0.5, 0.12);
    const cfLinkBlue = rgb(0.33, 0.7, 0);

    drawRect(page, height, 0, 0, width, 6, cfOrange);
    drawText(page, height, fonts, "Invoice", leftMargin, 41, 22, { isBold: true, color: black });
    if (vm.profile.logoUrl) {
      await loadLogo(pdfDoc, page, height, vm.profile.logoUrl, rightMargin, 40, 140, 35, "right");
    }

    let metaY = 80;
    const drawMeta = (label: string, value: string) => {
      if (!value) return;
      drawText(page, height, fonts, label, leftMargin, metaY, 9, { color: textDark });
      drawText(page, height, fonts, value, leftMargin + 100, metaY, 9, { isBold: true, color: black });
      metaY += 13;
    };
    drawMeta("Invoice number", vm.invoiceNumber);
    drawMeta("Date of issue", vm.date.toLocaleDateString(vm.userLocale, { month: "long", day: "numeric", year: "numeric" }));
    drawMeta("Date due", vm.dueDate.toLocaleDateString(vm.userLocale, { month: "long", day: "numeric", year: "numeric" }));
    drawMeta(vm.safeTaxIdLabel, vm.profile.gstin || "N/A");
    drawMeta("Company name", vm.profile.companyName);

    const billY = 170;
    drawText(page, height, fonts, vm.profile.companyName, leftMargin, billY, 9, { isBold: true, color: black });
    drawText(page, height, fonts, vm.profileAddress.lines[0] || "", leftMargin, billY + 14, 9, { color: textDark });
    drawText(page, height, fonts, vm.profileAddress.lines[1] || "", leftMargin, billY + 28, 9, { color: textDark });
    if (vm.profile.email) drawText(page, height, fonts, vm.profile.email, leftMargin, billY + 42, 9, { color: cfLinkBlue });
    if (vm.profile.udyamNumber) drawText(page, height, fonts, `MSME: ${vm.profile.udyamNumber}`, leftMargin, billY + 56, 9, { color: textDark });

    const rightColX = 280;
    drawText(page, height, fonts, "Bill to", rightColX, billY, 9, { isBold: true, color: black });
    drawText(page, height, fonts, vm.clientRaw.name, rightColX, billY + 14, 9, { color: textDark });
    drawText(page, height, fonts, vm.clientAddress.lines[0] || "", rightColX, billY + 28, 9, { color: textDark });
    drawText(page, height, fonts, vm.clientAddress.lines[1] || "", rightColX, billY + 42, 9, { color: textDark });
    drawText(page, height, fonts, vm.clientRaw.country, rightColX, billY + 56, 9, { color: textDark });
    if (vm.clientRaw.email) drawText(page, height, fonts, vm.clientRaw.email, rightColX, billY + 70, 9, { color: textDark });

    const calloutY = 270;
    drawText(
      page,
      height,
      fonts,
      `${vm.baseCurrency} ${vm.formattedTotal} due ${vm.dueDate.toLocaleDateString(vm.userLocale, { month: "long", day: "numeric", year: "numeric" })}`,
      leftMargin,
      calloutY,
      14,
      { isBold: true, color: black },
    );
    drawText(page, height, fonts, `Service Classification: ${vm.sacCodeDisplay || "N/A"}`, leftMargin, calloutY + 24, 9, { color: textMuted });

    const qtyX = rightMargin - 150;
    const priceX = rightMargin - 80;
    const drawTableHeader = (targetPage: import("pdf-lib").PDFPage, targetHeight: number, yTop: number) => {
      drawText(targetPage, targetHeight, fonts, "Description", leftMargin, yTop, 8, { color: textDark });
      drawText(targetPage, targetHeight, fonts, "Qty", qtyX, yTop, 8, { align: "right", color: textDark });
      drawText(targetPage, targetHeight, fonts, "Unit price", priceX, yTop, 8, { align: "right", color: textDark });
      drawText(targetPage, targetHeight, fonts, "Amount", rightMargin, yTop, 8, { align: "right", color: textDark });
      targetPage.drawLine({
        start: { x: leftMargin, y: targetHeight - (yTop + 12) },
        end: { x: rightMargin, y: targetHeight - (yTop + 12) },
        thickness: 1,
        color: black,
      });
    };

    let tableY = 340;
    drawTableHeader(page, height, tableY);

    tableY += 30;
    for (const service of vm.services) {
      const titleLines = wrapTextByWidth(fonts.regular, service.titleClamped, 260, 9);
      const rowHeight = Math.max(35, titleLines.length * 12 + 20);
      const previousPage = page;
      const ensuredPage = paginator.ensureRoom(tableY + rowHeight + 300, 55);
      page = ensuredPage;
      const pageHeight = page.getSize().height;
      if (ensuredPage !== previousPage) {
        tableY = 120;
        drawTableHeader(page, pageHeight, tableY);
        tableY += 30;
      }
      let lineY = tableY;
      for (const line of titleLines.slice(0, 3)) {
        drawText(page, pageHeight, fonts, line, leftMargin, lineY, 9, { color: black });
        lineY += 11;
      }
      drawText(page, pageHeight, fonts, `${service.nicDetails || "Billing period"}: ${vm.billingMonth}`, leftMargin, lineY + 3, 8, { color: textDark });
      drawText(page, pageHeight, fonts, "1", qtyX, tableY, 9, { align: "right", color: black });
      drawText(page, pageHeight, fonts, service.amountFormatted, priceX, tableY, 9, { align: "right", color: black });
      drawText(page, pageHeight, fonts, service.amountFormatted, rightMargin, tableY, 9, { align: "right", color: black });
      tableY += rowHeight;
    }

    const activeHeight = page.getSize().height;
    tableY += 10;
    const totalsLeftMargin = rightMargin - 200;
    page.drawLine({ start: { x: totalsLeftMargin, y: activeHeight - tableY }, end: { x: rightMargin, y: activeHeight - tableY }, thickness: 0.5, color: borderGray });
    drawText(page, activeHeight, fonts, "Subtotal", priceX, tableY + 15, 9, { align: "right", color: textMuted });
    drawText(page, activeHeight, fonts, vm.totals.subtotal.toLocaleString(vm.userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, { align: "right", color: black });
    tableY += 20;
    page.drawLine({ start: { x: totalsLeftMargin, y: activeHeight - tableY }, end: { x: rightMargin, y: activeHeight - tableY }, thickness: 0.5, color: borderGray });
    drawText(page, activeHeight, fonts, vm.taxRowLabel, priceX, tableY + 15, 9, { align: "right", color: textMuted });
    drawText(page, activeHeight, fonts, vm.totals.taxAmount.toLocaleString(vm.userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, { align: "right", color: black });
    tableY += 20;
    page.drawLine({ start: { x: totalsLeftMargin, y: activeHeight - tableY }, end: { x: rightMargin, y: activeHeight - tableY }, thickness: 0.5, color: borderGray });
    drawText(page, activeHeight, fonts, "Amount due", priceX, tableY + 15, 9, { isBold: true, align: "right", color: black });
    drawText(
      page,
      activeHeight,
      fonts,
      `${vm.baseCurrency} ${vm.totals.total.toLocaleString(vm.userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      rightMargin,
      tableY + 15,
      9,
      { isBold: true, align: "right", color: black },
    );

    let footerY = tableY + 60;
    drawText(page, activeHeight, fonts, `If this request is concerning an invoice reach out to ${vm.profile.email || "billing"}. For all other concerns, contact support.`, leftMargin, footerY, 8, {
      color: textDark,
    });
    footerY += 40;
    drawText(page, activeHeight, fonts, `Pay ${vm.baseCurrency} ${vm.formattedTotal} with a bank transfer`, leftMargin, footerY, 10, { isBold: true, color: black });
    drawText(page, activeHeight, fonts, "Bank transfers can take up to two business days. To pay via", leftMargin, footerY + 16, 9, { color: black });
    drawText(page, activeHeight, fonts, "bank transfer, transfer funds using the following bank", leftMargin, footerY + 28, 9, { color: black });
    drawText(page, activeHeight, fonts, "information.", leftMargin, footerY + 40, 9, { color: black });
    footerY += 65;

    const drawBankDetail = (label: string, value: string) => {
      drawText(page, activeHeight, fonts, label, leftMargin, footerY, 9, { color: textDark });
      drawText(page, activeHeight, fonts, value, leftMargin + 100, footerY, 9, { color: black });
      footerY += 14;
    };
    drawBankDetail("Bank name", vm.remittanceDisplay.bankName);
    drawBankDetail("Account Name", vm.remittanceDisplay.accountName);
    drawBankDetail("Account number", vm.remittanceDisplay.accountNumber);
    drawBankDetail(vm.safeRoutingLabel, vm.remittanceDisplay.routingCode);
    drawBankDetail("Reference", vm.invoiceNumber);

    if (vm.paymentLink) {
      footerY += 8;
      const linkText = `Pay securely online: ${vm.paymentLink}`;
      drawText(page, activeHeight, fonts, linkText, leftMargin, footerY, 9, { color: cfLinkBlue });
      addLinkAnnotation(pdfDoc, page, leftMargin, activeHeight - footerY - 1, fonts.regular.widthOfTextAtSize(linkText, 9), 10, vm.paymentLink);
      footerY += 16;
    }

    if (vm.showFreePlanFooter) {
      drawText(page, activeHeight, fonts, "This document was prepared on erp.bababuilds.com | Make yours.", width / 2, activeHeight - 18, 7, {
        align: "center",
        color: textMuted,
        isItalic: true,
      });
    }

    page.drawLine({ start: { x: leftMargin, y: 45 }, end: { x: rightMargin, y: 45 }, thickness: 0.5, color: borderGray });
    drawText(page, activeHeight, fonts, `Page ${paginator.pageNumber()} of ${paginator.pageCount()}`, rightMargin, activeHeight - 30, 8, { align: "right", color: textMuted });
  },
};

registerInvoiceTemplate(modernTemplate);

export default modernTemplate;
