import { PDFDocument, PDFPage, PDFArray, PDFName, PDFString, rgb, StandardFonts, degrees } from 'pdf-lib';
import fs from 'fs';
import { buildPrivatePath } from '@/lib/uploads/private-storage';
import type { InvoiceTotals } from '@/lib/invoice/totals';
import { canUsePaymentGateways } from '@/lib/entitlements';
import { resolvePrimaryRemittanceFromProfile } from '@/lib/banking/resolve-primary-remittance';

export interface PDFProfile {
  companyName: string;
  proprietorName?: string | null;
  address: string;
  taxIdLabel?: string | null;
  routingLabel?: string | null;
  logoUrl?: string | null;
  gstin?: string | null; // Tax ID
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  udyamNumber?: string | null;
  panNumber?: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string; // Routing ID
  primaryBankAccount?: {
    bankName?: string | null;
    accountHolderName?: string | null;
    maskedAccountNumber?: string | null;
    routingCode?: string | null;
  } | null;
  signatureUrl?: string | null;
  invoiceTheme?: string | null;
  taxLabel?: string | null;
  workspace?: {
    planTier: string;
    subscriptionStatus?: string | null;
    subscriptionEndsAt?: Date | string | null;
    countryCode?: string | null;
    baseCurrency?: string | null;
  } | null;
}

export interface PDFClient {
  name: string;
  address: string;
  country: string;
  email?: string | null;
  taxId?: string | null;
  isExport: boolean;
  logoUrl?: string | null;
}

export interface PDFService {
  title: string;
  nicDetails: string;
  amount: number;
}

export interface PDFParams {
  profile: PDFProfile;
  client: PDFClient;
  invoiceNumber: string;
  date: Date;
  dueDate: Date;
  billingMonth: string;
  sacCode: string | { code?: string | null; value?: string | null; label?: string | null } | null;
  services: PDFService[];
  totals: InvoiceTotals;
  formattedTotal: string;
  baseCurrency: string;
  userLocale: string;
  paymentLink?: string | null;
  status?: string | null;
  /** When true, show small “Make yours” footer (Free plan, non-trial). Omit to infer from profile.workspace. */
  showFreePlanFooter?: boolean;
}

export type InvoiceWatermarkKind = "NONE" | "PARTIAL" | "PAID";

type InvoiceWatermarkLayout = {
  text: string;
  size: number;
  x: number;
  y: number;
};

const normalizeInvoiceWatermark = (status: string | null | undefined): InvoiceWatermarkKind => {
  if (!status || typeof status !== "string") return "NONE";
  const normalized = status.trim().toUpperCase();
  if (normalized === "PAID") return "PAID";
  if (normalized === "PARTIALLY_PAID" || normalized === "PARTIALLY PAID") return "PARTIAL";
  return "NONE";
};

const getInvoiceWatermarkLayout = (
  pageWidth: number,
  pageHeight: number,
  textWidthAtSize1: number,
  kind: InvoiceWatermarkKind,
): InvoiceWatermarkLayout | null => {
  if (kind === "NONE") return null;
  const text = kind === "PAID" ? "PAID" : "PARTIAL PAID";
  const targetWidth = kind === "PAID" ? pageWidth * 0.58 : pageWidth * 0.72;
  const baseSize = kind === "PAID" ? 130 : 96;
  const safeMargin = 28;
  const size = Math.min(baseSize, targetWidth / Math.max(textWidthAtSize1, 0.001));
  const renderedWidth = textWidthAtSize1 * size;
  const rawX = (pageWidth - renderedWidth) / 2;
  const x = Math.min(Math.max(rawX, safeMargin), pageWidth - renderedWidth - safeMargin);
  return {
    text,
    size,
    x,
    y: pageHeight * 0.48,
  };
};

