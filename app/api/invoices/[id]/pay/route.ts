import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // Await params in Next.js 15+ 
    const { id } = await context.params;
    const invoiceId = id; 
    
    const { amountReceived, dateReceived } = await request.json();
    const paymentAmount = Number(amountReceived);

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
    let newStatus = 'Paid';
    if (paymentAmount > 0 && paymentAmount < existingInvoice.totalAmount) {
      newStatus = 'Partially Paid';
    } else if (paymentAmount === 0) {
      newStatus = 'Pending';
    }

    // 4. UPDATE DATABASE
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId }, 
      data: {
        status: newStatus,
        amountReceived: paymentAmount,
        dateReceived: new Date(dateReceived),
      }
    });

    // 5. APPLY "PAID" WATERMARK TO PDF (ONLY IF FULLY PAID)
    if (newStatus === 'Paid') {
      // Robust path resolution for VPS/Windows
      const relativePath = updatedInvoice.pdfPath.startsWith('/') 
        ? updatedInvoice.pdfPath.substring(1) 
        : updatedInvoice.pdfPath;
      const pdfPath = path.join(process.cwd(), 'public', relativePath);
      
      if (fs.existsSync(pdfPath)) {
        const existingPdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();

        // Draw the massive, translucent red stamp
        firstPage.drawText('PAID', {
          x: width / 2 - 140, 
          y: height / 2 - 50, 
          size: 130,
          color: rgb(0.85, 0.15, 0.15), 
          opacity: 0.15, 
          rotate: degrees(45),
        });

        // Add the Date Received below PAID
        const paymentDateObj = new Date(dateReceived);
        const formattedDate = paymentDateObj.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).toUpperCase();

        firstPage.drawText(`RECEIVED: ${formattedDate}`, {
          x: width / 2 - 110, 
          y: height / 2 - 130, 
          size: 24,
          color: rgb(0.85, 0.15, 0.15), 
          opacity: 0.15, 
          rotate: degrees(45),
        });

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(pdfPath, pdfBytes); // Overwrite the file
      }
    }

    return NextResponse.json({ success: true, invoice: updatedInvoice });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
  }
}