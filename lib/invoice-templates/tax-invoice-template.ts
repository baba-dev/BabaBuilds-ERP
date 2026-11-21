import { rgb } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import type { InvoiceTemplate } from "@/lib/invoice-templates/types";
import { registerInvoiceTemplate } from "@/lib/invoice-templates/registry";
import { addLinkAnnotation, drawRect, drawText, loadLogo, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";
import { buildAccentTokens, resolveAccent } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { drawLineTable, type TableColumn } from "@/lib/invoice-templates/shared/table";
import { drawTotalsBlock, measureTotalsBlock } from "@/lib/invoice-templates/shared/totals";
import { drawPartyBlock } from "@/lib/invoice-templates/shared/party-blocks";
import { drawPaymentStamp, drawPaymentWatermark } from "@/lib/invoice-templates/shared/stamp";

const MARGIN = 40;
const CONTINUATION_TOP = 60;
const FOOTER_RULE_FROM_BOTTOM = 44;
const TOTALS_WIDTH = 225;
const STAMP_SPACE = 96;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.86, 0.87, 0.89);

const taxInvoiceTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_3",
    title: "Tax Invoice",
    paperSize: "A4",
    supportsSignature: true,
    supportsPaymentLink: true,
    supportsMultiPage: true,
    fonts: "unicode",
    defaultAccent: "#0B3D91",
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    const tokens = buildAccentTokens(resolveAccent({ ...vm.accentCandidates, designDefault: taxInvoiceTemplate.meta.defaultAccent ?? "#0B3D91" }).hex);
    let page: PDFPage = paginator.currentPage();
    const { width, height } = page.getSize();
    const contentWidth = width - MARGIN * 2;
    const right = width - MARGIN;
    const date = (d: Date) => d.toLocaleDateString(vm.userLocale, { day: "numeric", month: "short", year: "numeric" });
    const num = (n: number) => n.toLocaleString(vm.userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    drawPaymentWatermark(page, fonts, vm);
    paginator.onPageAdded((added) => {
      drawPaymentWatermark(added, fonts, vm);
      const h = added.getSize().height;
      drawText(added, h, fonts, safeText(fonts.bold, `Invoice ${vm.invoiceNumber}  ·  ${vm.clientRaw.name}`), MARGIN, 30, 8, { isBold: true, color: MUTED });
      drawText(added, h, fonts, "Continued", right, 30, 8, { align: "right", color: MUTED });
      added.drawLine({ start: { x: MARGIN, y: h - 40 }, end: { x: right, y: h - 40 }, thickness: 0.5, color: RULE });
    });
    paginator.onFinalize((target, index, total) => {
      const h = target.getSize().height;
      target.drawLine({ start: { x: MARGIN, y: FOOTER_RULE_FROM_BOTTOM }, end: { x: right, y: FOOTER_RULE_FROM_BOTTOM }, thickness: 0.5, color: RULE });
      const ids = [vm.profile.companyName, vm.profile.gstin ? `${vm.safeTaxIdLabel}: ${vm.profile.gstin}` : null, vm.profile.panNumber ? `PAN: ${vm.profile.panNumber}` : null].filter(Boolean).join("  ·  ");
      drawText(target, h, fonts, safeText(fonts.regular, ids), MARGIN, h - 30, 7, { color: MUTED });
      drawText(target, h, fonts, `Invoice ${vm.invoiceNumber}  ·  Page ${index} of ${total}`, right, h - 30, 7, { align: "right", color: MUTED });
      if (vm.showFreePlanFooter) {
        drawText(target, h, fonts, "This document was prepared on erp.bababuilds.com | Make yours.", width / 2, h - 14, 6.5, { align: "center", color: rgb(0.55, 0.55, 0.58), isItalic: true });
      }
    });

    // Header: logo or company name on the left, document title on the right.
    const hasLogo = vm.profile.logoUrl ? await loadLogo(pdfDoc, page, height, vm.profile.logoUrl, MARGIN, 34, 130, 44) : false;
    if (!hasLogo) {
      const nameLines = wrapTextByWidth(fonts.bold, safeText(fonts.bold, vm.profile.companyName), 280, 16).slice(0, 2);
      nameLines.forEach((line, i) => drawText(page, height, fonts, line, MARGIN, 52 + i * 19, 16, { isBold: true, color: tokens.accentDark }));
    }
    drawText(page, height, fonts, safeText(fonts.bold, vm.headerTitle), right, 52, 20, { isBold: true, align: "right", color: tokens.accent });
    drawText(page, height, fonts, safeText(fonts.regular, vm.subHeader), right, 67, 7, { align: "right", color: MUTED });
    drawRect(page, height, MARGIN, 84, contentWidth, 2.5, tokens.accent);

    // Meta strip.
    const cells: Array<[string, string]> = [
      ["Invoice no.", vm.invoiceNumber],
      ["Invoice date", date(vm.date)],
      ["Due date", date(vm.dueDate)],
      vm.gst.placeOfSupplyName ? ["Place of supply", `${vm.gst.placeOfSupplyName}${vm.gst.placeOfSupplyCode && vm.gst.placeOfSupplyCode !== "96" ? ` (${vm.gst.placeOfSupplyCode})` : ""}`] : ["Billing period", vm.billingMonth || "-"],
    ];
    drawRect(page, height, MARGIN, 96, contentWidth, 44, tokens.accentTint);
    const cellWidth = contentWidth / cells.length;
    cells.forEach(([label, value], i) => {
      const cx = MARGIN + i * cellWidth + 12;
      drawText(page, height, fonts, label.toUpperCase(), cx, 112, 6.5, { isBold: true, color: MUTED });
      const lines = wrapTextByWidth(fonts.bold, safeText(fonts.bold, value), cellWidth - 18, 9.5).slice(0, 2);
      lines.forEach((line, k) => drawText(page, height, fonts, line, cx, 126 + k * 11, 9.5, { isBold: true, color: INK }));
    });

    // Parties.
    const colWidth = (contentWidth - 24) / 2;
    const supplierLines = [...vm.profileAddress.lines, [vm.profile.email, vm.profile.phone].filter(Boolean).join("  ·  "), vm.profile.panNumber ? `PAN: ${vm.profile.panNumber}` : ""].filter(Boolean);
    const supplierBottom = drawPartyBlock({ page, fonts, tokens, title: "Billed by", name: vm.profile.companyName, lines: supplierLines, taxId: vm.profile.gstin ? { label: vm.safeTaxIdLabel, value: vm.profile.gstin } : undefined, x: MARGIN, yFromTop: 158, width: colWidth });
    const clientBottom = drawPartyBlock({ page, fonts, tokens, title: "Billed to", name: vm.clientRaw.name, lines: [...vm.clientAddress.lines, [vm.clientRaw.email].filter(Boolean).join("")].filter(Boolean), taxId: vm.clientRaw.taxId ? { label: vm.safeTaxIdLabel, value: vm.clientRaw.taxId } : undefined, x: MARGIN + colWidth + 24, yFromTop: 158, width: colWidth });
    let y = Math.max(supplierBottom, clientBottom) + 6;

    // Supply notes.
    const notes: string[] = [];
    if (vm.gst.reverseCharge) notes.push("Tax is payable on reverse charge basis.");
    if (vm.gst.supplyOverride === "SEZ_WP") notes.push("Supply to a SEZ unit or developer with payment of tax.");
    if (vm.gst.supplyOverride === "SEZ_WOP") notes.push("Supply to a SEZ unit or developer without payment of tax, under bond or Letter of Undertaking.");
    notes.forEach((note) => {
      drawText(page, height, fonts, safeText(fonts.regular, note), MARGIN, y + 8, 8, { isItalic: true, color: MUTED });
      y += 12;
    });
    y += 8;

    // Line items.
    const includeTax = !vm.flags.isTaxExempt;
    const includeSac = vm.lines.some((l) => l.sacCode);
    const fixed = (includeSac ? 62 : 0) + 40 + 72 + (includeTax ? 50 : 0) + 86;
    const columns: TableColumn[] = [
      { key: "description", header: "Description", width: contentWidth - fixed, align: "left" },
      ...(includeSac ? [{ key: "sac", header: "HSN/SAC", width: 62, align: "left" } as const] : []),
      { key: "qty", header: "Qty", width: 40, align: "right" },
      { key: "rate", header: "Rate", width: 72, align: "right" },
      ...(includeTax ? [{ key: "taxRate", header: "Tax", width: 50, align: "right" } as const] : []),
      { key: "amount", header: "Amount", width: 86, align: "right" },
    ];

    const summaryKind = vm.gst.kind === "INTRA" || vm.gst.kind === "INTER" || (vm.gst.kind === "NONE" && vm.gst.rows.length > 0);
    const summaryHeight = summaryKind ? 18 + 18 + (vm.gst.rows.length + 1) * 16 : 0;
    const totalsOpts = { fonts, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: true };
    const totalsHeight = measureTotalsBlock(vm, totalsOpts);
    const paidExtra = vm.payment.kind === "NONE" ? 0 : STAMP_SPACE;
    // Keep the bank details and signature on the same page as the totals so the last page is never just a footer.
    const closingHeight = 130;
    const table = drawLineTable({
      paginator, fonts, tokens, lines: vm.lines, columns, x: MARGIN, startYFromTop: y, locale: vm.userLocale,
      emptyLabel: "No items on this invoice", continuationTopY: CONTINUATION_TOP,
      reserveBottom: Math.max(totalsHeight, summaryHeight) + 24 + paidExtra + closingHeight,
    });
    page = table.page;
    y = table.yFromTop + 18;

    // Tax summary (left) beside the totals (right).
    if (summaryKind) {
      const heads: Array<{ label: string; width: number; value: (r: (typeof vm.gst.rows)[number]) => string }> =
        vm.gst.kind === "INTRA"
          ? [
              { label: "Rate", width: 36, value: (r) => `${r.ratePercent}%` },
              { label: "Taxable value", width: 78, value: (r) => num(r.taxable) },
              { label: "CGST", width: 52, value: (r) => num(r.cgst) },
              { label: "SGST", width: 52, value: (r) => num(r.sgst) },
              { label: "Tax", width: 52, value: (r) => num(r.total) },
            ]
          : vm.gst.kind === "INTER"
            ? [
                { label: "Rate", width: 40, value: (r) => `${r.ratePercent}%` },
                { label: "Taxable value", width: 90, value: (r) => num(r.taxable) },
                { label: "IGST", width: 70, value: (r) => num(r.igst) },
                { label: "Tax", width: 70, value: (r) => num(r.total) },
              ]
            : [
                { label: "Rate", width: 60, value: (r) => `${r.ratePercent}%` },
                { label: "Taxable value", width: 110, value: (r) => num(r.taxable) },
                { label: "Tax", width: 100, value: (r) => num(r.total) },
              ];
      const summaryWidth = heads.reduce((s, h) => s + h.width, 0);
      let sy = y;
      drawText(page, height, fonts, "Tax summary", MARGIN, sy + 9, 9, { isBold: true, color: tokens.accent });
      sy += 18;
      drawRect(page, height, MARGIN, sy, summaryWidth, 18, tokens.accentTintStrong);
      let hx = MARGIN;
      heads.forEach((h, i) => {
        drawText(page, height, fonts, h.label, i === 0 ? hx + 6 : hx + h.width - 6, sy + 12, 7.5, { isBold: true, align: i === 0 ? "left" : "right", color: tokens.accentDark });
        hx += h.width;
      });
      sy += 18;
      const rowsPlusTotal = [...vm.gst.rows, null];
      rowsPlusTotal.forEach((row) => {
        let cx = MARGIN;
        const totalRow = row === null;
        heads.forEach((h, i) => {
          let text = "";
          if (row) text = h.value(row);
          else if (i === 0) text = "Total";
          else if (h.label === "Taxable value") text = num(vm.gst.rows.reduce((s, r) => s + r.taxable, 0));
          else if (h.label === "CGST") text = num(vm.gst.cgst);
          else if (h.label === "SGST") text = num(vm.gst.sgst);
          else if (h.label === "IGST") text = num(vm.gst.igst);
          else text = num(vm.gst.totalTax);
          drawText(page, height, fonts, text, i === 0 ? cx + 6 : cx + h.width - 6, sy + 11, 8, { isBold: totalRow, align: i === 0 ? "left" : "right", color: INK });
          cx += h.width;
        });
        sy += 16;
        page.drawLine({ start: { x: MARGIN, y: height - sy }, end: { x: MARGIN + summaryWidth, y: height - sy }, thickness: 0.5, color: RULE });
      });
    }
    const totalsX = right - TOTALS_WIDTH;
    const totalsBottom = drawTotalsBlock({ page, fonts, tokens, vm, x: totalsX, yFromTop: y, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: true });
    if (vm.payment.kind !== "NONE") {
      drawPaymentStamp({ page, fonts, vm, anchorX: totalsX + TOTALS_WIDTH / 2, anchorYFromTop: totalsBottom + 48 });
    }
    y = Math.max(totalsBottom, y + summaryHeight) + paidExtra + 10;

    // IRN (text only; the e-invoice QR comes later).
    if (vm.gst.irn) {
      const irnLines = wrapTextByWidth(fonts.regular, vm.gst.irn, contentWidth - 60, 7.5);
      const blockHeight = 18 + irnLines.length * 10 + 12;
      page = paginator.ensureRoom(y + blockHeight, 56);
      if (page !== table.page && y + blockHeight > height) y = CONTINUATION_TOP;
      drawRect(page, height, MARGIN, y, contentWidth, blockHeight, tokens.accentTint);
      drawText(page, height, fonts, "E-INVOICE", MARGIN + 10, y + 13, 7, { isBold: true, color: tokens.accentDark });
      irnLines.forEach((line, i) => drawText(page, height, fonts, `${i === 0 ? "IRN: " : "        "}${line}`, MARGIN + 10, y + 26 + i * 10, 7.5, { color: INK }));
      const ack = [vm.gst.irnAckNo ? `Ack no: ${vm.gst.irnAckNo}` : "", vm.gst.irnAckDate ? `Ack date: ${date(vm.gst.irnAckDate)}` : ""].filter(Boolean).join("     ");
      if (ack) drawText(page, height, fonts, ack, MARGIN + 10, y + 26 + irnLines.length * 10, 7.5, { color: MUTED });
      y += blockHeight + 10;
    }

    // Bank details and signature.
    const needed = 120;
    const next = paginator.ensureRoom(y + needed, 56);
    if (next !== page) {
      page = next;
      y = CONTINUATION_TOP;
    }
    let by = y;
    if (vm.flags.hasBankDetails) {
      drawText(page, height, fonts, "Bank details", MARGIN, by + 9, 9, { isBold: true, color: tokens.accent });
      const rows: Array<[string, string, boolean]> = [
        ["Bank", vm.remittanceDisplay.bankName, false],
        ["Account name", vm.remittanceDisplay.accountName, false],
        ["Account no.", vm.remittanceDisplay.accountNumber, true],
        [vm.safeRoutingLabel, vm.remittanceDisplay.routingCode, false],
      ];
      rows.forEach(([label, value, bold], i) => {
        drawText(page, height, fonts, label, MARGIN, by + 26 + i * 13, 8.5, { color: MUTED });
        drawText(page, height, fonts, safeText(fonts.regular, value), MARGIN + 80, by + 26 + i * 13, 8.5, { isBold: bold, color: INK });
      });
      by += 26 + rows.length * 13;
    }
    if (vm.paymentLink && vm.payment.kind !== "PAID") {
      const linkLines = wrapTextByWidth(fonts.regular, vm.paymentLink, 260, 8);
      drawText(page, height, fonts, "Pay online", MARGIN, by + 8, 8.5, { isBold: true, color: INK });
      linkLines.forEach((line, i) => drawText(page, height, fonts, line, MARGIN, by + 20 + i * 10, 8, { color: tokens.accent }));
      addLinkAnnotation(pdfDoc, page, MARGIN, height - (by + 20 + linkLines.length * 10), 260, linkLines.length * 10 + 2, vm.paymentLink);
      by += 24 + linkLines.length * 10;
    }

    drawText(page, height, fonts, safeText(fonts.bold, `For ${vm.profile.companyName}`), right, y + 9, 9, { isBold: true, align: "right", color: INK });
    if (vm.profile.signatureUrl) await loadLogo(pdfDoc, page, height, vm.profile.signatureUrl, right, y + 16, 140, 36, "right");
    page.drawLine({ start: { x: right - 150, y: height - (y + 62) }, end: { x: right, y: height - (y + 62) }, thickness: 0.8, color: INK });
    drawText(page, height, fonts, "Authorised signatory", right, y + 74, 8, { align: "right", color: MUTED });

    const declarationY = Math.max(by, y + 86) + 6;
    if (vm.isIndiaWorkspace && (vm.gst.kind === "INTRA" || vm.gst.kind === "INTER")) {
      const text = "Declaration: We declare that this invoice shows the actual price of the services described and that all particulars are true and correct.";
      wrapTextByWidth(fonts.regular, text, contentWidth, 7).forEach((line, i) => drawText(page, height, fonts, line, MARGIN, declarationY + 8 + i * 9, 7, { color: MUTED }));
    }
  },
};

registerInvoiceTemplate(taxInvoiceTemplate);

export default taxInvoiceTemplate;
