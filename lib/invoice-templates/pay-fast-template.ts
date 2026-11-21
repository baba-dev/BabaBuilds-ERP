import { rgb } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import type { InvoiceTemplate } from "@/lib/invoice-templates/types";
import { registerInvoiceTemplate } from "@/lib/invoice-templates/registry";
import { drawRect, drawText, loadLogo, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";
import { buildAccentTokens, resolveAccent } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { drawLineTable, type TableColumn } from "@/lib/invoice-templates/shared/table";
import { drawTotalsBlock, measureTotalsBlock } from "@/lib/invoice-templates/shared/totals";
import { drawPartyBlock } from "@/lib/invoice-templates/shared/party-blocks";
import { drawPaymentStamp } from "@/lib/invoice-templates/shared/stamp";
import { CONTINUATION_TOP, installPageChrome } from "@/lib/invoice-templates/shared/page-chrome";
import { SCAN_PANEL_HEIGHT, drawMoreWaysToPay, drawScanToPay, scanPanelMode } from "@/lib/invoice-templates/shared/qr-panel";

const MARGIN = 40;
const PANEL_WIDTH = 235;
const PANEL_GAP = 14;
const TOTALS_WIDTH = 225;
const STAMP_SPACE = 96;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);

const payFastTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_4",
    title: "Pay-Fast",
    paperSize: "A4",
    supportsSignature: false,
    supportsPaymentLink: true,
    supportsMultiPage: true,
    fonts: "unicode",
    defaultAccent: "#0F766E",
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    const tokens = buildAccentTokens(resolveAccent({ ...vm.accentCandidates, designDefault: payFastTemplate.meta.defaultAccent ?? "#0F766E" }).hex);
    let page: PDFPage = paginator.currentPage();
    const { width, height } = page.getSize();
    const contentWidth = width - MARGIN * 2;
    const right = width - MARGIN;
    const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
    const date = (d: Date) => d.toLocaleDateString(vm.userLocale, { day: "numeric", month: "short", year: "numeric" });

    installPageChrome({ paginator, fonts, vm, margin: MARGIN });

    // Header.
    const hasLogo = vm.profile.logoUrl ? await loadLogo(pdfDoc, page, height, vm.profile.logoUrl, MARGIN, 34, 130, 44) : false;
    if (!hasLogo) {
      wrapTextByWidth(fonts.bold, safeText(fonts.bold, vm.profile.companyName), 280, 16).slice(0, 2).forEach((line, i) =>
        drawText(page, height, fonts, line, MARGIN, 52 + i * 19, 16, { isBold: true, color: tokens.accentDark }),
      );
    }
    drawText(page, height, fonts, vm.headerTitle === "TAX INVOICE" ? "INVOICE" : safeText(fonts.bold, vm.headerTitle), right, 44, 8, { isBold: true, align: "right", color: tokens.accent });
    drawText(page, height, fonts, safeText(fonts.bold, vm.invoiceNumber), right, 62, 16, { isBold: true, align: "right", color: INK });
    drawText(page, height, fonts, `Issued ${date(vm.date)}`, right, 77, 8.5, { align: "right", color: MUTED });

    // Hero: amount due beside the Scan to pay panel.
    const heroY = 100;
    const heroWidth = contentWidth - PANEL_WIDTH - PANEL_GAP;
    const paid = vm.payment.kind === "PAID";
    const partial = vm.payment.kind === "PARTIAL";
    const heroLabel = paid ? "PAID IN FULL" : partial ? "BALANCE DUE" : "AMOUNT DUE";
    const heroAmount = money(partial ? vm.payment.balanceDue : vm.netPayable);
    drawRect(page, height, MARGIN, heroY, heroWidth, SCAN_PANEL_HEIGHT, tokens.accent);
    drawText(page, height, fonts, heroLabel, MARGIN + 20, heroY + 34, 8.5, { isBold: true, color: tokens.onAccent });
    const amountText = safeText(fonts.bold, heroAmount);
    const amountSize = Math.min(32, ((heroWidth - 40) / Math.max(1, fonts.bold.widthOfTextAtSize(amountText, 1))));
    drawText(page, height, fonts, amountText, MARGIN + 20, heroY + 34 + 8 + amountSize, amountSize, { isBold: true, color: tokens.onAccent });
    page.drawLine({ start: { x: MARGIN + 20, y: height - (heroY + 108) }, end: { x: MARGIN + heroWidth - 20, y: height - (heroY + 108) }, thickness: 0.6, color: tokens.onAccent, opacity: 0.45 });
    const nothingDue = !paid && (partial ? vm.payment.balanceDue : vm.netPayable) <= 0;
    const dueLine = paid && vm.payment.paidOn ? `Paid ${date(vm.payment.paidOn)}` : paid ? "Thank you for your payment" : nothingDue ? "No payment required" : `Due ${date(vm.dueDate)}`;
    drawText(page, height, fonts, dueLine, MARGIN + 20, heroY + 128, 12, { isBold: true, color: tokens.onAccent });
    if (vm.billingMonth) drawText(page, height, fonts, safeText(fonts.regular, `For ${vm.billingMonth}`), MARGIN + 20, heroY + 144, 8.5, { color: tokens.onAccent });
    await drawScanToPay({ page, pdfDoc, fonts, tokens, vm, x: right - PANEL_WIDTH, yFromTop: heroY, width: PANEL_WIDTH });

    // Parties.
    const colWidth = (contentWidth - 24) / 2;
    let y = heroY + SCAN_PANEL_HEIGHT + 22;
    const moreBottom = await drawMoreWaysToPay({ page, pdfDoc, fonts, tokens, vm, x: MARGIN, yFromTop: y });
    if (moreBottom > y) y = moreBottom + 14;
    const supplierBottom = drawPartyBlock({ page, fonts, tokens, title: "From", name: vm.profile.companyName, lines: [...vm.profileAddress.lines, [vm.profile.email, vm.profile.phone].filter(Boolean).join("  ·  ")].filter(Boolean), taxId: vm.profile.gstin ? { label: vm.safeTaxIdLabel, value: vm.profile.gstin } : undefined, x: MARGIN, yFromTop: y, width: colWidth });
    const clientBottom = drawPartyBlock({ page, fonts, tokens, title: "Billed to", name: vm.clientRaw.name, lines: vm.clientAddress.lines, taxId: vm.clientRaw.taxId ? { label: vm.safeTaxIdLabel, value: vm.clientRaw.taxId } : undefined, x: MARGIN + colWidth + 24, yFromTop: y, width: colWidth });
    y = Math.max(supplierBottom, clientBottom) + 18;

    // Line items.
    const includeTax = !vm.flags.isTaxExempt;
    const fixed = 44 + 76 + (includeTax ? 50 : 0) + 90;
    const columns: TableColumn[] = [
      { key: "description", header: "Description", width: contentWidth - fixed, align: "left" },
      { key: "qty", header: "Qty", width: 44, align: "right" },
      { key: "rate", header: "Rate", width: 76, align: "right" },
      ...(includeTax ? [{ key: "taxRate", header: "Tax", width: 50, align: "right" } as const] : []),
      { key: "amount", header: "Amount", width: 90, align: "right" },
    ];
    const totalsOpts = { fonts, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: false };
    const totalsHeight = measureTotalsBlock(vm, totalsOpts);
    const paidExtra = vm.payment.kind === "NONE" ? 0 : STAMP_SPACE;
    const termsHeight = 40;
    const table = drawLineTable({
      paginator, fonts, tokens, lines: vm.lines, columns, x: MARGIN, startYFromTop: y, locale: vm.userLocale,
      emptyLabel: "No items on this invoice", continuationTopY: CONTINUATION_TOP,
      reserveBottom: totalsHeight + 24 + paidExtra + termsHeight,
    });
    page = table.page;
    y = table.yFromTop + 18;

    // Bank transfer (left, easy to copy) beside the totals (right).
    const totalsX = right - TOTALS_WIDTH;
    if (vm.flags.hasBankDetails && scanPanelMode(vm) === "QR") {
      drawText(page, height, fonts, "BANK TRANSFER", MARGIN, y + 9, 8, { isBold: true, color: tokens.accent });
      const rows: Array<[string, string]> = [
        ["Account name", vm.remittanceDisplay.accountName],
        ["Account number", vm.remittanceDisplay.accountNumber],
        [vm.safeRoutingLabel, vm.remittanceDisplay.routingCode],
      ];
      rows.forEach(([label, value], i) => {
        drawText(page, height, fonts, label.toUpperCase(), MARGIN, y + 28 + i * 30, 6.5, { isBold: true, color: MUTED });
        drawText(page, height, fonts, safeText(fonts.bold, value), MARGIN, y + 41 + i * 30, 10.5, { isBold: true, color: INK });
      });
    }
    const totalsBottom = drawTotalsBlock({ page, fonts, tokens, vm, x: totalsX, yFromTop: y, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: false });
    if (vm.payment.kind !== "NONE") drawPaymentStamp({ page, fonts, vm, anchorX: totalsX + TOTALS_WIDTH / 2, anchorYFromTop: totalsBottom + 48 });
    y = Math.max(totalsBottom + paidExtra, y + 112) + 16;

    // Terms.
    const days = Math.max(0, Math.round((vm.dueDate.getTime() - vm.date.getTime()) / 86_400_000));
    const terms = paid ? "Thank you for your business." : `Payment terms: net ${days} days  ·  due ${date(vm.dueDate)}. Please quote ${vm.invoiceNumber} with your payment.`;
    wrapTextByWidth(fonts.regular, safeText(fonts.regular, terms), contentWidth, 8.5).forEach((line, i) => drawText(page, height, fonts, line, MARGIN, y + 8 + i * 11, 8.5, { color: MUTED }));
  },
};

registerInvoiceTemplate(payFastTemplate);

export default payFastTemplate;
