import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  format, 
  addMonths, 
  addYears, 
  isLastDayOfMonth, 
  endOfMonth, 
  isWeekend, 
  previousFriday 
} from "date-fns";
import { PDFDocument, PDFArray, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { calculateInvoiceTotals } from '@/lib/invoice/totals';
import { resolveTaxRate } from '@/lib/invoice/tax-resolver';
import { decimalToNumber, toDecimal } from '@/lib/money';

// Helper for Indian Financial Year
const getFY = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month < 4) return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
  return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
};

/**
 * Adds a real, clickable URI annotation (PDF /Annot /Subtype /Link) to a page.
 * Standardizes parity with the manual invoice generator.
 */
function addLinkAnnotation(
  pdfDoc: PDFDocument,
  page: any,
  x: number,
  absoluteY: number,
  rectWidth: number,
  rectHeight: number,
  url: string
): void {
  const linkAnnotation = pdfDoc.context.obj({
    Type:    'Annot',
    Subtype: 'Link',
    Rect:    [x, absoluteY, x + rectWidth, absoluteY + rectHeight],
    Border:  [0, 0, 0], 
    A: {
      Type: 'Action',
      S:    'URI',
      URI:  PDFString.of(url),
    },
  });

  const ref = pdfDoc.context.register(linkAnnotation);

  const annots = page.node.get(PDFName.of('Annots'));
  if (annots instanceof PDFArray) {
    annots.push(ref);
  } else {
    page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([ref]));
  }
}

