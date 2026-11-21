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
import { drawPaymentStamp } from "@/lib/invoice-templates/shared/stamp";
import { CONTINUATION_TOP, installPageChrome } from "@/lib/invoice-templates/shared/page-chrome";

const MARGIN = 40;
const TOTALS_WIDTH = 225;
const STAMP_SPACE = 96;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);

const itemisedTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_5",
    title: "Itemised Project",
    paperSize: "A4",
    supportsSignature: false,
    supportsPaymentLink: true,
    supportsMultiPage: true,
    fonts: "unicode",
    defaultAccent: "#4F46E5",
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    const tokens = buildAccentTokens(resolveAccent({ ...vm.accentCandidates, designDefault: itemisedTemplate.meta.defaultAccent ?? "#4F46E5" }).hex);
    let page: PDFPage = paginator.currentPage();
    const { width, height } = page.getSize();
    const contentWidth = width - MARGIN * 2;
    const right = width - MARGIN;
    const date = (d: Date) => d.toLocaleDateString(vm.userLocale, { day: "numeric", month: "short", year: "numeric" });

    installPageChrome({ paginator, fonts, vm, margin: MARGIN });

    // Header: big "Invoice" with an accent bar, brand on the right.
    drawRect(page, height, MARGIN, 38, 6, 38, tokens.accent);
    drawText(page, height, fonts, vm.headerTitle === "TAX INVOICE" ? "Invoice" : safeText(fonts.bold, vm.headerTitle), MARGIN + 16, 60, 24, { isBold: true, color: INK });
    drawText(page, height, fonts, safeText(fonts.bold, vm.invoiceNumber), MARGIN + 16, 76, 10, { isBold: true, color: tokens.accent });
    const hasLogo = vm.profile.logoUrl ? await loadLogo(pdfDoc, page, height, vm.profile.logoUrl, right, 34, 130, 44, "right") : false;
    if (!hasLogo) {
      wrapTextByWidth(fonts.bold, safeText(fonts.bold, vm.profile.companyName), 240, 13).slice(0, 2).forEach((line, i) =>
        drawText(page, height, fonts, line, right, 50 + i * 16, 13, { isBold: true, align: "right", color: tokens.accentDark }),
      );
    }

    // Project band.
    const bandY = 98;
    drawRect(page, height, MARGIN, bandY, contentWidth, 58, tokens.accentTint);
    drawText(page, height, fonts, "PROJECT / PERIOD", MARGIN + 14, bandY + 18, 6.5, { isBold: true, color: MUTED });
    wrapTextByWidth(fonts.bold, safeText(fonts.bold, vm.billingMonth || vm.invoiceNumber), 250, 13).slice(0, 2).forEach((line, i) =>
      drawText(page, height, fonts, line, MARGIN + 14, bandY + 35 + i * 15, 13, { isBold: true, color: INK }),
    );
    const metaCells: Array<[string, string]> = [["Invoice date", date(vm.date)], ["Due date", date(vm.dueDate)]];
    metaCells.forEach(([label, value], i) => {
      const cx = MARGIN + 300 + i * 110;
      drawText(page, height, fonts, label.toUpperCase(), cx, bandY + 18, 6.5, { isBold: true, color: MUTED });
      drawText(page, height, fonts, value, cx, bandY + 36, 10, { isBold: true, color: INK });
    });

    // Parties.
    const colWidth = (contentWidth - 24) / 2;
    let y = bandY + 58 + 20;
    const supplierBottom = drawPartyBlock({ page, fonts, tokens, title: "From", name: vm.profile.companyName, lines: [...vm.profileAddress.lines, [vm.profile.email, vm.profile.phone].filter(Boolean).join("  ·  ")].filter(Boolean), taxId: vm.profile.gstin ? { label: vm.safeTaxIdLabel, value: vm.profile.gstin } : undefined, x: MARGIN, yFromTop: y, width: colWidth });
    const clientBottom = drawPartyBlock({ page, fonts, tokens, title: "Billed to", name: vm.clientRaw.name, lines: vm.clientAddress.lines, taxId: vm.clientRaw.taxId ? { label: vm.safeTaxIdLabel, value: vm.clientRaw.taxId } : undefined, x: MARGIN + colWidth + 24, yFromTop: y, width: colWidth });
    y = Math.max(supplierBottom, clientBottom) + 18;

    // Line items, grouped into sections with subtotals.
    const includeTax = !vm.flags.isTaxExempt;
    const includeDiscount = vm.lines.some((l) => l.discountAmount > 0);
    const fixed = 44 + 76 + (includeDiscount ? 70 : 0) + (includeTax ? 44 : 0) + 86;
    const columns: TableColumn[] = [
      { key: "description", header: "Description", width: contentWidth - fixed, align: "left" },
      { key: "qty", header: "Qty", width: 44, align: "right" },
      { key: "rate", header: "Rate", width: 76, align: "right" },
      ...(includeDiscount ? [{ key: "discount", header: "Discount", width: 70, align: "right" } as const] : []),
      ...(includeTax ? [{ key: "taxRate", header: "Tax", width: 44, align: "right" } as const] : []),
      { key: "amount", header: "Amount", width: 86, align: "right" },
    ];
    const totalsOpts = { fonts, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: true };
    const totalsHeight = measureTotalsBlock(vm, totalsOpts);
    const paidExtra = vm.payment.kind === "NONE" ? 0 : STAMP_SPACE;
    const closingHeight = 70;
    const table = drawLineTable({
      paginator, fonts, tokens, lines: vm.lines, columns, x: MARGIN, startYFromTop: y, locale: vm.userLocale,
      emptyLabel: "No items on this invoice", continuationTopY: CONTINUATION_TOP, sectionSubtotals: true,
      reserveBottom: totalsHeight + 24 + paidExtra + closingHeight,
    });
    page = table.page;
    y = table.yFromTop + 18;

    // Payment details (left) beside the totals (right).
    let leftBottom = y;
    if (vm.payment.kind !== "PAID") {
      drawText(page, height, fonts, "PAYMENT DETAILS", MARGIN, y + 9, 8, { isBold: true, color: tokens.accent });
      let ly = y + 26;
      if (vm.flags.hasBankDetails) {
        const rows: Array<[string, string, boolean]> = [
          ["Bank", vm.remittanceDisplay.bankName, false],
          ["Account name", vm.remittanceDisplay.accountName, false],
          ["Account no.", vm.remittanceDisplay.accountNumber, true],
          [vm.safeRoutingLabel, vm.remittanceDisplay.routingCode, false],
        ];
        rows.forEach(([label, value, bold]) => {
          drawText(page, height, fonts, label, MARGIN, ly, 8.5, { color: MUTED });
          drawText(page, height, fonts, safeText(fonts.regular, value), MARGIN + 78, ly, 8.5, { isBold: bold, color: INK });
          ly += 13;
        });
      }
      if (vm.paymentLink) {
        const linkLines = wrapTextByWidth(fonts.regular, vm.paymentLink, 250, 8);
        drawText(page, height, fonts, "Pay online", MARGIN, ly + 6, 8.5, { isBold: true, color: INK });
        linkLines.forEach((line, i) => drawText(page, height, fonts, line, MARGIN, ly + 18 + i * 10, 8, { color: tokens.accent }));
        addLinkAnnotation(pdfDoc, page, MARGIN, height - (ly + 18 + linkLines.length * 10), 250, linkLines.length * 10 + 2, vm.paymentLink);
        ly += 22 + linkLines.length * 10;
      }
      leftBottom = ly;
    }
    const totalsX = right - TOTALS_WIDTH;
    const totalsBottom = drawTotalsBlock({ page, fonts, tokens, vm, x: totalsX, yFromTop: y, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: true });
    if (vm.payment.kind !== "NONE") drawPaymentStamp({ page, fonts, vm, anchorX: totalsX + TOTALS_WIDTH / 2, anchorYFromTop: totalsBottom + 48 });
    y = Math.max(totalsBottom + paidExtra, leftBottom) + 14;

    const days = Math.max(0, Math.round((vm.dueDate.getTime() - vm.date.getTime()) / 86_400_000));
    const terms = vm.payment.kind === "PAID" ? "Thank you for your business." : `Payment terms: net ${days} days  ·  due ${date(vm.dueDate)}.`;
    drawText(page, height, fonts, terms, MARGIN, y + 8, 8.5, { color: MUTED });
  },
};

registerInvoiceTemplate(itemisedTemplate);

export default itemisedTemplate;
