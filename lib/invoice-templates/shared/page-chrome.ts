import { rgb } from "pdf-lib";
import type { InvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import type { Paginator, PdfFonts } from "@/lib/invoice-templates/types";
import { drawText } from "@/lib/invoice-templates/shared/pdf-primitives";
import { safeText } from "@/lib/invoice-templates/shared/fonts";
import { drawPaymentWatermark } from "@/lib/invoice-templates/shared/stamp";

const MUTED = rgb(0.42, 0.42, 0.46);
const RULE = rgb(0.86, 0.87, 0.89);
const FOOTER_RULE_FROM_BOTTOM = 44;

/** Y (from top) where table content starts on a continuation page, below the continuation header. */
export const CONTINUATION_TOP = 60;

/**
 * Everything every new design draws on each page: the PAID/PARTIAL watermark, a "Continued" header on later pages
 * and a footer with identity, invoice number, page numbers and the free-plan line. Call once, before drawing content.
 */
export const installPageChrome = (args: { paginator: Paginator; fonts: PdfFonts; vm: InvoiceViewModel; margin: number }): void => {
  const { paginator, fonts, vm, margin } = args;
  const first = paginator.currentPage();
  const { width } = first.getSize();
  const right = width - margin;

  drawPaymentWatermark(first, fonts, vm);

  paginator.onPageAdded((added) => {
    drawPaymentWatermark(added, fonts, vm);
    const h = added.getSize().height;
    drawText(added, h, fonts, safeText(fonts.bold, `Invoice ${vm.invoiceNumber}  ·  ${vm.clientRaw.name}`), margin, 30, 8, { isBold: true, color: MUTED });
    drawText(added, h, fonts, "Continued", right, 30, 8, { align: "right", color: MUTED });
    added.drawLine({ start: { x: margin, y: h - 40 }, end: { x: right, y: h - 40 }, thickness: 0.5, color: RULE });
  });

  paginator.onFinalize((target, index, total) => {
    const h = target.getSize().height;
    target.drawLine({ start: { x: margin, y: FOOTER_RULE_FROM_BOTTOM }, end: { x: right, y: FOOTER_RULE_FROM_BOTTOM }, thickness: 0.5, color: RULE });
    const ids = [vm.profile.companyName, vm.profile.gstin ? `${vm.safeTaxIdLabel}: ${vm.profile.gstin}` : null, vm.profile.panNumber ? `PAN: ${vm.profile.panNumber}` : null].filter(Boolean).join("  ·  ");
    drawText(target, h, fonts, safeText(fonts.regular, ids), margin, h - 30, 7, { color: MUTED });
    drawText(target, h, fonts, `Invoice ${vm.invoiceNumber}  ·  Page ${index} of ${total}`, right, h - 30, 7, { align: "right", color: MUTED });
    if (vm.showFreePlanFooter) {
      drawText(target, h, fonts, "This document was prepared on erp.bababuilds.com | Make yours.", width / 2, h - 14, 6.5, { align: "center", color: rgb(0.55, 0.55, 0.58), isItalic: true });
    }
  });
};
