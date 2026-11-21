import { rgb } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import type { InvoiceTemplate } from "@/lib/invoice-templates/types";
import { registerInvoiceTemplate } from "@/lib/invoice-templates/registry";
import { addLinkAnnotation, drawRect, drawText, loadLogo, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";
import { buildAccentTokens, resolveAccent } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { drawLineTable, type TableColumn } from "@/lib/invoice-templates/shared/table";
import { drawTotalsBlock, measureTotalsBlock } from "@/lib/invoice-templates/shared/totals";
import { drawPartyBlock } from "@/lib/invoice-templates/shared/party-blocks";
import { drawPaymentStamp } from "@/lib/invoice-templates/shared/stamp";
import { CONTINUATION_TOP, installPageChrome } from "@/lib/invoice-templates/shared/page-chrome";

const MARGIN = 48;
const TOTALS_WIDTH = 220;
const STAMP_SPACE = 96;

const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.45, 0.45, 0.5);

const minimalTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_7",
    title: "Minimal Pro",
    paperSize: "A4",
    supportsSignature: false,
    supportsPaymentLink: true,
    supportsMultiPage: true,
    fonts: "unicode",
    defaultAccent: "#111827",
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    const tokens = buildAccentTokens(resolveAccent({ ...vm.accentCandidates, designDefault: minimalTemplate.meta.defaultAccent ?? "#111827" }).hex);
    let page: PDFPage = paginator.currentPage();
    const { width, height } = page.getSize();
    const contentWidth = width - MARGIN * 2;
    const right = width - MARGIN;
    const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
    const date = (d: Date) => d.toLocaleDateString(vm.userLocale, { day: "numeric", month: "short", year: "numeric" });

    installPageChrome({ paginator, fonts, vm, margin: MARGIN });

    // Header: a quiet title and number on the left, the brand on the right.
    drawText(page, height, fonts, "INVOICE", MARGIN, 56, 8, { isBold: true, color: MUTED });
    drawText(page, height, fonts, safeText(fonts.bold, vm.invoiceNumber), MARGIN, 80, 22, { isBold: true, color: INK });
    drawRect(page, height, MARGIN, 92, 34, 2.5, tokens.accent);
    const hasLogo = vm.profile.logoUrl ? await loadLogo(pdfDoc, page, height, vm.profile.logoUrl, right, 42, 130, 44, "right") : false;
    if (!hasLogo) {
      wrapTextByWidth(fonts.bold, safeText(fonts.bold, vm.profile.companyName), 230, 11).slice(0, 2).forEach((line, i) =>
        drawText(page, height, fonts, line, right, 58 + i * 14, 11, { isBold: true, align: "right", color: INK }),
      );
    }

    // Dates and the amount due, with plenty of air around them.
    const metaY = 128;
    const metas: Array<[string, string]> = [["ISSUED", date(vm.date)], ["DUE", date(vm.dueDate)], ["FOR", vm.billingMonth || "-"]];
    metas.forEach(([label, value], i) => {
      const x = MARGIN + i * 120;
      drawText(page, height, fonts, label, x, metaY, 7, { isBold: true, color: MUTED });
      drawText(page, height, fonts, safeText(fonts.regular, value), x, metaY + 14, 10, { color: INK });
    });

    const paid = vm.payment.kind === "PAID";
    const partial = vm.payment.kind === "PARTIAL";
    const dueAmount = partial ? vm.payment.balanceDue : vm.netPayable;
    drawText(page, height, fonts, paid ? "PAID" : partial ? "BALANCE DUE" : "AMOUNT DUE", right, metaY, 7, { isBold: true, align: "right", color: MUTED });
    const amountText = safeText(fonts.bold, money(dueAmount));
    const amountSize = Math.min(26, (contentWidth * 0.5) / Math.max(1, fonts.bold.widthOfTextAtSize(amountText, 1)));
    drawText(page, height, fonts, amountText, right, metaY + 6 + amountSize, amountSize, { isBold: true, align: "right", color: tokens.accent });

    // Parties.
    const colWidth = (contentWidth - 30) / 2;
    let y = 196;
    const supplierBottom = drawPartyBlock({ page, fonts, tokens: { ...tokens, accent: rgb(0.45, 0.45, 0.5) }, title: "From", name: vm.profile.companyName, lines: [...vm.profileAddress.lines, [vm.profile.email, vm.profile.phone].filter(Boolean).join("  ·  ")].filter(Boolean), taxId: vm.profile.gstin ? { label: vm.safeTaxIdLabel, value: vm.profile.gstin } : undefined, x: MARGIN, yFromTop: y, width: colWidth });
    const clientBottom = drawPartyBlock({ page, fonts, tokens: { ...tokens, accent: rgb(0.45, 0.45, 0.5) }, title: "To", name: vm.clientRaw.name, lines: vm.clientAddress.lines, taxId: vm.clientRaw.taxId ? { label: vm.safeTaxIdLabel, value: vm.clientRaw.taxId } : undefined, x: MARGIN + colWidth + 30, yFromTop: y, width: colWidth });
    y = Math.max(supplierBottom, clientBottom) + 26;

    // Line items, rules only.
    const includeTax = !vm.flags.isTaxExempt;
    const fixed = 44 + 76 + (includeTax ? 46 : 0) + 90;
    const columns: TableColumn[] = [
      { key: "description", header: "Description", width: contentWidth - fixed, align: "left" },
      { key: "qty", header: "Qty", width: 44, align: "right" },
      { key: "rate", header: "Rate", width: 76, align: "right" },
      ...(includeTax ? [{ key: "taxRate", header: "Tax", width: 46, align: "right" } as const] : []),
      { key: "amount", header: "Amount", width: 90, align: "right" },
    ];
    const totalsHeight = measureTotalsBlock(vm, { fonts, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: false });
    const paidExtra = vm.payment.kind === "NONE" ? 0 : STAMP_SPACE;
    const table = drawLineTable({
      paginator, fonts, tokens, lines: vm.lines, columns, x: MARGIN, startYFromTop: y, locale: vm.userLocale, style: "minimal",
      emptyLabel: "No items on this invoice", continuationTopY: CONTINUATION_TOP,
      reserveBottom: totalsHeight + 24 + paidExtra + 70,
    });
    page = table.page;
    y = table.yFromTop + 22;

    // Totals on the right, payment details on the left, both quiet.
    const totalsX = right - TOTALS_WIDTH;
    const totalsBottom = drawTotalsBlock({ page, fonts, tokens, vm, x: totalsX, yFromTop: y, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: false, style: "plain" });
    let leftBottom = y;
    if (!paid && vm.flags.hasBankDetails) {
      drawText(page, height, fonts, "PAY BY BANK TRANSFER", MARGIN, y + 9, 7, { isBold: true, color: MUTED });
      const rows: Array<[string, string, boolean]> = [
        ["Account name", vm.remittanceDisplay.accountName, false],
        ["Account no.", vm.remittanceDisplay.accountNumber, true],
        [vm.safeRoutingLabel, vm.remittanceDisplay.routingCode, false],
      ];
      rows.forEach(([label, value, bold], i) => {
        drawText(page, height, fonts, label, MARGIN, y + 28 + i * 14, 8.5, { color: MUTED });
        drawText(page, height, fonts, safeText(fonts.regular, value), MARGIN + 78, y + 28 + i * 14, 8.5, { isBold: bold, color: INK });
      });
      leftBottom = y + 28 + rows.length * 14;
    }
    if (!paid && vm.paymentLink) {
      const linkLines = wrapTextByWidth(fonts.regular, vm.paymentLink, 230, 8);
      drawText(page, height, fonts, "Pay online", MARGIN, leftBottom + 10, 8.5, { isBold: true, color: INK });
      linkLines.forEach((line, i) => drawText(page, height, fonts, line, MARGIN, leftBottom + 22 + i * 10, 8, { color: tokens.accent }));
      addLinkAnnotation(pdfDoc, page, MARGIN, height - (leftBottom + 22 + linkLines.length * 10), 230, linkLines.length * 10 + 2, vm.paymentLink);
    }
    if (vm.payment.kind !== "NONE") drawPaymentStamp({ page, fonts, vm, anchorX: totalsX + TOTALS_WIDTH / 2, anchorYFromTop: totalsBottom + 48 });
  },
};

registerInvoiceTemplate(minimalTemplate);

export default minimalTemplate;
