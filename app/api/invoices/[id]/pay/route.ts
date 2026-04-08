import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { INVOICE_STATUS, toInvoiceStatus, type InvoiceStatusValue } from '@/lib/invoice-status';
import { parseInvoicePaymentPayload } from '@/lib/types/business';

const getWorkspaceId = (session: unknown) => {
  if (!session || typeof session !== "object") return null;
  const workspaceId = (session as { workspaceId?: unknown }).workspaceId;
  return typeof workspaceId === "string" ? workspaceId : null;
};

const determineInvoicePaymentStatus = (
  paymentAmount: number,
  invoiceGrandTotal: number
): InvoiceStatusValue => {
  if (paymentAmount > 0 && paymentAmount < invoiceGrandTotal) {
    return INVOICE_STATUS.PARTIALLY_PAID;
  }

  if (paymentAmount === 0) {
    return INVOICE_STATUS.PENDING;
  }

  return INVOICE_STATUS.PAID;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    const workspaceId = getWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params in Next.js 15+ 
    const { id } = await context.params;
    const invoiceId = id; 
    
    const parsedPayload = parseInvoicePaymentPayload(await request.json());
    if (!parsedPayload) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    const { amountReceived, dateReceived } = parsedPayload;
    const paymentAmount = amountReceived;

    // 2. FETCH EXISTING INVOICE & VERIFY OWNERSHIP
    const existingInvoice = await prisma.invoice.findFirst({
      where: { 
        id: invoiceId,
        workspaceId: workspaceId 
      }
    });

    if (!existingInvoice) {
      return NextResponse.json({ error: 'Invoice not found or unauthorized' }, { status: 404 });
    }

    // 3. SMART STATUS DETERMINATION
    // Compare the new payment amount against the total bill
    const invoiceGrandTotal = Number(existingInvoice.grandTotal ?? existingInvoice.totalAmount);
    const newStatus = determineInvoicePaymentStatus(paymentAmount, invoiceGrandTotal);

    // 4. UPDATE DATABASE
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId }, 
      data: {
        status: toInvoiceStatus(newStatus),
        amountReceived: paymentAmount,
        dateReceived: new Date(dateReceived),
      }
    });

    const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
    
    // 5. APPLY "PAID" WATERMARK TO PDF (ONLY IF FULLY PAID)
    if (newStatus === INVOICE_STATUS.PAID) {
      // Robust path resolution for VPS/Windows
      let relativePath = updatedInvoice.pdfPath.startsWith('/') 
        ? updatedInvoice.pdfPath.substring(1) 
        : updatedInvoice.pdfPath;
      let fullPdfPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativePath);
      
      let fileExists = fs.existsSync(fullPdfPath);

      // --- 🔍 FUZZY PATH FINDER (For cross-platform / historical paths) ---
      if (!fileExists) {
        const sanitizedFilename = (updatedInvoice.invoiceNumber || "").replace(/\//g, '_') + ".pdf";
        const sanitizedRelative = `invoices/${updatedInvoice.workspaceId}/${sanitizedFilename}`;
        const sanitizedFull     = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', sanitizedRelative);
        
        if (fs.existsSync(sanitizedFull)) {
            fullPdfPath = sanitizedFull;
            relativePath = sanitizedRelative;
            fileExists = true;
            
            // Auto-heal the database path while we're here
            await prisma.invoice.update({
              where: { id: updatedInvoice.id },
              data: { pdfPath: `/${sanitizedRelative}` }
            });
        }
      }

      if (fileExists) {
        const existingPdfBytes = fs.readFileSync(fullPdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        // 🚨 CRITICAL FIX: Embed font explicitly for existing documents
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        const pages = pdfDoc.getPages();
        const paymentDateObj = new Date(dateReceived);
        const formattedDate = paymentDateObj.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).toUpperCase();

        // Apply to ALL pages in case of multi-page invoices
        pages.forEach(page => {
          const { width, height } = page.getSize();

          // Draw the massive, translucent red stamp
          page.drawText('PAID', {
            x: width / 2 - 140, 
            y: height / 2 - 50, 
            size: 130,
            font: fontBold,
            color: rgb(0.85, 0.15, 0.15), 
            opacity: 0.10, 
            rotate: degrees(45),
          });

          // Add the Date Received below PAID
          page.drawText(`RECEIVED: ${formattedDate}`, {
            x: width / 2 - 110, 
            y: height / 2 - 130, 
            size: 24,
            font: fontBold,
            color: rgb(0.85, 0.15, 0.15), 
            opacity: 0.10, 
            rotate: degrees(45),
          });
        });

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(fullPdfPath, pdfBytes); // Overwrite the file
      }
    }

    return NextResponse.json({ success: true, invoice: updatedInvoice });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
  }
}
