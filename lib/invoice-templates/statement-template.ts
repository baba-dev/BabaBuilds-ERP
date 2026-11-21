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

const MARGIN = 40;
const TOTALS_WIDTH = 225;
const STAMP_SPACE = 96;
const ROW_H = 18;

const INK = rgb(0.13, 0.13, 0.15);
const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.86, 0.87, 0.89);

const EMPTY_STATEMENT = { previousBalance: 0, openItems: [], hiddenOpenItems: 0, payments: [], credits: [], sinceDate: null };

const statementTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_6",
    title: "Statement",
    paperSize: "A4",
    supportsSignature: false,
    supportsPaymentLink: true,
    supportsMultiPage: true,
    fonts: "unicode",
    defaultAccent: "#7C3AED",
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    const tokens = buildAccentTokens(resolveAccent({ ...vm.accentCandidates, designDefault: statementTemplate.meta.defaultAccent ?? "#7C3AED" }).hex);
    let page: PDFPage = paginator.currentPage();
    const { width, height } = page.getSize();
    const contentWidth = width - MARGIN * 2;
    const right = width - MARGIN;
    const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
    const date = (d: Date) => d.toLocaleDateString(vm.userLocale, { day: "numeric", month: "short", year: "numeric" });
    const st = vm.statement ?? { ...EMPTY_STATEMENT, amountDueNow: 0 };
    const paid = vm.payment.kind === "PAID";
    const amountDueNow = vm.statement ? vm.statement.amountDueNow : paid ? 0 : vm.payment.balanceDue;
    const paymentsTotal = st.payments.reduce((sum, p) => sum + p.amount, 0);
    const creditsTotal = st.credits.reduce((sum, c) => sum + c.amount, 0);

    installPageChrome({ paginator, fonts, vm, margin: MARGIN });

    // Keeps the next block on the current page, or moves to a fresh one below the continuation header.
    let y = 0;
    const ensure = (blockHeight: number) => {
      const next = paginator.ensureRoom(y + blockHeight, 56);
      if (next !== page) {
        page = next;
        y = CONTINUATION_TOP;
      }
    };
    const sectionTitle = (text: string) => {
      ensure(40);
      drawText(page, height, fonts, safeText(fonts.bold, text), MARGIN, y + 9, 9, { isBold: true, color: tokens.accent });
      y += 20;
    };
    const rule = () => page.drawLine({ start: { x: MARGIN, y: height - y }, end: { x: right, y: height - y }, thickness: 0.5, color: RULE });

    // Header.
    const hasLogo = vm.profile.logoUrl ? await loadLogo(pdfDoc, page, height, vm.profile.logoUrl, MARGIN, 34, 130, 44) : false;
    if (!hasLogo) {
      wrapTextByWidth(fonts.bold, safeText(fonts.bold, vm.profile.companyName), 280, 16).slice(0, 2).forEach((line, i) =>
        drawText(page, height, fonts, line, MARGIN, 52 + i * 19, 16, { isBold: true, color: tokens.accentDark }),
      );
    }
    drawText(page, height, fonts, "STATEMENT", right, 44, 8, { isBold: true, align: "right", color: tokens.accent });
    drawText(page, height, fonts, safeText(fonts.bold, vm.invoiceNumber), right, 62, 16, { isBold: true, align: "right", color: INK });
    drawText(page, height, fonts, `Issued ${date(vm.date)}`, right, 77, 8.5, { align: "right", color: MUTED });

    // Hero: what to pay now.
    const heroY = 100;
    drawRect(page, height, MARGIN, heroY, contentWidth, 92, tokens.accent);
    drawText(page, height, fonts, "AMOUNT DUE NOW", MARGIN + 22, heroY + 28, 8.5, { isBold: true, color: tokens.onAccent });
    const amountText = safeText(fonts.bold, money(amountDueNow));
    const amountSize = Math.min(30, (contentWidth * 0.55) / Math.max(1, fonts.bold.widthOfTextAtSize(amountText, 1)));
    drawText(page, height, fonts, amountText, MARGIN + 22, heroY + 36 + amountSize, amountSize, { isBold: true, color: tokens.onAccent });
    const dueLine = paid ? (vm.payment.paidOn ? `Invoice paid ${date(vm.payment.paidOn)}` : "Invoice paid") : amountDueNow <= 0 ? "Nothing due" : `Due ${date(vm.dueDate)}`;
    drawText(page, height, fonts, dueLine, right - 22, heroY + 40, 12, { isBold: true, align: "right", color: tokens.onAccent });
    drawText(page, height, fonts, safeText(fonts.regular, vm.billingMonth ? `For ${vm.billingMonth}` : ""), right - 22, heroY + 58, 8.5, { align: "right", color: tokens.onAccent });

    // Summary strip.
    const stripY = heroY + 92 + 10;
    drawRect(page, height, MARGIN, stripY, contentWidth, 54, tokens.accentTint);
    const cells: Array<[string, string]> = [
      ["Previous balance", money(st.previousBalance)],
      ["Payments received", money(paymentsTotal)],
      ["Credits applied", money(creditsTotal)],
      ["This invoice", money(vm.totals.total)],
    ];
    const cellWidth = contentWidth / cells.length;
    cells.forEach(([label, value], i) => {
      const cx = MARGIN + i * cellWidth + 14;
      drawText(page, height, fonts, label.toUpperCase(), cx, stripY + 19, 6.5, { isBold: true, color: MUTED });
      drawText(page, height, fonts, safeText(fonts.bold, value), cx, stripY + 38, 11, { isBold: true, color: INK });
    });

    // Parties.
    const colWidth = (contentWidth - 24) / 2;
    y = stripY + 54 + 20;
    const supplierBottom = drawPartyBlock({ page, fonts, tokens, title: "From", name: vm.profile.companyName, lines: [...vm.profileAddress.lines, [vm.profile.email, vm.profile.phone].filter(Boolean).join("  ·  ")].filter(Boolean), taxId: vm.profile.gstin ? { label: vm.safeTaxIdLabel, value: vm.profile.gstin } : undefined, x: MARGIN, yFromTop: y, width: colWidth });
    const clientBottom = drawPartyBlock({ page, fonts, tokens, title: "Statement for", name: vm.clientRaw.name, lines: vm.clientAddress.lines, taxId: vm.clientRaw.taxId ? { label: vm.safeTaxIdLabel, value: vm.clientRaw.taxId } : undefined, x: MARGIN + colWidth + 24, yFromTop: y, width: colWidth });
    y = Math.max(supplierBottom, clientBottom) + 18;

    // Open items.
    if (st.openItems.length > 0) {
      sectionTitle("Open items");
      ensure(ROW_H * 2);
      drawRect(page, height, MARGIN, y, contentWidth, ROW_H, tokens.accentTintStrong);
      const colX = [MARGIN + 8, MARGIN + 200, MARGIN + 290];
      ["INVOICE", "DATE", "DUE"].forEach((label, i) => drawText(page, height, fonts, label, colX[i], y + 12, 7, { isBold: true, color: tokens.accentDark }));
      drawText(page, height, fonts, "BALANCE", right - 8, y + 12, 7, { isBold: true, align: "right", color: tokens.accentDark });
      y += ROW_H;
      for (const item of st.openItems) {
        ensure(ROW_H);
        drawText(page, height, fonts, safeText(fonts.regular, item.number), colX[0], y + 12, 9, { color: INK });
        drawText(page, height, fonts, date(item.date), colX[1], y + 12, 9, { color: MUTED });
        drawText(page, height, fonts, item.dueDate ? date(item.dueDate) : "-", colX[2], y + 12, 9, { color: MUTED });
        drawText(page, height, fonts, safeText(fonts.bold, money(item.balance)), right - 8, y + 12, 9, { isBold: true, align: "right", color: INK });
        y += ROW_H;
        rule();
      }
      if (st.hiddenOpenItems > 0) {
        ensure(ROW_H);
        drawText(page, height, fonts, `And ${st.hiddenOpenItems} more open invoice${st.hiddenOpenItems === 1 ? "" : "s"} (included in the previous balance)`, MARGIN + 8, y + 12, 8.5, { isItalic: true, color: MUTED });
        y += ROW_H;
      }
      y += 12;
    } else {
      drawText(page, height, fonts, "No previous balance", MARGIN, y + 9, 9, { isBold: true, color: MUTED });
      y += 26;
    }

    // Payments and credits since the previous invoice.
    const movements = [
      ...st.payments.map((p) => ({ date: p.date, text: ["Payment", p.method, p.reference].filter(Boolean).join("  ·  "), amount: p.amount })),
      ...st.credits.map((c) => ({ date: c.date, text: `Credit note ${c.number}`, amount: c.amount })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
    if (movements.length > 0) {
      sectionTitle(st.sinceDate ? `Payments and credits since ${date(st.sinceDate)}` : "Payments and credits");
      for (const m of movements) {
        ensure(ROW_H);
        drawText(page, height, fonts, date(m.date), MARGIN + 8, y + 12, 9, { color: MUTED });
        drawText(page, height, fonts, safeText(fonts.regular, m.text), MARGIN + 100, y + 12, 9, { color: INK });
        drawText(page, height, fonts, safeText(fonts.bold, `-${money(m.amount)}`), right - 8, y + 12, 9, { isBold: true, align: "right", color: INK });
        y += ROW_H;
        rule();
      }
      y += 12;
    }

    // This invoice.
    sectionTitle("This invoice");
    const includeTax = !vm.flags.isTaxExempt;
    const fixed = 44 + 76 + (includeTax ? 50 : 0) + 90;
    const columns: TableColumn[] = [
      { key: "description", header: "Description", width: contentWidth - fixed, align: "left" },
      { key: "qty", header: "Qty", width: 44, align: "right" },
      { key: "rate", header: "Rate", width: 76, align: "right" },
      ...(includeTax ? [{ key: "taxRate", header: "Tax", width: 50, align: "right" } as const] : []),
      { key: "amount", header: "Amount", width: 90, align: "right" },
    ];
    const totalsHeight = measureTotalsBlock(vm, { fonts, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: false });
    const paidExtra = vm.payment.kind === "NONE" ? 0 : STAMP_SPACE;
    const showDueBar = st.previousBalance > 0 && !paid;
    const table = drawLineTable({
      paginator, fonts, tokens, lines: vm.lines, columns, x: MARGIN, startYFromTop: y, locale: vm.userLocale,
      emptyLabel: "No items on this invoice", continuationTopY: CONTINUATION_TOP,
      reserveBottom: totalsHeight + (showDueBar ? 40 : 0) + 24 + paidExtra + 60,
    });
    page = table.page;
    y = table.yFromTop + 18;

    // Bank details (left) beside the totals and the amount due now (right).
    let leftBottom = y;
    if (vm.flags.hasBankDetails && !paid) {
      drawText(page, height, fonts, "BANK TRANSFER", MARGIN, y + 9, 8, { isBold: true, color: tokens.accent });
      const rows: Array<[string, string, boolean]> = [
        ["Account name", vm.remittanceDisplay.accountName, false],
        ["Account no.", vm.remittanceDisplay.accountNumber, true],
        [vm.safeRoutingLabel, vm.remittanceDisplay.routingCode, false],
      ];
      rows.forEach(([label, value, bold], i) => {
        drawText(page, height, fonts, label, MARGIN, y + 27 + i * 13, 8.5, { color: MUTED });
        drawText(page, height, fonts, safeText(fonts.regular, value), MARGIN + 78, y + 27 + i * 13, 8.5, { isBold: bold, color: INK });
      });
      leftBottom = y + 27 + rows.length * 13;
      if (vm.paymentLink) {
        const linkLines = wrapTextByWidth(fonts.regular, vm.paymentLink, 240, 8);
        drawText(page, height, fonts, "Pay online", MARGIN, leftBottom + 8, 8.5, { isBold: true, color: INK });
        linkLines.forEach((line, i) => drawText(page, height, fonts, line, MARGIN, leftBottom + 20 + i * 10, 8, { color: tokens.accent }));
        addLinkAnnotation(pdfDoc, page, MARGIN, height - (leftBottom + 20 + linkLines.length * 10), 240, linkLines.length * 10 + 2, vm.paymentLink);
        leftBottom += 24 + linkLines.length * 10;
      }
    }
    const totalsX = right - TOTALS_WIDTH;
    let totalsBottom = drawTotalsBlock({ page, fonts, tokens, vm, x: totalsX, yFromTop: y, width: TOTALS_WIDTH, showGstSplit: true, showAmountInWords: false });
    if (showDueBar) {
      totalsBottom += 8;
      drawRect(page, height, totalsX, totalsBottom, TOTALS_WIDTH, 30, tokens.accentDark);
      drawText(page, height, fonts, "Amount due now", totalsX + 10, totalsBottom + 19.5, 10.5, { isBold: true, color: rgb(1, 1, 1) });
      drawText(page, height, fonts, safeText(fonts.bold, money(amountDueNow)), totalsX + TOTALS_WIDTH - 10, totalsBottom + 19.5, 12, { isBold: true, align: "right", color: rgb(1, 1, 1) });
      totalsBottom += 30;
    }
    if (vm.payment.kind !== "NONE") drawPaymentStamp({ page, fonts, vm, anchorX: totalsX + TOTALS_WIDTH / 2, anchorYFromTop: totalsBottom + 48 });
  },
};

registerInvoiceTemplate(statementTemplate);

export default statementTemplate;