const drawInvoiceWatermark = (
  page: PDFPage,
  fontBold: import("pdf-lib").PDFFont,
  kind: InvoiceWatermarkKind
) => {
  if (kind === "NONE") return;
  const { width, height } = page.getSize();
  const text = kind === "PAID" ? "PAID" : "PARTIAL PAID";
  const glyphWidthAtSize1 = fontBold.widthOfTextAtSize(text, 1);
  const layout = getInvoiceWatermarkLayout(width, height, glyphWidthAtSize1, kind);
  if (!layout) return;
  page.drawText(layout.text, {
    x: layout.x,
    y: layout.y,
    size: layout.size,
    font: fontBold,
    color: rgb(0.85, 0.15, 0.15),
    opacity: 0.10,
    rotate: degrees(45),
  });
};

const computeWatermarkPlacement = (
  fontBold: import("pdf-lib").PDFFont,
  pageWidth: number,
  kind: Exclude<InvoiceWatermarkKind, "NONE">,
) => {
  const text = kind === "PAID" ? "PAID" : "PARTIAL PAID";
  const measuredTextWidth = fontBold.widthOfTextAtSize(text, 1);
  const textWidthAtSize1 = Number.isFinite(measuredTextWidth) && measuredTextWidth > 0
    ? measuredTextWidth
    : text.length * 0.62;
  const layout = getInvoiceWatermarkLayout(pageWidth, 841.89, textWidthAtSize1, kind);
  if (!layout) {
    return { x: 0, renderedWidth: 0, size: 0 };
  }
  return {
    x: layout.x,
    renderedWidth: textWidthAtSize1 * layout.size,
    size: layout.size,
  };
};