// --- PDF GENERATION ENGINE FOR CRON ---
async function generateRetainerPDF(
  workspaceId: string, 
  retainer: any, 
  profile: any, 
  invoiceNumber: string, 
  billingMonth: string, 
  finalDescription: string,
  totals: { subtotal: number; taxRate: number; taxAmount: number; total: number; taxMode: 'taxable' | 'exempt' },
  paymentLink: string | null = null
) {
  const client = retainer.client;
  const userLocale = profile.workspace?.countryCode === "IN" ? "en-IN" : "en-US";
  const currencyCode = profile.workspace?.baseCurrency || 'INR';
  const invoiceTheme = profile.invoiceTheme || "DESIGN_1";
  
  const date = new Date();
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + 7);

  const subtotal = totals.subtotal;
  const estimatedTax = totals.taxAmount;
  const taxLabel = profile.taxLabel || "Tax";
  const taxRatePercent = Math.round(totals.taxRate * 100);
  const taxRowLabel = totals.taxMode === 'exempt' ? `${taxLabel} (Exempt 0%)` : `${taxLabel} (${taxRatePercent}%)`;
  const formattedTotal = totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); 
  const { height, width } = page.getSize();
  
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const black = rgb(0, 0, 0); 
  const white = rgb(1, 1, 1);
  const textDark = rgb(0.1, 0.1, 0.1); 
  const textMuted = rgb(0.4, 0.4, 0.4); 
  const bgLight = rgb(0.96, 0.96, 0.96); 
  const borderGray = rgb(0.85, 0.85, 0.85);
  const cfOrange = rgb(0.95, 0.50, 0.12); 
  const cfLinkBlue = rgb(0, 0.33, 0.70);  

  const drawText = (text: string, x: number, y: number, size: number, isBold = false, align = 'left', color = textDark, isItalic = false) => {
    let currentFont = isBold ? fontBold : (isItalic ? fontOblique : font);
    let textX = x;
    if (align === 'right') textX = x - currentFont.widthOfTextAtSize(text, size);
    else if (align === 'center') textX = x - (currentFont.widthOfTextAtSize(text, size) / 2);
    page.drawText(text, { x: textX, y: height - y, size, font: currentFont, color });
  };

  const drawRect = (x: number, y: number, w: number, h: number, color: any, borderColor?: any) => {
    page.drawRectangle({ x, y: height - y - h, width: w, height: h, color, borderColor: borderColor || undefined, borderWidth: borderColor ? 1 : 0 });
  };

  const loadLogo = async (logoUrl: string | null, x: number, y: number, maxWidth: number, maxHeight: number, align = 'left') => {
    if (!logoUrl) return;
    try {
      const fullPath = path.join(process.cwd(), 'public', logoUrl);
      if (fs.existsSync(fullPath)) {
        const image = await pdfDoc.embedPng(fs.readFileSync(fullPath));
        const dims = image.scaleToFit(maxWidth, maxHeight);
        const drawX = align === 'right' ? x - dims.width : x;
        page.drawImage(image, { x: drawX, y: height - y - dims.height, width: dims.width, height: dims.height });
      }
    } catch (e) { console.log(`Logo load failed: ${logoUrl}`); }
  };

  const headerTitle = client.isExport ? 'EXPORT OF SERVICES' : 'TAX INVOICE';
  const subHeader = client.isExport ? 'ZERO RATED SUPPLY' : 'DOMESTIC SUPPLY';
  const safeTaxIdLabel = profile.taxIdLabel || "VAT/GST Number";
  const safeRoutingLabel = profile.routingLabel || "IFSC Code";

  // --- THEME ROUTER ---
  if (invoiceTheme === "DESIGN_2") {
    const leftMargin = 40;
    const rightMargin = width - 40;

    drawRect(0, 0, width, 6, cfOrange);
    drawText("Invoice", leftMargin, 41, 22, true, 'left', black);
    if (profile.logoUrl) await loadLogo(profile.logoUrl, rightMargin, 40, 140, 35, 'right');

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

    let billY = 170;
    drawText(profile.companyName, leftMargin, billY, 9, true, 'left', black);
    const profileAddr = profile.address.split(', ');
    drawText(profileAddr[0] || "", leftMargin, billY + 14, 9, false, 'left', textDark);
    drawText(profileAddr.slice(1).join(', ') || "", leftMargin, billY + 28, 9, false, 'left', textDark);
    if (profile.email) drawText(profile.email, leftMargin, billY + 42, 9, false, 'left', cfLinkBlue);
    if (profile.udyamNumber) drawText(`MSME: ${profile.udyamNumber}`, leftMargin, billY + 56, 9, false, 'left', textDark);

    const rightColX = 280;
    drawText("Bill to", rightColX, billY, 9, true, 'left', black);
    drawText(client.name, rightColX, billY + 14, 9, false, 'left', textDark);
    const clientAddr = client.address.split(', ');
    drawText(clientAddr[0] || "", rightColX, billY + 28, 9, false, 'left', textDark);
    drawText(clientAddr.slice(1).join(', ') || "", rightColX, billY + 42, 9, false, 'left', textDark);
    drawText(client.country, rightColX, billY + 56, 9, false, 'left', textDark);
    if (client.email) drawText(client.email, rightColX, billY + 70, 9, false, 'left', textDark);

    let calloutY = 270;
    const bigDueText = `${currencyCode} ${formattedTotal} due ${dueDate.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' })}`;
    drawText(bigDueText, leftMargin, calloutY, 14, true, 'left', black);
    drawText(`Service Classification: ${retainer.sacCode || profile.defaultSacCode || 'N/A'}`, leftMargin, calloutY + 24, 9, false, 'left', textMuted);


    let tableY = 340;
    const qtyX = rightMargin - 150;
    const priceX = rightMargin - 80;

    drawText("Description", leftMargin, tableY, 8, false, 'left', textDark);
    drawText("Qty", qtyX, tableY, 8, false, 'right', textDark);
    drawText("Unit price", priceX, tableY, 8, false, 'right', textDark);
    drawText("Amount", rightMargin, tableY, 8, false, 'right', textDark);

    page.drawLine({ start: { x: leftMargin, y: height - (tableY + 12) }, end: { x: rightMargin, y: height - (tableY + 12) }, thickness: 1, color: black });

    tableY += 30;
    const lineAmt = subtotal.toLocaleString(userLocale, { minimumFractionDigits: 2 });
    drawText(retainer.serviceName, leftMargin, tableY, 9, false, 'left', black);
    drawText(`${finalDescription}`, leftMargin, tableY + 14, 8, false, 'left', textDark);
    drawText("1", qtyX, tableY, 9, false, 'right', black);
    drawText(lineAmt, priceX, tableY, 9, false, 'right', black);
    drawText(lineAmt, rightMargin, tableY, 9, false, 'right', black);
    tableY += 35; 

    tableY += 10;
    const totalsLeftMargin = rightMargin - 200;

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText("Subtotal", priceX, tableY + 15, 9, false, 'right', textDark);
    drawText(subtotal.toLocaleString(userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, false, 'right', black);
    tableY += 20;

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText(taxRowLabel, priceX, tableY + 15, 9, false, 'right', textDark);
    drawText(estimatedTax.toLocaleString(userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, false, 'right', black);
    tableY += 20;

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText("Amount due", priceX, tableY + 15, 9, true, 'right', black);
    drawText(`${currencyCode} ${formattedTotal}`, rightMargin, tableY + 15, 9, true, 'right', black);

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

    drawBankDetail("Bank name", profile.bankName);
    drawBankDetail("Account Name", profile.accountName);
    drawBankDetail("Account number", profile.accountNumber);
    drawBankDetail(safeRoutingLabel, profile.ifscCode);
    drawBankDetail("Reference", invoiceNumber);

    // --- DESIGN_2: Payment link rendering ---
    if (paymentLink) {
      footerY += 8; 
      const linkText  = `Pay securely online: ${paymentLink}`;
      const linkTextWidth = font.widthOfTextAtSize(linkText, 9);
      drawText(linkText, leftMargin, footerY, 9, false, 'left', cfLinkBlue);
      addLinkAnnotation(pdfDoc, page, leftMargin, height - footerY - 1, linkTextWidth, 10, paymentLink);
      footerY += 16;
    }

    page.drawLine({ start: { x: leftMargin, y: 45 }, end: { x: rightMargin, y: 45 }, thickness: 0.5, color: borderGray });
    drawText("Page 1 of 1", rightMargin, height - 30, 8, false, 'right', textMuted);

  } else {
    // DESIGN 1: CLASSIC
    if (profile.logoUrl) await loadLogo(profile.logoUrl, 40, 30, 180, 45); 
    else drawText(profile.companyName, 40, 50, 18, true, 'left', black);

    drawText('INVOICE', width - 40, 45, 24, true, 'right', black);
    drawText(headerTitle, width - 40, 60, 10, true, 'right', textMuted);
    drawText(subHeader, width - 40, 72, 8, false, 'right', textMuted, true);
    page.drawLine({ start: { x: 40, y: height - 85 }, end: { x: width - 40, y: height - 85 }, thickness: 2, color: black });

    drawText('From:', 40, 110, 9, true, 'left', textMuted);
    drawText(profile.companyName, 40, 125, 11, true, 'left', black);
    if (profile.proprietorName) drawText(`(Proprietor: ${profile.proprietorName})`, 40, 140, 9, false, 'left', textMuted);
    
    const addrParts = profile.address.split(', ');
    const line1 = addrParts.slice(0, Math.ceil(addrParts.length / 2)).join(', ');
    const line2 = addrParts.slice(Math.ceil(addrParts.length / 2)).join(', ');
    drawText(line1, 40, 155, 10, false, 'left', textDark);
    if (line2) drawText(line2, 40, 170, 10, false, 'left', textDark);

    drawText('To:', 320, 110, 9, true, 'left', textMuted);
    if (client.logoUrl) await loadLogo(client.logoUrl, 320, 118, 140, 35); 
    drawText(client.name, 320, 165, 11, true, 'left', black);
    drawText(client.address, 320, 180, 9, false, 'left', textMuted);
    drawText(client.country, 320, 195, 10, true, 'left', textDark);

    drawRect(40, 220, width - 80, 50, bgLight, borderGray); 
    drawText('Invoice No:', 55, 240, 9, true, 'left', textMuted);
    drawText(invoiceNumber, 115, 240, 10, true, 'left', black);
    drawText('Date:', 250, 240, 9, true, 'left', textMuted);
    drawText(date.toLocaleDateString(userLocale), 280, 240, 10, true, 'left', black);
    drawText('Billing Month:', 390, 240, 9, true, 'left', textMuted);
    drawText(billingMonth, 465, 240, 10, true, 'left', black);

    drawText('Place of Supply:', 55, 258, 9, true, 'left', textMuted);
    drawText(`${client.country} (${client.isExport ? 'Export' : 'Domestic'})`, 135, 258, 10, true, 'left', black);
    drawText('Tax Identification:', 390, 258, 9, true, 'left', textMuted);
    drawText(client.taxId || 'N/A', 475, 258, 10, true, 'left', black);

    drawRect(40, 290, width - 80, 25, black);
    drawText('Classification', 50, 307, 9, true, 'left', white);
    drawText('Description of Services', 140, 307, 9, true, 'left', white);
    drawText(`Amount (${currencyCode})`, width - 50, 307, 9, true, 'right', white);
    
    let currentY = 335; 
    const lineAmt = subtotal.toLocaleString(userLocale, { minimumFractionDigits: 2 });
    drawText(retainer.sacCode || profile.defaultSacCode || "998313", 50, currentY, 10, false, 'left', textDark);
    drawText(retainer.serviceName, 140, currentY, 10, true, 'left', black);

    drawText(`(${finalDescription})`, 140, currentY + 15, 8, false, 'left', textMuted);
    drawText(lineAmt, width - 50, currentY, 10, false, 'right', textDark);
    currentY += 40; 

    const dividerY = currentY - 10;
    page.drawLine({ start: { x: 40, y: height - dividerY }, end: { x: width - 40, y: height - dividerY }, thickness: 1, color: borderGray });

    drawText('Subtotal', width - 150, currentY + 10, 9, false, 'right', textMuted);
    drawText(subtotal.toLocaleString(userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 10, 10, false, 'right', textDark);
    drawText(taxRowLabel, width - 150, currentY + 25, 9, false, 'right', textMuted);
    drawText(estimatedTax.toLocaleString(userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 25, 10, false, 'right', textDark);
    drawText('Total', width - 150, currentY + 40, 9, false, 'right', textMuted);
    drawText(totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2 }), width - 50, currentY + 40, 10, false, 'right', textDark);

    drawRect(width - 220, currentY + 70, 180, 35, black);
    drawText('Total Amount', width - 150, currentY + 92, 11, true, 'right', white);
    drawText(`${currencyCode} ${formattedTotal}`, width - 50, currentY + 92, 11, true, 'right', white);

    const bankY = currentY + 130;
    drawText('Bank Details for Remittance', 40, bankY, 10, true, 'left', black);
    drawText(`Bank Name: ${profile.bankName}`, 40, bankY + 20, 9, false, 'left', textDark);
    drawText(`Account Name: ${profile.accountName}`, 40, bankY + 35, 9, false, 'left', textDark);
    drawText(`Account No: ${profile.accountNumber}`, 40, bankY + 50, 9, true, 'left', black);
    drawText(`${safeRoutingLabel}: ${profile.ifscCode}`, 40, bankY + 65, 9, false, 'left', textDark);

    drawText(`For ${profile.companyName}`, width - 40, bankY + 20, 10, true, 'right', black);
    page.drawLine({ start: { x: width - 180, y: height - (bankY + 70) }, end: { x: width - 40, y: height - (bankY + 70) }, thickness: 1, color: black });
    drawText('Authorized Signatory', width - 40, bankY + 85, 9, false, 'right', textMuted);

    // --- DESIGN_1: Payment link rendering ---
    if (paymentLink) {
      const linkText  = `Pay securely online: ${paymentLink}`;
      const linkTextWidth = font.widthOfTextAtSize(linkText, 9);
      const linkDisplayY = bankY + 100;
      drawText(linkText, 40, linkDisplayY, 9, false, 'left', cfLinkBlue);
      addLinkAnnotation(pdfDoc, page, 40, height - linkDisplayY - 1, linkTextWidth, 10, paymentLink);
    }

    const decY = bankY + 115 + (paymentLink ? 16 : 0);
    drawRect(40, decY, width - 80, 105, bgLight, borderGray);
    drawText('Statutory Declarations:', 55, decY + 20, 9, true, 'left', black);
    drawText("1. GST Exemption: We hereby declare that our aggregate turnover is below the statutory registration threshold", 55, decY + 35, 8, false, 'left', textDark);
    drawText("   prescribed under Section 22 of the CGST Act, 2017. Hence, GST is not applicable on this invoice.", 55, decY + 47, 8, false, 'left', textDark);
    
    if (client.isExport) {
        drawText("2. Export of Service: This supply qualifies as an 'Export of Services' as defined under Section 2(6) of the", 55, decY + 62, 8, false, 'left', textDark);
        drawText("   IGST Act, 2017. The recipient and place of supply are located outside India.", 55, decY + 74, 8, false, 'left', textDark);
    } else {
        drawText("2. Nature of Supply: This invoice represents a domestic supply of services within the territory of India.", 55, decY + 62, 8, false, 'left', textDark);
    }
    drawText("3. MSME Status: The service provider is a registered Micro Enterprise under the MSMED Act, 2006.", 55, decY + 89, 8, false, 'left', textDark);

    let metaString = `${profile.companyName} | PAN: ${profile.panNumber}`;
    if (profile.udyamNumber) metaString += ` | MSME: ${profile.udyamNumber}`;
    if (profile.gstin) metaString += ` | ${safeTaxIdLabel}: ${profile.gstin}`;

    let contactString = `${profile.email}`;
    if (profile.website) contactString = `${profile.website} | ${contactString}`;
    if (profile.phone) contactString += ` | ${profile.phone}`;

    drawRect(0, height - 60, width, 60, black);
    drawText(metaString, width / 2, height - 35, 9, false, 'center', white);
    drawText(contactString, width / 2, height - 20, 9, false, 'center', white);
  }

  // Save PDF to isolated folder
  const invoicesDir = path.join(process.cwd(), 'public', 'invoices', workspaceId);
  if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
  
  const pdfFilename = `${invoiceNumber.replace(/\//g, '_')}.pdf`;
  const pdfPath = path.join(invoicesDir, pdfFilename);
  
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(pdfPath, pdfBytes);

  return `/invoices/${workspaceId}/${pdfFilename}`;
}

export async function GET(request: Request) {
  try {
    // 1. CRON SECURITY AUTHENTICATION
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse("Unauthorized Cron Trigger", { status: 401 });
    }

    const today = new Date();
    
    // 2. FIND ALL DUE RETAINERS
    const dueRetainers = await prisma.retainer.findMany({
      where: {
        status: "ACTIVE",
        nextBillingDate: { lte: today }
      },
      include: { client: true }
    });

    if (dueRetainers.length === 0) {
      return NextResponse.json({ message: "No retainers due for processing today." });
    }

    const results = { successful: 0, failed: 0, logs: [] as string[] };

    // BATCH FETCH PROFILES (Fix N+1 query issue)
    const workspaceIds = Array.from(new Set(dueRetainers.map(r => r.workspaceId)));
    const profiles = await prisma.businessProfile.findMany({
      where: { workspaceId: { in: workspaceIds } },
      include: { workspace: true }
    });
    const profileMap = new Map();
    for (const p of profiles) {
      if (p.workspaceId) profileMap.set(p.workspaceId, p);
    }

    // 3. PROCESS EACH RETAINER INDIVIDUALLY (Sequential to maintain safe invoice numbering)
    for (const retainer of dueRetainers) {
      try {
        const workspaceId = retainer.workspaceId;
        const fy = getFY(today);
        const billingMonth = format(retainer.nextBillingDate, "MMMM yyyy");

        // Use Pre-fetched Business Profile for PDF Generation
        const profile = profileMap.get(workspaceId);

        if (!profile) {
          throw new Error("Business profile missing. Cannot generate PDF.");
        }

        // A. AUTO-SEQUENCE THE INVOICE NUMBER (Fixed: orderBy createdAt)
        const lastInvoice = await prisma.invoice.findFirst({
          where: { workspaceId, financialYear: fy },
          orderBy: { createdAt: 'desc' }
        });

        let sequence = 1;
        if (lastInvoice && lastInvoice.invoiceNumber) {
          // Fixed: Aligning cron split logic with manual generator ("/")
          const parts = lastInvoice.invoiceNumber.split('/');
          if (parts.length === 3 && !isNaN(parseInt(parts[2]))) {
            sequence = parseInt(parts[2]) + 1;
          }
        }
        // Fixed: Aligning cron format with manual generator
        const invoiceNumber = `INV/${fy}/${sequence.toString().padStart(3, '0')}`;

        // B. THE MAGIC TOGGLE (Smart Naming)
        let finalDescription = retainer.serviceName;
        if (retainer.autoAppendMonth) {
          finalDescription = `${retainer.serviceName} (${billingMonth})`;
        }

        const taxResolution = resolveTaxRate({
          countryCode: profile.workspace?.countryCode || "IN",
          isTaxExempt: Boolean(retainer.client.isExport),
          serviceTaxRates: [(retainer as any).taxRate ?? null],
          workspaceDefaultTaxRate: (profile as any).defaultTaxRate ?? null,
        });
        if (taxResolution.requiresUserInput) {
          throw new Error(
            `Missing tax rate configuration for retainer ${retainer.id}. Please set a workspace default tax rate from UI.`
          );
        }
        const totals = calculateInvoiceTotals({
          services: [{ amount: decimalToNumber(retainer.amount) }],
          isTaxExempt: Boolean(retainer.client.isExport),
          defaultTaxRate: taxResolution.taxRate,
        });

        // --- PAYMENT LINK GENERATION (PRO ONLY) ---
        let paymentLink: string | null = null;
        const isProPlan = profile.workspace?.planTier === "PRO";
        const baseCurrency = profile.workspace?.baseCurrency || 'INR';
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 7);

        if (isProPlan) {
          const defaultGateway = (profile as any).defaultGateway || 'RAZORPAY';

          if (
            defaultGateway === 'RAZORPAY' &&
            baseCurrency === 'INR' &&
            (profile as any).razorpayKeyId &&
            (profile as any).razorpayKeySecret
          ) {
            try {
              const { decrypt }                   = await import('@/lib/encryption');
              const { generateTenantPaymentLink } = await import('@/lib/razorpay-links');
              const decryptedSecret = decrypt((profile as any).razorpayKeySecret);

              paymentLink = await generateTenantPaymentLink({
                amount:          totals.total,
                currency:        baseCurrency,
                description:     `Invoice ${invoiceNumber}`,
                invoiceDueDate:  dueDate,
                customerDetails: {
                  name:  retainer.client.name,
                  email: retainer.client.email ?? undefined,
                },
                tenantKeyId:     (profile as any).razorpayKeyId,
                tenantKeySecret: decryptedSecret,
              });
            } catch (rzpErr) {
              console.error('[cron] Razorpay link failed:', rzpErr);
            }
          } else if (
            defaultGateway === 'STRIPE' &&
            (profile as any).stripePublishableKey &&
            (profile as any).stripeSecretKey
          ) {
            try {
              const { decrypt }                   = await import('@/lib/encryption');
              const { generateStripePaymentLink } = await import('@/lib/stripe-links');
              const decryptedSecret = decrypt((profile as any).stripeSecretKey);

              paymentLink = await generateStripePaymentLink({
                amount:          totals.total,
                currency:        baseCurrency,
                description:     `Invoice ${invoiceNumber}`,
                invoiceNumber,
                tenantSecretKey: decryptedSecret,
              });
            } catch (stripeErr) {
              console.error('[cron] Stripe link failed:', stripeErr);
            }
          }
        }

        // C. GENERATE PHYSICAL PDF (Fixes Ghost PDF Issue)
        const relativePdfPath = await generateRetainerPDF(
          workspaceId, 
          retainer, 
          profile, 
          invoiceNumber, 
          billingMonth, 
          finalDescription,
          totals,
          paymentLink
        );

        // D. EXECUTE DATABASE TRANSACTION
        await prisma.$transaction(async (tx) => {
          
          // Create the Invoice pointing to the real generated PDF
          await tx.invoice.create({
            data: {
              workspaceId,
              clientId: retainer.clientId,
              invoiceNumber,
              financialYear: fy,
              billingMonth,
              invoiceDate: today,
              clientName: retainer.client.name,
              sacCode: retainer.sacCode,
              serviceDescription: finalDescription,
              subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2),
              taxRate: totals.taxRate,
              taxAmount: toDecimal(totals.taxAmount).toDecimalPlaces(2),
              grandTotal: toDecimal(totals.total).toDecimalPlaces(2),
              taxMode: totals.taxMode,
              totalAmount: toDecimal(totals.total).toDecimalPlaces(2),
              status: "Pending",
              pdfPath: relativePdfPath, 
            } as any
          });

          // --- SMART DATE LOGIC ---
          let nextDate = new Date(retainer.nextBillingDate);
          const wasLastDay = isLastDayOfMonth(nextDate);

          if (retainer.frequency === 'MONTHLY') nextDate = addMonths(nextDate, 1);
          else if (retainer.frequency === 'QUARTERLY') nextDate = addMonths(nextDate, 3);
          else if (retainer.frequency === 'ANNUALLY') nextDate = addYears(nextDate, 1);

          if (wasLastDay) nextDate = endOfMonth(nextDate);
          if (isWeekend(nextDate)) nextDate = previousFriday(nextDate);          
          
          await tx.retainer.update({
            where: { id: retainer.id },
            data: { nextBillingDate: nextDate }
          });
        });

        results.successful++;
        results.logs.push(`Successfully billed ${retainer.client.name} for ${finalDescription}`);

      } catch (err: any) {
        console.error(`Failed to process retainer ${retainer.id}:`, err);
        results.failed++;
        results.logs.push(`FAILED: ${retainer.client.name} - ${err.message}`);
      }
    }

    // 4. RETURN SUMMARY REPORT
    return NextResponse.json({
      message: "Cron execution complete",
      stats: {
        processed: dueRetainers.length,
        successful: results.successful,
        failed: results.failed
      },
      logs: results.logs
    });

  } catch (error) {
    console.error("Cron Execution Error:", error);
    return NextResponse.json({ error: "Failed to execute automated billing" }, { status: 500 });
  }
}
