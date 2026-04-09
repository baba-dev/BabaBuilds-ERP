import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { INVOICE_STATUS, toInvoiceStatus, type InvoiceStatusValue } from '@/lib/invoice-status';
import { parseInvoicePaymentPayload } from '@/lib/types/business';

import { 
  getWorkspaceId,
  determineInvoicePaymentStatus, 
  validatePayInvoicePayload, 
  validatePaymentBusinessRules 
} from './logic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = getWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const invoiceId = id; 
    
    const payloadValidation = validatePayInvoicePayload(await request.json());
    if (!payloadValidation.ok) {
      return NextResponse.json(
        { success: false, error: payloadValidation.error },
        { status: 400 }
      );
    }
    const { amountReceived, dateReceived } = payloadValidation.data;
    const incomingPayment = amountReceived;

    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        workspaceId: workspaceId,
      },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found or unauthorized' },
        },
        { status: 404 }
      );
    }

    const existingReceived = Number(existingInvoice.amountReceived ?? 0);
    const newCumulativeReceived = existingReceived + incomingPayment;
    const invoiceGrandTotal = Number(existingInvoice.grandTotal ?? existingInvoice.totalAmount);

    const businessRuleValidation = validatePaymentBusinessRules({
      invoiceStatus: existingInvoice.status,
      cumulativeAmountReceived: newCumulativeReceived,
      invoiceGrandTotal,
    });
    if (!businessRuleValidation.ok) {
      return NextResponse.json(
        { success: false, error: businessRuleValidation.error },
        { status: 400 }
      );
    }

    const newStatus = determineInvoicePaymentStatus(newCumulativeReceived, invoiceGrandTotal);

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: toInvoiceStatus(newStatus),
        amountReceived: newCumulativeReceived,
        dateReceived: new Date(dateReceived),
      },
    });

    const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');

    if (newStatus === INVOICE_STATUS.PAID && existingInvoice.status !== INVOICE_STATUS.PAID) {
      let relativePath = updatedInvoice.pdfPath.startsWith('/')
        ? updatedInvoice.pdfPath.substring(1)
        : updatedInvoice.pdfPath;
      let fullPdfPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativePath);

      let fileExists = fs.existsSync(fullPdfPath);

      if (!fileExists) {
        const sanitizedFilename = (updatedInvoice.invoiceNumber || "").replace(/\//g, '_') + ".pdf";
        const sanitizedRelative = `invoices/${updatedInvoice.workspaceId}/${sanitizedFilename}`;
        const sanitizedFull = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', sanitizedRelative);

        if (fs.existsSync(sanitizedFull)) {
          fullPdfPath = sanitizedFull;
          relativePath = sanitizedRelative;
          fileExists = true;

          await prisma.invoice.update({
            where: { id: updatedInvoice.id },
            data: { pdfPath: `/${sanitizedRelative}` },
          });
        }
      }

      if (fileExists) {
        const existingPdfBytes = fs.readFileSync(fullPdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const pages = pdfDoc.getPages();
        const paymentDateObj = new Date(dateReceived);
        const formattedDate = paymentDateObj.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).toUpperCase();

        pages.forEach(page => {
          const { width, height } = page.getSize();

          page.drawText('PAID', {
            x: width / 2 - 140,
            y: height / 2 - 50,
            size: 130,
            font: fontBold,
            color: rgb(0.85, 0.15, 0.15),
            opacity: 0.10,
            rotate: degrees(45),
          });

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
        fs.writeFileSync(fullPdfPath, pdfBytes);
      }
    }

    return NextResponse.json({ success: true, invoice: updatedInvoice });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'PAYMENT_PROCESSING_FAILED', message: 'Failed to process payment' },
      },
      { status: 500 }
    );
  }
}
