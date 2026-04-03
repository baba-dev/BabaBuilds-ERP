import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { PDFDocument, PDFPage, PDFArray, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';
import { Prisma } from "@prisma/client";

const lookupAsync = promisify(dns.lookup);

async function resolveSafeIp(host: string): Promise<string | null> {
  try {
    if (host.toLowerCase() === 'localhost') return null;

    const { address } = await lookupAsync(host);

    if (address.startsWith('127.')) return null; 
    if (address.startsWith('10.')) return null; 
    if (address.startsWith('192.168.')) return null; 
    if (address.startsWith('169.254.')) return null; 
    if (address === '0.0.0.0') return null;

    if (address.startsWith('172.')) {
      const secondOctet = parseInt(address.split('.')[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return null;
    }

    if (address === '::1') return null;
    if (address.toLowerCase().startsWith('fe80:')) return null;

    return address; 
  } catch (e) {
    return null; 
  }
}

/**
 * Adds a real, clickable URI annotation (PDF /Annot /Subtype /Link) to a page.
 * This is NOT just coloured text — PDF viewers will treat it as a hyperlink.
 *
 * @param pdfDoc       The PDFDocument instance
 * @param page         The PDFPage to annotate
 * @param x            Left edge of the clickable rect (PDF coordinate, origin = bottom-left)
 * @param absoluteY    Bottom edge of the clickable rect (PDF coord — height - displayY)
 * @param rectWidth    Width of the clickable zone in points
 * @param rectHeight   Height of the clickable zone in points
 * @param url          The destination URL
 */
function addLinkAnnotation(
  pdfDoc: PDFDocument,
  page: PDFPage,
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
    Border:  [0, 0, 0], // Invisible border — the coloured text itself is the visual cue
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

export async function POST(request: Request) {
  let generatedPdfPath = ""; 

  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const body = await request.json();
    const { clientId, billingMonth, sacCode, services, customDate, sendEmail } = body;

    if (!clientId) return NextResponse.json({ error: "No client selected." }, { status: 400 });
    if (!Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: "No services provided." }, { status: 400 });
    }
    
    // --- 🚨 SECURITY PATCH: Prevent NaN Poisoning ---
    const sanitizedServices = services.map((s: any) => {
      const amt = Number(s.amount);
      if (isNaN(amt) || amt < 0) {
        throw new Error(`Invalid amount detected for service: ${s.title}`);
      }
      return { ...s, amount: amt };
    });

    const totalAmount = sanitizedServices.reduce((sum: number, service: any) => sum + service.amount, 0);
    const serviceDesc = sanitizedServices.map((s: any) => s.title).join(" + ");

    // --- 🚨 SECURITY PATCH: Prevent Double-Click Race Conditions (Idempotency) ---
    const recentDuplicate = await prisma.invoice.findFirst({
      where: {
        workspaceId,
        clientId,
        totalAmount,
        serviceDescription: serviceDesc,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) }
      }
    });

    if (recentDuplicate) {
      return NextResponse.json({ 
        error: "Duplicate request detected. An identical invoice was generated less than a minute ago." 
      }, { status: 429 });
    }

    // 2. FETCH CLIENT
    const client = await prisma.client.findFirst({ 
      where: { id: clientId, workspaceId } 
    });
    if (!client) return NextResponse.json({ error: "Selected client does not exist in your CRM." }, { status: 404 });

    // 3. FETCH PROFILE & WORKSPACE
    const profile = await prisma.businessProfile.findUnique({ 
      where: { workspaceId },
      include: { workspace: true }
    });
    if (!profile) return NextResponse.json({ error: "Business profile missing. Please complete Settings Wizard." }, { status: 400 });

    const isFreePlan     = profile.workspace?.planTier === "FREE";
    const isProPlan      = !isFreePlan;
    const userLocale     = profile.workspace?.countryCode === "IN" ? "en-IN" : "en-US";
    const invoiceTheme   = (profile as any).invoiceTheme || "DESIGN_1";
    const baseCurrency   = profile.workspace?.baseCurrency || 'INR';

    const date    = customDate ? new Date(customDate) : new Date();
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 7);

    const formattedTotal = totalAmount.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const currentMonth = date.getMonth() + 1; 
    const currentYear  = date.getFullYear();
    const shortYear    = currentYear.toString().slice(-2);
    let fy = currentMonth <= 3
      ? `${parseInt(shortYear) - 1}-${shortYear}`
      : `${shortYear}-${parseInt(shortYear) + 1}`;

    // --- ATOMIC RETRY LOGIC FOR SEQUENCE CONCURRENCY ---
    let newInvoice;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    
    let currentInvoiceNumber = "";
    let finalPdfFilename = "";
    let finalPdfPath = "";

    while (attempts < MAX_ATTEMPTS) {
      try {
        // 4. ISOLATED SEQUENCING
        const lastInvoice = await prisma.invoice.findFirst({
          where: { financialYear: fy, workspaceId },
          orderBy: { createdAt: 'desc' }, 
        });

        let sequence = 1;
        if (lastInvoice && lastInvoice.invoiceNumber) {
          const parts = lastInvoice.invoiceNumber.split('/');
          if (parts.length === 3 && !isNaN(parseInt(parts[2]))) {
            sequence = parseInt(parts[2]) + 1;
          }
        }
        const invoiceNumber = `INV/${fy}/${sequence.toString().padStart(3, '0')}`;
        currentInvoiceNumber = invoiceNumber;
        
        // 5. NAMESPACED PDF STORAGE
        const invoicesDir = path.join(process.cwd(), 'public', 'invoices', workspaceId);
        if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
        
        const pdfFilename  = `${invoiceNumber.replace(/\//g, '_')}.pdf`;
        finalPdfFilename   = pdfFilename;
        const pdfPath      = path.join(invoicesDir, pdfFilename);
        finalPdfPath       = pdfPath;
        generatedPdfPath   = pdfPath;
        const relativePdfPath = `/invoices/${workspaceId}/${pdfFilename}`; 

        // ── SMART PAYMENT GATEWAY ROUTER (PRO only) ────────────────────────────
        let paymentLink: string | null = null;

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
                amount:          totalAmount,
                currency:        baseCurrency,
                description:     `Invoice ${invoiceNumber}`,
                invoiceDueDate:  dueDate,
                customerDetails: {
                  name:  client.name,
                  email: client.email ?? undefined,
                },
                tenantKeyId:     (profile as any).razorpayKeyId,
                tenantKeySecret: decryptedSecret,
              });
            } catch (rzpErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Razorpay link generation failed (non-fatal):', rzpErr);
              paymentLink = null;
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
                amount:          totalAmount,    // in major units — service converts to smallest unit internally
                currency:        baseCurrency,   // passes locale currency accurately for correct unit math
                description:     `Invoice ${invoiceNumber}`,
                invoiceNumber,
                tenantSecretKey: decryptedSecret,
              });
            } catch (stripeErr) {
              // Non-fatal — PDF still generates without the link
              console.error('[generate] Stripe link generation failed (non-fatal):', stripeErr);
              paymentLink = null;
            }
          }
        }
        // ──────────────────────────────────────────────────────────────────────

        // --- PDF GENERATION ENGINE ---
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
            const fullPath = path.join(process.cwd(), 'public', logoUrl);
            if (fs.existsSync(fullPath)) {
              const image = await pdfDoc.embedPng(fs.readFileSync(fullPath));
              const dims  = image.scaleToFit(maxWidth, maxHeight);
              const drawX = align === 'right' ? x - dims.width : x;
              page.drawImage(image, { x: drawX, y: height - y - dims.height, width: dims.width, height: dims.height });
            }
          } catch (e) { console.log(`Logo load failed: ${logoUrl}`); }
        };

        const headerTitle  = client.isExport ? 'EXPORT OF SERVICES' : 'TAX INVOICE';
        const subHeader    = client.isExport ? 'ZERO RATED SUPPLY' : 'DOMESTIC SUPPLY';
        const safeTaxIdLabel    = (profile as any).taxIdLabel    || "VAT/GST Number";
        const safeRoutingLabel  = (profile as any).routingLabel  || "IFSC Code";

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
          const currencyCode  = baseCurrency;
          const bigDueText    = `${currencyCode} ${formattedTotal} due ${dueDate.toLocaleDateString(userLocale, { month: 'long', day: 'numeric', year: 'numeric' })}`;
          drawText(bigDueText, leftMargin, calloutY, 14, true, 'left', black);
          
          let displaySac = sacCode;
          if (typeof sacCode === 'object' && sacCode !== null) {
            displaySac = (sacCode as any).code || (sacCode as any).value || (sacCode as any).label || JSON.stringify(sacCode);
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
          sanitizedServices.forEach((service: any) => {
            const lineAmt = service.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 });
            drawText(service.title, leftMargin, tableY, 9, false, 'left', black);
            drawText(`${service.nicDetails || "Billing period"}: ${billingMonth}`, leftMargin, tableY + 14, 8, false, 'left', textDark);
            drawText("1",       qtyX,        tableY, 9, false, 'right', black);
            drawText(lineAmt,   priceX,      tableY, 9, false, 'right', black);
            drawText(lineAmt,   rightMargin, tableY, 9, false, 'right', black);
            tableY += 35; 
          });

          tableY += 10;
          const subtotal     = sanitizedServices.reduce((sum: number, service: any) => sum + service.amount, 0);
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

          drawBankDetail("Bank name",      profile.bankName);
          drawBankDetail("Account Name",   profile.accountName);
          drawBankDetail("Account number", profile.accountNumber);
          drawBankDetail(safeRoutingLabel, profile.ifscCode);
          drawBankDetail("Reference",      invoiceNumber);

          // ── DESIGN_2: Razorpay payment link (PRO only) ──────────────────────
          if (paymentLink) {
            footerY += 8; // small gap after bank details

            const linkText  = `Pay securely online: ${paymentLink}`;
            const linkTextWidth = font.widthOfTextAtSize(linkText, 9);

            drawText(linkText, leftMargin, footerY, 9, false, 'left', cfLinkBlue);

            // Real URI action annotation (makes text clickable in any PDF viewer)
            addLinkAnnotation(
              pdfDoc,
              page,
              leftMargin,
              height - footerY - 1,  // absoluteY: convert display-Y → PDF-Y (bottom of text)
              linkTextWidth,
              10,                    // aprox glyph height at size 9
              paymentLink
            );

            footerY += 16;
          }
          // ─────────────────────────────────────────────────────────────────────

          page.drawLine({ start: { x: leftMargin, y: 45 }, end: { x: rightMargin, y: 45 }, thickness: 0.5, color: borderGray });
          drawText("Page 1 of 1", rightMargin, height - 30, 8, false, 'right', textMuted);

        } else {
          // ── DESIGN_1 (Classic / Cloudflare layout) ────────────────────────────
          const currencyCode = baseCurrency;
          
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
          const clientLine1 = clientAddrParts.slice(0, Math.ceil(clientAddrParts.length / 2)).join(', ');
          const clientLine2 = clientAddrParts.slice(Math.ceil(clientAddrParts.length / 2)).join(', ');
          drawText(clientLine1,  320, 180, 9,  false, 'left', textMuted);
          if (clientLine2) drawText(clientLine2,  320, 195, 9,  false, 'left', textMuted);
          
          drawText(client.country,  320, clientLine2 ? 210 : 195, 10, true,  'left', textDark);

          drawRect(40, 220, width - 80, 50, bgLight, borderGray); 
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

          drawRect(40, 290, width - 80, 25, black);
          drawText('Classification',          50,       307, 9, true, 'left',  white);
          drawText('Description of Services', 180,      307, 9, true, 'left',  white);
          drawText(`Amount (${currencyCode})`, width - 50, 307, 9, true, 'right', white);
          
          let currentY = 335; 
          
          let displaySac = sacCode;
          if (typeof sacCode === 'object' && sacCode !== null) {
            displaySac = (sacCode as any).code || (sacCode as any).value || (sacCode as any).label || JSON.stringify(sacCode);
          }
          const safeSac = displaySac && displaySac.length > 25 ? displaySac.substring(0, 23) + '...' : (displaySac || 'N/A');

          sanitizedServices.forEach((service: any) => {
            const lineAmt = service.amount.toLocaleString(userLocale, { minimumFractionDigits: 2 });
            drawText(safeSac,       50,        currentY,      10, false, 'left',  textDark);
            drawText(service.title, 180,       currentY,      10, true,  'left',  black);
            drawText(`(${service.nicDetails} for ${billingMonth})`, 180, currentY + 15, 8, false, 'left', textMuted);
            drawText(lineAmt,       width - 50, currentY,     10, false, 'right', textDark);
            currentY += 40; 
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
          drawText(`${currencyCode} ${formattedTotal}`, width - 55, currentY + 92, 11, true, 'right', white);

          const bankY = currentY + 130;
          drawText('Bank Details for Remittance', 40, bankY,      10, true,  'left', black);
          drawText(`Bank Name: ${profile.bankName}`,       40, bankY + 20, 9,  false, 'left', textDark);
          drawText(`Account Name: ${profile.accountName}`, 40, bankY + 35, 9,  false, 'left', textDark);
          drawText(`Account No: ${profile.accountNumber}`, 40, bankY + 50, 9,  true,  'left', black);
          drawText(`${safeRoutingLabel}: ${profile.ifscCode}`, 40, bankY + 65, 9, false, 'left', textDark);

          drawText(`For ${profile.companyName}`, width - 40, bankY + 20, 10, true, 'right', black);
          if ((profile as any).signatureUrl) {
            await loadLogo((profile as any).signatureUrl, width - 40, bankY + 30, 140, 35, 'right');
          }
          page.drawLine({ start: { x: width - 180, y: height - (bankY + 70) }, end: { x: width - 40, y: height - (bankY + 70) }, thickness: 1, color: black });
          drawText('Authorized Signatory', width - 40, bankY + 85, 9, false, 'right', textMuted);

          // ── DESIGN_1: Razorpay payment link (PRO only) ───────────────────────
          if (paymentLink) {
            const linkText  = `Pay securely online: ${paymentLink}`;
            const linkTextWidth = font.widthOfTextAtSize(linkText, 9);

            // Inserted between Authorized Signatory (bankY+85) and the Declaration box
            const linkDisplayY = bankY + 100;
            drawText(linkText, 40, linkDisplayY, 9, false, 'left', cfLinkBlue);

            addLinkAnnotation(
              pdfDoc,
              page,
              40,
              height - linkDisplayY - 1,  // absoluteY: PDF-space Y (origin at bottom)
              linkTextWidth,
              10,
              paymentLink
            );
          }
          // ─────────────────────────────────────────────────────────────────────

          const decY = bankY + 115 + (paymentLink ? 16 : 0); // shift declaration box down if link was added
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
          if (profile.gstin)       metaString += ` | ${safeTaxIdLabel}: ${profile.gstin}`;

          let contactString = `${profile.email}`;
          if (profile.website) contactString = `${profile.website} | ${contactString}`;
          if (profile.phone)   contactString += ` | ${profile.phone}`;

          drawRect(0, height - 60, width, 60, black);
          drawText(metaString,    width / 2, height - 35, 9, false, 'center', white);
          drawText(contactString, width / 2, height - 20, 9, false, 'center', white);
        }

        if (isFreePlan) {
          drawText(
            "This Receipt was prepared on erp.bababuilds.com | Make yours.", 
            width / 2,           
            height - 15,         
            7,                   
            false,               
            'center',            
            rgb(0.5, 0.5, 0.5),  
            true                 
          );
        }

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(pdfPath, pdfBytes);

        // 6. SAVE TO DB
        newInvoice = await prisma.invoice.create({
          data: {
            workspaceId, 
            invoiceNumber, financialYear: fy, billingMonth, invoiceDate: date, 
            clientName: client.name, clientId: client.id,
            sacCode: typeof sacCode === 'string' ? sacCode : JSON.stringify(sacCode), 
            serviceDescription: serviceDesc, 
            totalAmount, pdfPath: relativePdfPath,
          },
        });

        break;

      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          attempts++;
          console.warn(`Sequence collision on attempt ${attempts}. Retrying...`);
          if (generatedPdfPath && fs.existsSync(generatedPdfPath)) {
            fs.unlinkSync(generatedPdfPath);
          }
          continue; 
        }
        throw err; 
      }
    }

    if (!newInvoice) {
      throw new Error("Could not generate a unique invoice number after multiple attempts.");
    }

    // --- EMAIL DELIVERY LOGIC ---
    let emailStatus = "Not requested";
    
    if (sendEmail) {
      if (!client.email) {
        emailStatus = "Failed: Client has no email address on file.";
      } else if (!profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
        emailStatus = "Failed: SMTP Server not configured in Settings.";
      } else {
        const safeIp = await resolveSafeIp(profile.smtpHost);
        
        if (!safeIp) {
          emailStatus = "Failed: Invalid or internal SMTP Host blocked by security policy.";
          console.error(`Blocked SSRF attempt in SMTP configuration: ${profile.smtpHost}`);
        } else {
          try {
            const transporter = nodemailer.createTransport({
              host:   safeIp, 
              port:   profile.smtpPort || 587,
              secure: profile.smtpPort === 465, 
              tls:    { servername: profile.smtpHost },
              auth:   { user: profile.smtpUser, pass: profile.smtpPassword },
            });

            const mailOptions = {
              from:    `"${profile.companyName}" <${profile.smtpFromEmail || profile.smtpUser}>`,
              to:      client.email,
              subject: `Invoice ${currentInvoiceNumber} from ${profile.companyName}`,
              text:    `Dear ${client.name},\n\nPlease find attached the invoice ${currentInvoiceNumber} for the billing month of ${billingMonth}.\n\nTotal Amount Billed: ${baseCurrency} ${formattedTotal}\n\nThank you for your business.\n\nBest Regards,\n${profile.companyName}`,
              attachments: [{ filename: finalPdfFilename, path: finalPdfPath }],
            };

            await transporter.sendMail(mailOptions);
            emailStatus = "Success";
          } catch (emailErr: any) {
            console.error("Email Error:", emailErr);
            emailStatus = `Failed: ${emailErr.message}`;
          }
        }
      }
    }

    return NextResponse.json({ success: true, invoice: newInvoice, emailStatus });

  } catch (error: any) {
    console.error("Invoice Generation Error:", error);
    
    if (generatedPdfPath && fs.existsSync(generatedPdfPath)) {
      try {
        fs.unlinkSync(generatedPdfPath);
        console.log(`🧹 Cleaned up orphaned PDF file after failure: ${generatedPdfPath}`);
      } catch (cleanupError) {
        console.error("Failed to delete orphaned file:", cleanupError);
      }
    }

    return NextResponse.json({ error: error.message || 'Failed to generate invoice' }, { status: 400 });
  }
}