export async function generateInvoicePDF({
  profile,
  client,
  invoiceNumber,
  date,
  dueDate,
  billingMonth,
  sacCode,
  services,
  totals,
  formattedTotal,
  baseCurrency,
  userLocale,
  paymentLink,
  status,
  showFreePlanFooter: showFreePlanFooterArg,
}: PDFParams): Promise<Uint8Array> {
  const billingSnapshot = {
    planTier: profile.workspace?.planTier,
    subscriptionStatus: profile.workspace?.subscriptionStatus,
    subscriptionEndsAt: profile.workspace?.subscriptionEndsAt,
  };
  const showFreePlanFooter =
    showFreePlanFooterArg !== undefined
      ? showFreePlanFooterArg
      : !canUsePaymentGateways(billingSnapshot);
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]); 
  const { height, width } = page.getSize();
  
  const font        = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const black      = rgb(0, 0, 0); 
  const white      = rgb(1, 1, 1);
  const textDark   = rgb(0.1, 0.1, 0.1); 
  const textMuted  = rgb(0.4, 0.4, 0.4); 
  const bgLight    = rgb(0.96, 0.96, 0.96); 
  const borderGray = rgb(0.85, 0.85, 0.85);
  const cfOrange   = rgb(0.95, 0.50, 0.12); 
  const cfLinkBlue = rgb(0.33, 0.70, 0);  

  const drawWatermark = (text: string, opacity = 0.1) => {
    page.drawText(text, {
      x: width / 2 - 140,
      y: height / 2 - 50,
      size: 130,
      font: fontBold,
      color: rgb(0.85, 0.15, 0.15),
      opacity: opacity,
      rotate: degrees(45),
    });
  };

  const drawText = (text: string, x: number, y: number, size: number, isBold = false, align = 'left', color = textDark, isItalic = false) => {
    const currentFont = isBold ? fontBold : (isItalic ? fontOblique : font);
    let textX = x;
    if (align === 'right')  textX = x - currentFont.widthOfTextAtSize(text, size);
    else if (align === 'center') textX = x - (currentFont.widthOfTextAtSize(text, size) / 2);
    page.drawText(text, { x: textX, y: height - y, size, font: currentFont, color });
  };

  const drawRect = (x: number, y: number, w: number, h: number, color: import('pdf-lib').Color, borderColor?: import('pdf-lib').Color) => {
    page.drawRectangle({ x, y: height - y - h, width: w, height: h, color, borderColor: borderColor || undefined, borderWidth: borderColor ? 1 : 0 });
  };

  const wrapTextByWidth = (text: string, maxWidth: number, fontSize: number): string[] => {
    if (!text) return [];

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    const pushCurrentLine = () => {
      if (currentLine) lines.push(currentLine);
      currentLine = '';
    };

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) pushCurrentLine();

      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        currentLine = word;
        continue;
      }

      let segment = '';
      for (const char of word) {
        const testSegment = `${segment}${char}`;
        if (font.widthOfTextAtSize(testSegment, fontSize) <= maxWidth) {
          segment = testSegment;
        } else {
          if (segment) lines.push(segment);
          segment = char;
        }
      }
      currentLine = segment;
    }

    pushCurrentLine();
    return lines;
  };

  const addLinkAnnotation = (
    doc: PDFDocument,
    p: PDFPage,
    linkX: number,
    absY: number,
    w: number,
    h: number,
    url: string
  ): void => {
    const linkAnnotation = doc.context.obj({
      Type:    'Annot',
      Subtype: 'Link',
      Rect:    [linkX, absY, linkX + w, absY + h],
      Border:  [0, 0, 0],
      A: {
        Type: 'Action',
        S:    'URI',
        URI:  PDFString.of(url),
      },
    });

    const ref = doc.context.register(linkAnnotation);
    const annots = p.node.get(PDFName.of('Annots'));
    if (annots instanceof PDFArray) {
      annots.push(ref);
    } else {
      p.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
    }
  };

  const loadLogo = async (logoUrl: string | null, x: number, y: number, maxWidth: number, maxHeight: number, align = 'left') => {
    if (!logoUrl) return false;
    try {
      const cleanUrl = logoUrl.split('?')[0];
      const relativeLogoPath = cleanUrl.startsWith('/') ? cleanUrl.substring(1) : cleanUrl;
      // Private storage: translate URL path to on-disk private_uploads/<kind>/...
      const parts = relativeLogoPath.split('/').filter(Boolean);
      const kind = parts.shift();
      if (!kind) return false;
      const fullPath = buildPrivatePath(kind as any, parts);
      if (fs.existsSync(fullPath)) {
        const imageData = fs.readFileSync(fullPath);
        let image;
        const lowerPath = cleanUrl.toLowerCase();
        if (lowerPath.endsWith('.png')) {
          image = await pdfDoc.embedPng(imageData);
        } else if (lowerPath.endsWith('.webp')) {
          const sharp = (await import('sharp')).default;
          const pngData = await sharp(imageData).png().toBuffer();
          image = await pdfDoc.embedPng(pngData);
        } else {
          image = await pdfDoc.embedJpg(imageData);
        }
        const dims = image.scaleToFit(maxWidth, maxHeight);
        const drawX = align === 'right' ? x - dims.width : x;
        page.drawImage(image, { x: drawX, y: height - y - dims.height, width: dims.width, height: dims.height });
        return true;
      }
      return false;
    } catch (e) {
      console.log(`Logo load failed: ${logoUrl}`, e);
      return false;
    }
  };

  const headerTitle  = client.isExport ? 'EXPORT OF SERVICES' : 'TAX INVOICE';
  const subHeader    = client.isExport ? 'ZERO RATED SUPPLY' : 'DOMESTIC SUPPLY';
  const safeTaxIdLabel    = profile.taxIdLabel    || "VAT/GST Number";
  const safeRoutingLabel  = profile.routingLabel  || "IFSC Code";
  const remittance = resolvePrimaryRemittanceFromProfile(profile);
  const remittanceBankName = remittance.bankName || "Not configured";
  const remittanceAccountName = remittance.accountHolderName || "Not configured";
  const remittanceAccountNumber = remittance.accountNumberDisplay || remittance.maskedAccountNumber || "Not configured";
  const remittanceRoutingCode = remittance.routingCode || "Not configured";

  const invoiceTheme = profile.invoiceTheme || "DESIGN_1";

  if (invoiceTheme === "DESIGN_2") {
    const leftMargin  = 40;
    const rightMargin = width - 40;

    drawRect(0, 0, width, 6, cfOrange);
    drawText("Invoice", leftMargin, 41, 22, true, 'left', black);
    if (profile.logoUrl) {
      await loadLogo(profile.logoUrl, rightMargin, 40, 140, 35, 'right');
    }

    let metaY = 80;
    const drawMeta = (label: string, value: string) => {
      if (!value) return;
      drawText(label, leftMargin, metaY, 9, false, 'left', textDark);
      drawText(value, leftMargin + 100, metaY, 9, true, 'left', black);
      metaY += 13;
    };

    drawMeta("Invoice number", invoiceNumber);
    drawMeta("Date of issue", date.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' }));
    drawMeta("Date due", dueDate.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' }));
    drawMeta(safeTaxIdLabel, profile.gstin || "N/A");
    drawMeta("Company name", profile.companyName);

    const billY = 170;
    drawText(profile.companyName, leftMargin, billY, 9, true,  'left', black);
    const profileAddr = profile.address.split(', ');
    drawText(profileAddr[0] || "", leftMargin, billY + 14, 9, false, 'left', textDark);
    drawText(profileAddr.slice(1).join(', ') || "", leftMargin, billY + 28, 9, false, 'left', textDark);
    if (profile.email)       drawText(profile.email, leftMargin, billY + 42, 9, false, 'left', cfLinkBlue);
    if (profile.udyamNumber) drawText(`MSME: ${profile.udyamNumber}`, leftMargin, billY + 56, 9, false, 'left', textDark);

    const rightColX = 280;
    drawText("Bill to", rightColX, billY, 9, true, 'left', black);
    drawText(client.name, rightColX, billY + 14, 9, false, 'left', textDark);
    const clientAddr = client.address.split(', ');
    drawText(clientAddr[0] || "", rightColX, billY + 28, 9, false, 'left', textDark);
    drawText(clientAddr.slice(1).join(', ') || "", rightColX, billY + 42, 9, false, 'left', textDark);
    drawText(client.country, rightColX, billY + 56, 9, false, 'left', textDark);
    if (client.email) drawText(client.email, rightColX, billY + 70, 9, false, 'left', textDark);

    const calloutY = 270;
    const currencyCode  = baseCurrency;
    const bigDueText    = `${currencyCode} ${formattedTotal} due ${dueDate.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' })}`;
    drawText(bigDueText, leftMargin, calloutY, 14, true, 'left', black);
    
    let displaySac: string | undefined = typeof sacCode === 'string' ? sacCode : undefined;
    if (typeof sacCode === 'object' && sacCode !== null) {
      displaySac = sacCode.code || sacCode.value || sacCode.label || JSON.stringify(sacCode);
    }
    drawText(`Service Classification: ${displaySac || 'N/A'}`, leftMargin, calloutY + 24, 9, false, 'left', textMuted);

    let tableY = 340;
    const qtyX   = rightMargin - 150;
    const priceX = rightMargin - 80;

    drawText("Description", leftMargin, tableY, 8, false, 'left', textDark);
    drawText("Qty",         qtyX,        tableY, 8, false, 'right', textDark);
    drawText("Unit price",  priceX,      tableY, 8, false, 'right', textDark);
    drawText("Amount",      rightMargin,  tableY, 8, false, 'right', textDark);

    page.drawLine({ start: { x: leftMargin, y: height - (tableY + 12) }, end: { x: rightMargin, y: height - (tableY + 12) }, thickness: 1, color: black });

    tableY += 30;
    services.forEach((service: PDFService) => {
      const lineAmt = service.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 });
      drawText(service.title, leftMargin, tableY, 9, false, 'left', black);
      drawText(`${service.nicDetails || "Billing period"}: ${billingMonth}`, leftMargin, tableY + 14, 8, false, 'left', textDark);
      drawText("1",       qtyX,        tableY, 9, false, 'right', black);
      drawText(lineAmt,   priceX,      tableY, 9, false, 'right', black);
      drawText(lineAmt,   rightMargin, tableY, 9, false, 'right', black);
      tableY += 35; 
    });

    tableY += 10;
    const subtotal = totals.subtotal;
    const taxAmount = totals.taxAmount;
    const taxRatePercent = Math.round(totals.taxRate * 100);
    const taxLabel = profile.taxLabel || "Tax";
    const taxRowLabel = totals.taxMode === 'exempt'
      ? `${taxLabel} (Exempt 0%)`
      : `${taxLabel} (${taxRatePercent}%)`;
    const totalsLeftMargin = rightMargin - 200;

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText("Subtotal", priceX, tableY + 15, 9, false, 'right', textMuted);
    drawText(subtotal.toLocaleString(userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, false, 'right', black);
    tableY += 20;

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText(taxRowLabel, priceX, tableY + 15, 9, false, 'right', textMuted);
    drawText(taxAmount.toLocaleString(userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, false, 'right', black);
    tableY += 20;

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText("Amount due", priceX, tableY + 15, 9, true, 'right', black);
    drawText(`${currencyCode} ${totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, rightMargin, tableY + 15, 9, true, 'right', black);

    let footerY = tableY + 60;
    drawText(`If this request is concerning an invoice reach out to ${profile.email || 'billing'}. For all other concerns, contact support.`, leftMargin, footerY, 8, false, 'left', textDark);

    footerY += 40;
    drawText(`Pay ${currencyCode} ${formattedTotal} with a bank transfer`, leftMargin, footerY, 10, true, 'left', black);
    drawText("Bank transfers can take up to two business days. To pay via", leftMargin, footerY + 16, 9, false, 'left', black);
    drawText("bank transfer, transfer funds using the following bank", leftMargin, footerY + 28, 9, false, 'left', black);
    drawText("information.", leftMargin, footerY + 40, 9, false, 'left', black);

    footerY += 65;
    const drawBankDetail = (label: string, value: string) => {
      if (!value) return;
      drawText(label, leftMargin, footerY, 9, false, 'left', textDark);
      drawText(value, leftMargin + 100, footerY, 9, false, 'left', black);
      footerY += 14;
    };

    drawBankDetail("Bank name",      remittanceBankName);
    drawBankDetail("Account Name",   remittanceAccountName);
    drawBankDetail("Account number", remittanceAccountNumber);
    drawBankDetail(safeRoutingLabel, remittanceRoutingCode);
    drawBankDetail("Reference",      invoiceNumber);

    if (paymentLink) {
      footerY += 8;
      const linkText  = `Pay securely online: ${paymentLink}`;
      const linkTextWidth = font.widthOfTextAtSize(linkText, 9);
      drawText(linkText, leftMargin, footerY, 9, false, 'left', cfLinkBlue);
      
      addLinkAnnotation(
        pdfDoc,
        page,
        leftMargin,
        height - footerY - 1,
        linkTextWidth,
        10,
        paymentLink
      );

      footerY += 16;
    }

    if (showFreePlanFooter) {
      drawText(
        "This document was prepared on erp.bababuilds.com | Make yours.",
        width / 2,
        height - 18,
        7,
        false,
        "center",
        textMuted,
        true,
      );
    }

    page.drawLine({ start: { x: leftMargin, y: 45 }, end: { x: rightMargin, y: 45 }, thickness: 0.5, color: borderGray });
    drawText("Page 1 of 1", rightMargin, height - 30, 8, false, 'right', textMuted);

  } else {
    // ── DESIGN_1
    const currencyCode = baseCurrency;
    const design1 = {
      leftMargin: 40,
      rightMargin: width - 40,
      headerLineY: 85,
      clientSectionX: 320,
      invoiceMetaBoxY: 220,
      servicesHeaderY: 290,
      serviceStartY: 335,
      bankSectionGap: 118,
    };
    
    const profileLogoLoaded = profile.logoUrl
      ? await loadLogo(profile.logoUrl, design1.leftMargin, 30, 180, 45)
      : false;
    if (!profileLogoLoaded) {
      drawText(profile.companyName, design1.leftMargin, 46, 18, true, 'left', black);
    }

    drawText('INVOICE',    design1.rightMargin, 45, 24, true,  'right', black);
    drawText(headerTitle,  design1.rightMargin, 60, 10, true,  'right', textMuted);
    drawText(subHeader,    design1.rightMargin, 72, 8,  false, 'right', textMuted, true);
    page.drawLine({ start: { x: design1.leftMargin, y: height - design1.headerLineY }, end: { x: design1.rightMargin, y: height - design1.headerLineY }, thickness: 2, color: black });

    drawText('From:', design1.leftMargin, 110, 9, true, 'left', textMuted);
    drawText(profile.companyName, design1.leftMargin, 125, 11, true, 'left', black);
    if (profile.proprietorName) drawText(`(Proprietor: ${profile.proprietorName})`, design1.leftMargin, 140, 9, false, 'left', textMuted);
    
    const addrParts = profile.address.split(', ');
    const line1 = addrParts.slice(0, Math.ceil(addrParts.length / 2)).join(', ');
    const line2 = addrParts.slice(Math.ceil(addrParts.length / 2)).join(', ');
    drawText(line1, design1.leftMargin, 155, 10, false, 'left', textDark);
    if (line2) drawText(line2, design1.leftMargin, 170, 10, false, 'left', textDark);

    drawText('To:', design1.clientSectionX, 110, 9, true, 'left', textMuted);
    const clientLogoLoaded = client.logoUrl ? await loadLogo(client.logoUrl, design1.clientSectionX, 118, 140, 35) : false;
    const clientNameY = clientLogoLoaded ? 165 : 125;
    drawText(client.name, design1.clientSectionX, clientNameY, 11, true,  'left', black);
    
    const clientAddrParts = client.address.split(', ');
    const clientLine1 = clientAddrParts.slice(0, Math.ceil(clientAddrParts.length / 2)).join(', ');
    const clientLine2 = clientAddrParts.slice(Math.ceil(clientAddrParts.length / 2)).join(', ');
    drawText(clientLine1, design1.clientSectionX, clientNameY + 15, 9, false, 'left', textMuted);
    if (clientLine2) drawText(clientLine2, design1.clientSectionX, clientNameY + 30, 9, false, 'left', textMuted);
    
    drawText(client.country, design1.clientSectionX, clientNameY + (clientLine2 ? 45 : 30), 10, true, 'left', textDark);

    drawRect(design1.leftMargin, design1.invoiceMetaBoxY, width - 80, 50, bgLight, borderGray); 
    drawText('Invoice No:',     55,  240, 9,  true,  'left', textMuted);
    drawText(invoiceNumber,     115, 240, 10, true,  'left', black);
    drawText('Date:',           250, 240, 9,  true,  'left', textMuted);
    drawText(date.toLocaleDateString(userLocale), 280, 240, 10, true, 'left', black);
    drawText('Billing Month:',  390, 240, 9,  true,  'left', textMuted);
    drawText(billingMonth,      465, 240, 10, true,  'left', black);

    drawText('Place of Supply:',  55,  258, 9,  true,  'left', textMuted);
    drawText(`${client.country} (${client.isExport ? 'Export' : 'Domestic'})`, 135, 258, 10, true, 'left', black);
    drawText('Tax Identification:', 390, 258, 9,  true,  'left', textMuted);
    drawText(client.taxId || 'N/A', 475, 258, 10, true, 'left', black);

    drawRect(design1.leftMargin, design1.servicesHeaderY, width - 80, 25, black);
    drawText('Classification',          50,       307, 9, true, 'left',  white);
    drawText('Description of Services', 180,      307, 9, true, 'left',  white);
    drawText(`Amount (${currencyCode})`, width - 50, 307, 9, true, 'right', white);
    
    let currentY = design1.serviceStartY; 
    
    const watermarkKind = normalizeInvoiceWatermark(status);
    if (watermarkKind !== "NONE") {
      drawInvoiceWatermark(page, fontBold, watermarkKind);
    }

    let displaySac: string | undefined = typeof sacCode === 'string' ? sacCode : undefined;
    if (typeof sacCode === 'object' && sacCode !== null) {
      displaySac = sacCode.code || sacCode.value || sacCode.label || JSON.stringify(sacCode);
    }
    const safeSac = displaySac && displaySac.length > 25 ? displaySac.substring(0, 23) + '...' : (displaySac || 'N/A');

    services.forEach((service: PDFService) => {
      const lineAmt = service.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 });
      drawText(safeSac,       50,        currentY,      10, false, 'left',  textDark);
      drawText(service.title, 180,       currentY,      10, true,  'left',  black);
      drawText(`(${service.nicDetails} for ${billingMonth})`, 180, currentY + 15, 8, false, 'left', textMuted);
      drawText(lineAmt,       width - 50, currentY,     10, false, 'right', textDark);
      currentY += 40; 
    });

    const dividerY = currentY - 10;
    page.drawLine({ start: { x: design1.leftMargin, y: height - dividerY }, end: { x: design1.rightMargin, y: height - dividerY }, thickness: 1, color: borderGray });

    const taxLabel = profile.taxLabel || "Tax";
    const taxRatePercent = Math.round(totals.taxRate * 100);
    const taxRowLabel = totals.taxMode === 'exempt'
      ? `${taxLabel} (Exempt 0%)`
      : `${taxLabel} (${taxRatePercent}%)`;
    drawText('Subtotal',  width - 150, currentY + 10, 9, false, 'right', textMuted);
    drawText(totals.subtotal.toLocaleString(userLocale, { minimumFractionDigits: 2 }), width - 50,  currentY + 10, 10, false, 'right', textDark);
    drawText(taxRowLabel, width - 150, currentY + 25, 9, false, 'right', textMuted);
    drawText(totals.taxAmount.toLocaleString(userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 25, 10, false, 'right', textDark);
    drawText('Total', width - 150, currentY + 40, 9, false, 'right', textMuted);
    drawText(totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 40, 10, false, 'right', textDark);

    drawRect(width - 250, currentY + 70, 210, 35, black);
    drawText('Total Amount',            width - 175, currentY + 92, 11, true, 'right', white);
    drawText(`${currencyCode} ${totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, width - 55, currentY + 92, 11, true, 'right', white);

    const bankY = currentY + design1.bankSectionGap;
    let paymentLinkRendered = false;

    if (paymentLink) {
      const normalizedPaymentLink = String(paymentLink).trim();
      if (normalizedPaymentLink) {
        const linkLabel = "Pay Online via UPI / Card / Net Banking / Apple Pay:";
        const leftStartX = 40;
        const maxUrlWidth = width - 40 - 220;
        const urlFontSize = 9;
        const lineHeight = 12;
        const wrappedUrlLines = wrapTextByWidth(normalizedPaymentLink, maxUrlWidth, urlFontSize);
        const urlBottomY = bankY - 10;
        const urlLinesToDraw = wrappedUrlLines.length > 0 ? wrappedUrlLines : [normalizedPaymentLink];

        const urlLineYs: number[] = [];
        urlLinesToDraw.forEach((line, index) => {
          const lineY = urlBottomY - ((urlLinesToDraw.length - 1 - index) * lineHeight);
          urlLineYs.push(lineY);
          drawText(line, leftStartX, lineY, urlFontSize, false, 'left', cfLinkBlue);
        });

        const topUrlLineY = Math.min(...urlLineYs);
        const labelY = topUrlLineY - lineHeight;
        drawText(linkLabel, leftStartX, labelY, 9, true, 'left', black);

        const maxRenderedLineWidth = Math.max(...urlLinesToDraw.map((line) => font.widthOfTextAtSize(line, urlFontSize)));
        const urlBlockHeight = lineHeight * urlLinesToDraw.length;

        addLinkAnnotation(
          pdfDoc,
          page,
          leftStartX,
          height - (topUrlLineY + urlBlockHeight),
          maxRenderedLineWidth,
          urlBlockHeight,
          normalizedPaymentLink
        );
        paymentLinkRendered = true;
      }
    }

    drawText('Bank Details for Remittance', design1.leftMargin, bankY,      10, true,  'left', black);
    drawText(`Bank Name: ${remittanceBankName}`, design1.leftMargin, bankY + 20, 9,  false, 'left', textDark);
    drawText(`Account Name: ${remittanceAccountName}`, design1.leftMargin, bankY + 35, 9,  false, 'left', textDark);
    drawText(`Account No: ${remittanceAccountNumber}`, design1.leftMargin, bankY + 50, 9,  true,  'left', black);
    drawText(`${safeRoutingLabel}: ${remittanceRoutingCode}`, design1.leftMargin, bankY + 65, 9, false, 'left', textDark);

    drawText(`For ${profile.companyName}`, width - 40, bankY + 20, 10, true, 'right', black);
    if (profile.signatureUrl) {
      await loadLogo(profile.signatureUrl, width - 40, bankY + 30, 140, 35, 'right');
    }
    page.drawLine({ start: { x: width - 180, y: height - (bankY + 70) }, end: { x: width - 40, y: height - (bankY + 70) }, thickness: 1, color: black });
    drawText('Authorized Signatory', width - 40, bankY + 85, 9, false, 'right', textMuted);

    const workspaceCountryCode = profile.workspace?.countryCode?.trim().toUpperCase() || 'IN';
    const isIndiaWorkspace = workspaceCountryCode === 'IN';
    const declarationLines = isIndiaWorkspace
      ? [
          "1. GST Exemption: We hereby declare that our aggregate turnover is below the statutory registration threshold",
          "   prescribed under Section 22 of the CGST Act, 2017. Hence, GST is not applicable on this invoice.",
          client.isExport
            ? "2. Export of Service: This supply qualifies as an 'Export of Services' as defined under Section 2(6) of the"
            : "2. Nature of Supply: This invoice represents a domestic supply of services within the territory of India.",
          client.isExport
            ? "   IGST Act, 2017. The recipient and place of supply are located outside India."
            : "3. MSME Status: The service provider is a registered Micro Enterprise under the MSMED Act, 2006.",
          client.isExport
            ? "3. MSME Status: The service provider is a registered Micro Enterprise under the MSMED Act, 2006."
            : null,
        ].filter((line): line is string => Boolean(line))
      : [
          "1. Tax Treatment: This document applies the workspace's configured tax profile and registration settings.",
          `   Applicable label: ${profile.taxLabel || 'VAT/Tax'} | Registration field: ${safeTaxIdLabel}.`,
          client.isExport
            ? "2. Cross-border Supply: Recipient and place-of-supply details are captured for export/international billing."
            : "2. Domestic Supply: This invoice is issued as a domestic supply under the workspace's configured jurisdiction.",
          "3. Compliance Note: Confirm filing obligations with your local tax advisor or authority guidance.",
        ];

    const declarationHeight = 45 + declarationLines.length * 12;
    const decY = bankY + 95 + (paymentLinkRendered ? 15 : 0);
    drawRect(design1.leftMargin, decY, width - 80, declarationHeight, bgLight, borderGray);
    drawText('Statutory Declarations:', 55, decY + 20, 9, true, 'left', black);
    declarationLines.forEach((line, index) => {
      drawText(line, 55, decY + 35 + index * 12, 8, false, 'left', textDark);
    });

    let metaStringValue = `${profile.companyName} | PAN: ${profile.panNumber}`;
    if (profile.udyamNumber) metaStringValue += ` | MSME: ${profile.udyamNumber}`;
    if (profile.gstin)       metaStringValue += ` | ${safeTaxIdLabel}: ${profile.gstin}`;

    const contactString = `${profile.email || 'billing@company.com'}${profile.phone ? ` | ${profile.phone}` : ''}${profile.website ? ` | ${profile.website}` : ''}`;
    
    drawRect(0, height - 72, width, 72, black);
    drawText(metaStringValue, width / 2, height - 43, 9, false, 'center', white);
    drawText(contactString, width / 2, height - 24, 9, false, 'center', white);

    if (showFreePlanFooter) {
      drawText(
        "This document was prepared on erp.bababuilds.com | Make yours.", 
        width / 2,           
        height - 9,         
        7,                   
        false,               
        'center',            
        rgb(0.5, 0.5, 0.5),  
        true                 
      );
    }
  }

  return await pdfDoc.save();
}

export { normalizeInvoiceWatermark, drawInvoiceWatermark, computeWatermarkPlacement };
