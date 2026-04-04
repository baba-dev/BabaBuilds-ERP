import { PDFDocument, rgb, degrees, StandardFonts, PDFName, PDFArray } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export interface RenderInvoiceOptions {
  profile: any;
  client: any;
  invoice: {
    invoiceNumber: string;
    invoiceDate: Date;
    billingMonth: string;
    totalAmount: number;
    status?: string | null;
    dateReceived?: Date | null;
  };
  services: any[];
  sacCode: string | null;
  paymentLink?: string | null;
  theme: 'DESIGN_1' | 'DESIGN_2';
  isFreePlan: boolean;
  baseCurrency: string;
  userLocale: string;
}

/**
 * Shared PDF Rendering Engine for BabaERP Invoices
 * Consolidates Design 1 & Design 2 logic to ensure consistency across 
 * new generations and bulk maintenance updates.
 */
export async function renderInvoiceToBytes(options: RenderInvoiceOptions): Promise<Uint8Array> {
  const { 
    profile, client, invoice, services, sacCode, 
    paymentLink, theme, isFreePlan, baseCurrency, userLocale 
  } = options;

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595.28, 841.89]); // A4
  const { height, width } = page.getSize();
  
  const font        = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const black      = rgb(0, 0, 0); 
  const white      = rgb(1, 1, 1);
  const textDark   = rgb(0.1, 0.1, 0.1); 
  const textMuted  = rgb(0.25, 0.25, 0.25); // Darkened for contrast
  const bgLight    = rgb(0.96, 0.96, 0.96); 
  const borderGray = rgb(0.85, 0.85, 0.85);
  const cfOrange   = rgb(0.95, 0.50, 0.12); 
  const cfLinkBlue = rgb(0, 0.33, 0.70);  

  const drawText = (text: string, x: number, y: number, size: number, isBold = false, align = 'left', color = textDark, isItalic = false) => {
    let currentFont = isBold ? fontBold : (isItalic ? fontOblique : font);
    let textX = x;
    if (align === 'right')  textX = x - currentFont.widthOfTextAtSize(text, size);
    else if (align === 'center') textX = x - (currentFont.widthOfTextAtSize(text, size) / 2);
    page.drawText(text, { x: textX, y: height - y, size, font: currentFont, color });
  };

  const drawRect = (x: number, y: number, w: number, h: number, color: any, borderColor?: any) => {
    page.drawRectangle({ x, y: height - y - h, width: w, height: h, color, borderColor: borderColor || undefined, borderWidth: borderColor ? 1 : 0 });
  };

  const loadLogo = async (logoUrl: string | null, x: number, y: number, maxWidth: number, maxHeight: number, align = 'left') => {
    if (!logoUrl) return;
    try {
      const relativeLogoPath = logoUrl.startsWith('/') ? logoUrl.substring(1) : logoUrl;
      const fullPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativeLogoPath);
      if (fs.existsSync(fullPath)) {
        const image = await pdfDoc.embedPng(fs.readFileSync(fullPath));
        const dims  = image.scaleToFit(maxWidth, maxHeight);
        const drawX = align === 'right' ? x - dims.width : x;
        page.drawImage(image, { x: drawX, y: height - y - dims.height, width: dims.width, height: dims.height });
      }
    } catch (e) { console.log(`Logo load failed: ${logoUrl}`); }
  };

  const addLinkAnnotation = (x: number, absoluteY: number, rectWidth: number, rectHeight: number, url: string) => {
    const linkAnnotation = pdfDoc.context.obj({
      Type:    'Annot',
      Subtype: 'Link',
      Rect:    [x, absoluteY, x + rectWidth, absoluteY + rectHeight],
      Border:  [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: url },
    });
    const ref = pdfDoc.context.register(linkAnnotation);
    const annots = page.node.get(PDFName.of('Annots'));
    if (annots instanceof PDFArray) annots.push(ref);
    else page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([ref]));
  };

  const formattedTotal = invoice.totalAmount.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dueDate = new Date(invoice.invoiceDate);
  dueDate.setDate(dueDate.getDate() + 7);

  const headerTitle  = client.isExport ? 'EXPORT OF SERVICES' : 'TAX INVOICE';
  const subHeader    = client.isExport ? 'ZERO RATED SUPPLY' : 'DOMESTIC SUPPLY';
  const safeTaxIdLabel    = profile.taxIdLabel    || "VAT/GST Number";
  const safeRoutingLabel  = profile.routingLabel  || "IFSC Code";

  // --- DESIGN_2 Logic ---
  if (theme === "DESIGN_2") {
    const leftMargin  = 40;
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

    drawMeta("Invoice number", invoice.invoiceNumber);
    drawMeta("Date of issue", invoice.invoiceDate.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' }));
    drawMeta("Date due", dueDate.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' }));
    drawMeta(safeTaxIdLabel, profile.gstin || "N/A");
    drawMeta("Company name", profile.companyName);

    let billY = 170;
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

    let calloutY = 270;
    const bigDueText = `${baseCurrency} ${formattedTotal} due ${dueDate.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' })}`;
    drawText(bigDueText, leftMargin, calloutY, 14, true, 'left', black);
    drawText(`Service Classification: ${sacCode || 'N/A'}`, leftMargin, calloutY + 24, 9, false, 'left', textMuted);

    let tableY = 340;
    const qtyX   = rightMargin - 150;
    const priceX = rightMargin - 80;

    drawText("Description", leftMargin, tableY, 8, false, 'left', textDark);
    drawText("Qty",         qtyX,        tableY, 8, false, 'right', textDark);
    drawText("Unit price",  priceX,      tableY, 8, false, 'right', textDark);
    drawText("Amount",      rightMargin,  tableY, 8, false, 'right', textDark);

    page.drawLine({ start: { x: leftMargin, y: height - (tableY + 12) }, end: { x: rightMargin, y: height - (tableY + 12) }, thickness: 1, color: black });

    tableY += 30;
    services.forEach((service: any) => {
      const lineAmt = service.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 });
      drawText(service.title, leftMargin, tableY, 9, false, 'left', black);
      drawText(`${service.nicDetails || "Billing period"}: ${invoice.billingMonth}`, leftMargin, tableY + 14, 8, false, 'left', textDark);
      drawText("1",       qtyX,        tableY, 9, false, 'right', black);
      drawText(lineAmt,   priceX,      tableY, 9, false, 'right', black);
      drawText(lineAmt,   rightMargin, tableY, 9, false, 'right', black);
      tableY += 35; 
    });

    tableY += 10;
    const subtotal = services.reduce((sum: number, service: any) => sum + service.amount, 0);
    const estimatedTax = client.isExport ? 0 : subtotal * 0.18;
    const totalsLeftMargin = rightMargin - 200;

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText("Subtotal", priceX, tableY + 15, 9, false, 'right', textDark);
    drawText(subtotal.toLocaleString(userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, false, 'right', black);
    tableY += 20;

    if (!client.isExport) {
      page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
      drawText("Tax (18%)", priceX, tableY + 15, 9, false, 'right', textDark);
      drawText(estimatedTax.toLocaleString(userLocale, { minimumFractionDigits: 2 }), rightMargin, tableY + 15, 9, false, 'right', black);
      tableY += 20;
    }

    page.drawLine({ start: { x: totalsLeftMargin, y: height - tableY }, end: { x: rightMargin, y: height - tableY }, thickness: 0.5, color: borderGray });
    drawText("Amount due", priceX, tableY + 15, 9, true, 'right', black);
    drawText(`${baseCurrency} ${formattedTotal}`, rightMargin, tableY + 15, 9, true, 'right', black);

    let footerY = tableY + 60;
    drawText(`If this request is concerning an invoice reach out to ${profile.email || 'billing'}. For all other concerns, contact support.`, leftMargin, footerY, 8, false, 'left', textDark);

    footerY += 40;
    drawText(`Pay ${baseCurrency} ${formattedTotal} with a bank transfer`, leftMargin, footerY, 10, true, 'left', black);
    drawText("Bank transfers can take up to two business days. To pay via bank transfer, transfer funds using the following bank information.", leftMargin, footerY + 16, 8, false, 'left', black);

    footerY += 45;
    const drawBankDetail = (label: string, value: string) => {
      if (!value) return;
      drawText(label, leftMargin, footerY, 9, false, 'left', textDark);
      drawText(value, leftMargin + 100, footerY, 9, false, 'left', black);
      footerY += 14;
    };

    drawBankDetail("Bank name",      profile.bankName);
    drawBankDetail("Account Name",   profile.accountName);
    drawBankDetail("Account number", profile.accountNumber);
    drawBankDetail(safeRoutingLabel, profile.ifscCode);
    drawBankDetail("Reference",      invoice.invoiceNumber);

    if (paymentLink) {
      footerY += 8;
      const linkText = `Pay securely online: ${paymentLink}`;
      const linkTextWidth = font.widthOfTextAtSize(linkText, 9);
      drawText(linkText, leftMargin, footerY, 9, false, 'left', cfLinkBlue);
      addLinkAnnotation(leftMargin, height - footerY - 1, linkTextWidth, 10, paymentLink);
    }

    page.drawLine({ start: { x: leftMargin, y: 45 }, end: { x: rightMargin, y: 45 }, thickness: 0.5, color: borderGray });
    drawText("Page 1 of 1", rightMargin, height - 30, 8, false, 'right', textMuted);

  } else {
    // --- DESIGN_1 Logic ---
    if (profile.logoUrl) await loadLogo(profile.logoUrl, 40, 30, 180, 45); 
    else drawText(profile.companyName, 40, 50, 18, true, 'left', black);

    drawText('INVOICE',    width - 40, 45, 24, true,  'right', black);
    drawText(headerTitle,  width - 40, 60, 10, true,  'right', textMuted);
    drawText(subHeader,    width - 40, 72, 8,  false, 'right', textMuted, true);
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
    drawText(client.name,     320, 165, 11, true,  'left', black);
    
    const clientAddrParts = client.address.split(', ');
    const splitPoint = Math.ceil(clientAddrParts.length * 0.4); 
    const clientLine1 = clientAddrParts.slice(0, splitPoint).join(', ');
    const clientLine2 = clientAddrParts.slice(splitPoint).join(', ');
    drawText(clientLine1,  320, 180, 9,  false, 'left', textMuted);
    if (clientLine2) drawText(clientLine2,  320, 195, 9,  false, 'left', textMuted);
    drawText(client.country,  320, clientLine2 ? 210 : 195, 10, true,  'left', textDark);

    drawRect(40, 215, width - 80, 60, bgLight, borderGray); 
    drawText('Invoice No:',     55,  235, 9,  true,  'left', textMuted);
    drawText(invoice.invoiceNumber, 115, 235, 10, true,  'left', black);
    drawText('Date:',           250, 235, 9,  true,  'left', textMuted);
    drawText(invoice.invoiceDate.toLocaleDateString(userLocale), 280, 235, 10, true, 'left', black);
    drawText('Billing Month:',  390, 235, 9,  true,  'left', textMuted);
    drawText(invoice.billingMonth, 465, 235, 10, true,  'left', black);

    drawText('Place of Supply:',  55,  258, 9,  true,  'left', textMuted);
    drawText(`${client.country} (${client.isExport ? 'Export' : 'Domestic'})`, 135, 258, 10, true, 'left', black);
    drawText('Tax Identification:', 390, 258, 9,  true,  'left', textMuted);
    drawText(client.taxId || 'N/A', 475, 258, 10, true, 'left', black);

    drawRect(40, 290, width - 80, 25, black);
    drawText('Classification',          50,       307, 9, true, 'left',  white);
    drawText('Description of Services', 180,      307, 9, true, 'left',  white);
    drawText(`Amount (${baseCurrency})`, width - 50, 307, 9, true, 'right', white);
    
    let currentY = 335; 
    services.forEach((service: any) => {
      const lineAmt = service.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 });
      drawText(sacCode || 'N/A', 50,        currentY,      10, false, 'left',  textDark);
      drawText(service.title, 180,       currentY,      10, true,  'left',  black);
      drawText(`(${service.nicDetails} for ${invoice.billingMonth})`, 180, currentY + 18, 8, false, 'left', textMuted);
      drawText(lineAmt,       width - 50, currentY,     10, false, 'right', textDark);
      currentY += 45; 
    });

    const dividerY = currentY - 10;
    page.drawLine({ start: { x: 40, y: height - dividerY }, end: { x: width - 40, y: height - dividerY }, thickness: 1, color: borderGray });

    drawText('CGST (0%)',  width - 150, currentY + 10, 9, false, 'right', textMuted);
    drawText('0.00',       width - 50,  currentY + 10, 10, false, 'right', textDark);
    drawText('SGST (0%)',  width - 150, currentY + 25, 9, false, 'right', textMuted);
    drawText('0.00',       width - 50,  currentY + 25, 10, false, 'right', textDark);
    drawText(client.isExport ? 'IGST - Export (0%)' : 'IGST - Domestic (0%)', width - 150, currentY + 40, 9, false, 'right', textMuted);
    drawText('0.00',       width - 50,  currentY + 40, 10, false, 'right', textDark);

    drawRect(width - 230, currentY + 70, 190, 35, black);
    drawText('Total Amount',            width - 165, currentY + 92, 11, true, 'right', white);
    drawText(`${baseCurrency} ${formattedTotal}`, width - 55, currentY + 92, 11, true, 'right', white);

    const bankY = currentY + 100;
    drawText('Bank Details for Remittance', 40, bankY,      10, true,  'left', black);
    drawText(`Bank Name: ${profile.bankName}`,       40, bankY + 20, 9,  false, 'left', textDark);
    drawText(`Account Name: ${profile.accountName}`, 40, bankY + 35, 9,  false, 'left', textDark);
    drawText(`Account No: ${profile.accountNumber}`, 40, bankY + 50, 9,  true,  'left', black);
    drawText(`${safeRoutingLabel}: ${profile.ifscCode}`, 40, bankY + 65, 9, false, 'left', textDark);

    drawText(`For ${profile.companyName}`, width - 40, bankY + 20, 10, true, 'right', black);
    if (profile.signatureUrl) await loadLogo(profile.signatureUrl, width - 40, bankY + 30, 140, 35, 'right');
    page.drawLine({ start: { x: width - 180, y: height - (bankY + 70) }, end: { x: width - 40, y: height - (bankY + 70) }, thickness: 1, color: black });
    drawText('Authorized Signatory', width - 40, bankY + 85, 9, false, 'right', textMuted);

    if (paymentLink) {
      const linkTitle = "Pay securely online:";
      const titleWidth = fontBold.widthOfTextAtSize(linkTitle, 9);
      const linkDisplayY = bankY + 105;
      drawText(linkTitle, 40, linkDisplayY, 9, true, 'left', black);
      drawText(paymentLink, 40 + titleWidth + 5, linkDisplayY, 9, false, 'left', cfLinkBlue);
      addLinkAnnotation(40 + titleWidth + 5, height - linkDisplayY - 1, font.widthOfTextAtSize(paymentLink, 9), 10, paymentLink);
    }

    const decY = bankY + 120 + (paymentLink ? 15 : 0);
    drawRect(40, decY, width - 80, 105, bgLight, borderGray);
    drawText('Statutory Declarations:', 55, decY + 20, 9, true, 'left', black);
    drawText("1. GST Exemption: We hereby declare that our aggregate turnover is below the statutory registration threshold prescribed under Section 22 of the CGST Act, 2017. Hence, GST is not applicable on this invoice.", 55, decY + 35, 8, false, 'left', textDark);
    if (client.isExport) {
        drawText("2. Export of Service: This supply qualifies as an 'Export of Services' as defined under Section 2(6) of the IGST Act, 2017. The recipient and place of supply are located outside India.", 55, decY + 62, 8, false, 'left', textDark);
    } else {
        drawText("2. Nature of Supply: This invoice represents a domestic supply of services within the territory of India.", 55, decY + 62, 8, false, 'left', textDark);
    }
    drawText("3. MSME Status: The service provider is a registered Micro Enterprise under the MSMED Act, 2006.", 55, decY + 89, 8, false, 'left', textDark);

    drawRect(0, height - 60, width, 60, black);
    drawText(`${profile.companyName} | PAN: ${profile.panNumber}${profile.udyamNumber ? ` | MSME: ${profile.udyamNumber}` : ''}${profile.gstin ? ` | ${safeTaxIdLabel}: ${profile.gstin}` : ''}`, width / 2, height - 35, 9, false, 'center', white);
    drawText(`${profile.website ? `${profile.website} | ` : ''}${profile.email}${profile.phone ? ` | ${profile.phone}` : ''}`, width / 2, height - 20, 9, false, 'center', white);
  }

  if (isFreePlan) {
    drawText("This Receipt was prepared on erp.bababuilds.com | Make yours.", width / 2, height - 15, 7, false, 'center', rgb(0.5, 0.5, 0.5), true);
  }

  // --- WATERMARK HANDLER (for already paid invoices during regeneration) ---
  if (['Paid', 'PAID'].includes(invoice.status as string)) {
    const existingContents = page.node.get(PDFName.of('Contents'));
    page.node.delete(PDFName.of('Contents'));

    const stampDate = invoice.dateReceived || invoice.invoiceDate;
    const formattedDate = new Date(stampDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    
    // Draw Watermark
    const xPaid = (width / 2) - (fontBold.widthOfTextAtSize('PAID', 130) / 2) * cos45 + (130 * 0.7 / 2) * sin45;
    const yPaid = (height / 2) - (fontBold.widthOfTextAtSize('PAID', 130) / 2) * sin45 - (130 * 0.7 / 2) * cos45;
    page.drawText('PAID', { x: xPaid, y: yPaid, size: 130, font: fontBold, color: rgb(0.85, 0.15, 0.15), opacity: 0.10, rotate: degrees(45) });

    const centerRecX = (width / 2) + 80 * sin45;
    const centerRecY = (height / 2) - 80 * cos45;
    const xRec = centerRecX - (fontBold.widthOfTextAtSize(`RECEIVED: ${formattedDate}`, 24) / 2) * cos45 + (24 * 0.7 / 2) * sin45;
    const yRec = centerRecY - (fontBold.widthOfTextAtSize(`RECEIVED: ${formattedDate}`, 24) / 2) * sin45 - (24 * 0.7 / 2) * cos45;
    page.drawText(`RECEIVED: ${formattedDate}`, { x: xRec, y: yRec, size: 24, font: fontBold, color: rgb(0.85, 0.15, 0.15), opacity: 0.10, rotate: degrees(45) });

    const watermarkContents = page.node.get(PDFName.of('Contents'));
    const finalContents = pdfDoc.context.obj([]);
    const append = (item: any) => {
      if (item instanceof PDFArray) item.asArray().forEach(s => (finalContents as any).push(s));
      else if (item) (finalContents as any).push(item);
    };
    append(watermarkContents);
    append(existingContents);
    page.node.set(PDFName.of('Contents'), finalContents);
  }

  return await pdfDoc.save();
}
