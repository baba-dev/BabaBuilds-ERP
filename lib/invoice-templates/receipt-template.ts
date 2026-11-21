import { rgb } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import type { InvoiceTemplate } from "@/lib/invoice-templates/types";
import { registerInvoiceTemplate } from "@/lib/invoice-templates/registry";
import { addLinkAnnotation, drawText, wrapTextByWidth } from "@/lib/invoice-templates/shared/pdf-primitives";
import { buildAccentTokens, resolveAccent } from "@/lib/invoice-templates/shared/tokens";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { formatMoney } from "@/lib/invoice-templates/shared/format";
import { drawTotalsBlock, measureTotalsBlock } from "@/lib/invoice-templates/shared/totals";
import { drawPreparedQr, prepareQr, type PreparedQr } from "@/lib/invoice-templates/shared/qr-panel";

const MARGIN = 12;
const BOTTOM_MARGIN = 30;
const TOP = 18;
const QR_SIZE = 64;

const INK = rgb(0.05, 0.05, 0.05);
const MUTED = rgb(0.35, 0.35, 0.38);

const receiptTemplate: InvoiceTemplate = {
  meta: {
    id: "DESIGN_8",
    title: "Receipt",
    paperSize: "THERMAL_80MM",
    supportsSignature: false,
    supportsPaymentLink: true,
    supportsMultiPage: true,
    fonts: "unicode",
    defaultAccent: "#111111",
  },
  async draw({ pdfDoc, vm, fonts, paginator }) {
    const tokens = buildAccentTokens(resolveAccent({ ...vm.accentCandidates, designDefault: receiptTemplate.meta.defaultAccent ?? "#111111" }).hex);
    let page: PDFPage = paginator.currentPage();
    // Drawing coordinates are measured against the full paper length; the last page is cropped to its content afterwards.
    const { width, height: paperHeight } = page.getSize();
    const contentWidth = width - MARGIN * 2;
    const centerX = width / 2;
    const money = (n: number) => formatMoney(n, vm.baseCurrency, vm.userLocale);
    const date = (d: Date) => d.toLocaleDateString(vm.userLocale, { day: "numeric", month: "short", year: "numeric" });
    let y = TOP;

    const ensure = (blockHeight: number) => {
      const next = paginator.ensureRoom(y + blockHeight, BOTTOM_MARGIN);
      if (next !== page) {
        page = next;
        y = TOP;
      }
    };
    const rule = () => {
      page.drawLine({ start: { x: MARGIN, y: paperHeight - y }, end: { x: width - MARGIN, y: paperHeight - y }, thickness: 0.6, color: MUTED, dashArray: [2, 2] });
      y += 8;
    };
    const centered = (text: string, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; lineHeight?: number } = {}) => {
      const font = opts.bold ? fonts.bold : fonts.regular;
      for (const line of wrapTextByWidth(font, safeText(font, text), contentWidth, size)) {
        ensure((opts.lineHeight ?? size * 1.3) + 2);
        drawText(page, paperHeight, fonts, line, centerX, y + size, size, { isBold: opts.bold, align: "center", color: opts.color ?? INK });
        y += opts.lineHeight ?? size * 1.3;
      }
    };
    const pair = (left: string, right: string, size: number, bold = false) => {
      ensure(size * 1.4);
      drawText(page, paperHeight, fonts, safeText(fonts.regular, left), MARGIN, y + size, size, { color: MUTED });
      drawText(page, paperHeight, fonts, safeText(bold ? fonts.bold : fonts.regular, right), width - MARGIN, y + size, size, { isBold: bold, align: "right", color: INK });
      y += size * 1.45;
    };

    // Business.
    centered(vm.profile.companyName, 11, { bold: true });
    for (const line of vm.profileAddress.lines) centered(line, 7.5, { color: MUTED });
    const ids = [vm.profile.gstin ? `${vm.safeTaxIdLabel}: ${vm.profile.gstin}` : null, vm.profile.panNumber ? `PAN: ${vm.profile.panNumber}` : null].filter(Boolean).join("  ·  ");
    if (ids) centered(ids, 7, { color: MUTED });
    y += 4;
    rule();

    // Document.
    centered(vm.headerTitle, 9, { bold: true });
    y += 2;
    pair("No.", vm.invoiceNumber, 8, true);
    pair("Date", date(vm.date), 8);
    if (vm.gst.placeOfSupplyName) pair("Place of supply", vm.gst.placeOfSupplyName, 8);
    y += 2;
    ensure(30);
    drawText(page, paperHeight, fonts, "BILLED TO", MARGIN, y + 7, 6.5, { isBold: true, color: MUTED });
    y += 10;
    for (const line of wrapTextByWidth(fonts.bold, safeText(fonts.bold, vm.clientRaw.name), contentWidth, 8.5)) {
      ensure(12);
      drawText(page, paperHeight, fonts, line, MARGIN, y + 8.5, 8.5, { isBold: true, color: INK });
      y += 11;
    }
    if (vm.clientRaw.taxId) {
      ensure(11);
      drawText(page, paperHeight, fonts, safeText(fonts.regular, `${vm.safeTaxIdLabel}: ${vm.clientRaw.taxId}`), MARGIN, y + 7.5, 7.5, { color: MUTED });
      y += 10;
    }
    y += 2;
    rule();

    // Items: a name line, then quantity × rate and the amount.
    if (vm.lines.length === 0) {
      centered("No items", 8.5, { color: MUTED });
    }
    for (const line of vm.lines) {
      const nameLines = wrapTextByWidth(fonts.regular, safeText(fonts.regular, line.description), contentWidth, 8.5);
      ensure(nameLines.length * 10.5 + 14);
      for (const text of nameLines) {
        drawText(page, paperHeight, fonts, text, MARGIN, y + 8.5, 8.5, { color: INK });
        y += 10.5;
      }
      drawText(page, paperHeight, fonts, safeText(fonts.regular, `${line.quantityFormatted} × ${line.unitPriceFormatted}`), MARGIN, y + 7.5, 7.5, { color: MUTED });
      drawText(page, paperHeight, fonts, safeText(fonts.bold, line.amountFormatted), width - MARGIN, y + 8.5, 8.5, { isBold: true, align: "right", color: INK });
      y += 13;
    }
    rule();

    // Totals (the shared block, plain style, narrowed to the paper).
    const totalsHeight = measureTotalsBlock(vm, { fonts, width: contentWidth, showGstSplit: true, showAmountInWords: false });
    ensure(totalsHeight + 10);
    y = drawTotalsBlock({ page, fonts, tokens, vm, x: MARGIN, yFromTop: y, width: contentWidth, showGstSplit: true, showAmountInWords: false, style: "plain" }) + 4;

    // Payment state, one compact line.
    if (vm.payment.kind === "PAID") {
      centered(vm.payment.paidOn ? `PAID  ·  ${date(vm.payment.paidOn)}` : "PAID", 10.5, { bold: true });
    } else if (vm.payment.kind === "PARTIAL") {
      centered("PARTIALLY PAID", 10.5, { bold: true });
      if (vm.payment.amountPaid > 0) centered(`Balance ${money(vm.payment.balanceDue)}`, 8.5, { color: MUTED });
    }
    y += 4;

    // Small QR at the end, only while there is something to pay: the first source that can be drawn
    // (payment link, then UPI, then an uploaded image).
    const due = vm.payment.kind === "PARTIAL" ? vm.payment.balanceDue : vm.netPayable;
    let prepared: PreparedQr | null = null;
    if (vm.payment.kind !== "PAID" && due > 0) {
      for (const source of vm.paymentQrs) {
        prepared = await prepareQr(pdfDoc, source);
        if (prepared) break;
      }
    }
    if (prepared) {
      const { source } = prepared;
      rule();
      const linkLines = source.kind === "PAYMENT_LINK" ? wrapTextByWidth(fonts.regular, source.url, contentWidth, 6).slice(0, 3) : [];
      ensure(QR_SIZE + 44 + linkLines.length * 7.5);
      drawPreparedQr(page, prepared, centerX - QR_SIZE / 2, y, QR_SIZE);
      y += QR_SIZE + 6;
      const caption = source.kind === "STATIC_IMAGE" ? `Enter ${money(due)}` : `Scan to pay ${money(due)}`;
      drawText(page, paperHeight, fonts, safeText(fonts.bold, caption), centerX, y + 8, 8.5, { isBold: true, align: "center", color: INK });
      y += 13;
      if (source.kind === "PAYMENT_LINK") {
        const linkTop = y;
        linkLines.forEach((text) => {
          drawText(page, paperHeight, fonts, text, centerX, y + 6, 6, { align: "center", color: MUTED });
          y += 7.5;
        });
        addLinkAnnotation(pdfDoc, page, MARGIN, paperHeight - (linkTop + linkLines.length * 7.5), contentWidth, linkLines.length * 7.5 + 2, source.url);
      } else {
        const detail = source.kind === "UPI" ? `UPI · ${source.vpa}` : `Scan, then type the amount · ref ${vm.invoiceNumber}`;
        for (const text of wrapTextByWidth(fonts.regular, safeText(fonts.regular, detail), contentWidth, 6.5)) {
          drawText(page, paperHeight, fonts, text, centerX, y + 6.5, 6.5, { align: "center", color: MUTED });
          y += 8;
        }
      }
      y += 6;
    }

    centered("Thank you!", 8.5, { bold: true });
    if (vm.showFreePlanFooter) centered("Prepared on erp.bababuilds.com", 6, { color: MUTED });
    y += 14;

    // Crop the last page to its content: keep the drawing coordinates, show only the top `visible` points.
    const visible = Math.min(paperHeight, Math.max(120, Math.ceil(y)));
    page.setMediaBox(0, paperHeight - visible, width, visible);
    page.setCropBox(0, paperHeight - visible, width, visible);
  },
};

registerInvoiceTemplate(receiptTemplate);

export default receiptTemplate;
