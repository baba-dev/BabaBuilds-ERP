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

    const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
    
    // 5. APPLY "PAID" WATERMARK TO PDF (ONLY IF FULLY PAID)
    if (newStatus === 'Paid') {
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
        for (const page of pages) {
          const { width, height } = page.getSize();
          
          // 🚨 WATERMARK LAYERING TRICK: 
          // We capture existing contents, draw the watermark, then swap order to put watermark BEHIND.
          const { PDFName, PDFArray } = await import('pdf-lib');
          const existingContents = page.node.get(PDFName.of('Contents'));
          page.node.delete(PDFName.of('Contents'));

          const paymentDateObj = new Date(dateReceived);
          const formattedDate = paymentDateObj.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }).toUpperCase();

          const cos45 = Math.cos(Math.PI / 4);
          const sin45 = Math.sin(Math.PI / 4);
          const centerX = width / 2;
          const centerY = height / 2;

          // --- 1. Draw "PAID" Stamp ---
          const textPaid = 'PAID';
          const sizePaid = 130;
          const wPaid = fontBold.widthOfTextAtSize(textPaid, sizePaid);
          const hPaid = sizePaid * 0.7; // Approximate ascent height

          // Center calculation for rotated text: 
          // We want the midpoint of the text baseline to be at page center, minus some offsets for visual balance.
          const xPaid = centerX - (wPaid / 2) * cos45 + (hPaid / 2) * sin45;
          const yPaid = centerY - (wPaid / 2) * sin45 - (hPaid / 2) * cos45;

          page.drawText(textPaid, {
            x: xPaid,
            y: yPaid,
            size: sizePaid,
            font: fontBold,
            color: rgb(0.85, 0.15, 0.15), 
            opacity: 0.10, 
            rotate: degrees(45),
          });

          // --- 2. Draw "RECEIVED: [DATE]" Stamp ---
          const textRec = `RECEIVED: ${formattedDate}`;
          const sizeRec = 24;
          const wRec = fontBold.widthOfTextAtSize(textRec, sizeRec);
          const hRec = sizeRec * 0.7;

          // Positioned below "PAID" in the rotated coordinate system (approx 80 units down)
          const verticalShift = 80;
          const centerRecX = centerX + verticalShift * sin45;
          const centerRecY = centerY - verticalShift * cos45;

          const xRec = centerRecX - (wRec / 2) * cos45 + (hRec / 2) * sin45;
          const yRec = centerRecY - (wRec / 2) * sin45 - (hRec / 2) * cos45;

          page.drawText(textRec, {
            x: xRec,
            y: yRec,
            size: sizeRec,
            font: fontBold,
            color: rgb(0.85, 0.15, 0.15), 
            opacity: 0.10, 
            rotate: degrees(45),
          });

          // --- 3. RE-APPLY ORIGINAL CONTENT ON TOP ---
          const watermarkContents = page.node.get(PDFName.of('Contents'));
          const finalContents = pdfDoc.context.obj([]);
          
          // Helper to merge content streams accurately
          const appendToFinal = (item: any) => {
            if (item instanceof PDFArray) {
              item.asArray().forEach(s => (finalContents as any).push(s));
            } else if (item) {
              (finalContents as any).push(item);
            }
          };

          appendToFinal(watermarkContents);
          appendToFinal(existingContents);
          
          page.node.set(PDFName.of('Contents'), finalContents);
        }

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