import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import fs from 'fs';
import path from 'path';
import { INVOICE_STATUS, toInvoiceStatus, type InvoiceStatusValue } from '@/lib/invoice-status';
import {
  acquireFinancialIdempotency,
  buildRequestHash,
  consumeFinancialIdempotency,
  releaseFinancialIdempotency,
} from '@/lib/financial-idempotency';

import { 
  getWorkspaceId,
  determineInvoicePaymentStatus, 
  validatePayInvoicePayload, 
  validatePaymentBusinessRules 
} from './logic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  let idempotencyContext: { workspaceId: string; operation: string; idempotencyKey: string } | null = null;
  let idempotencyConsumed = false;
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = getWorkspaceId(session);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const invoiceId = id; 
    
    const body = await request.json();
    const payloadValidation = validatePayInvoicePayload(body);
    if (!payloadValidation.ok) {
      return NextResponse.json(
        { success: false, error: payloadValidation.error },
        { status: 400 }
      );
    }
    const { amountReceived, dateReceived } = payloadValidation.data;
    const incomingPayment = amountReceived;
    const operation = 'INVOICE_PAYMENT_CAPTURE';
    const idempotencyKey =
      request.headers.get('Idempotency-Key')?.trim() ||
      body?.idempotencyKey?.trim() ||
      `auto:${invoiceId}:${amountReceived}:${dateReceived}`;
    const requestHash = buildRequestHash({ invoiceId, amountReceived, dateReceived });
    const idempotencyAcquire = await acquireFinancialIdempotency({
      workspaceId,
      operation,
      idempotencyKey,
      requestHash,
    });
    idempotencyContext = { workspaceId, operation, idempotencyKey };

    if (idempotencyAcquire.kind === 'hash_mismatch') {
      return NextResponse.json(
        { success: false, error: { code: 'IDEMPOTENCY_HASH_MISMATCH', message: 'Idempotency key reuse with different payload is not allowed.' } },
        { status: 409 },
      );
    }
    if (idempotencyAcquire.kind === 'in_progress') {
      return NextResponse.json(
        { success: false, error: { code: 'REQUEST_IN_PROGRESS', message: 'A payment request with this key is already in progress.' } },
        { status: 409 },
      );
    }
    if (idempotencyAcquire.kind === 'replay') {
      return NextResponse.json({ ...(idempotencyAcquire.responseBody as object), replayed: true });
    }
    const transitionResult = await prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.invoice.findFirst({
        where: {
          id: invoiceId,
          workspaceId: workspaceId,
        },
        include: {
          items: true,
        },
      });

      if (!existingInvoice) {
        return { kind: 'not_found' as const };
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
        return { kind: 'invalid' as const, error: businessRuleValidation.error };
      }

      const newStatus = determineInvoicePaymentStatus(newCumulativeReceived, invoiceGrandTotal);
      const updateResult = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          workspaceId,
          status: existingInvoice.status as InvoiceStatusValue,
          amountReceived: existingInvoice.amountReceived,
        },
        data: {
          status: toInvoiceStatus(newStatus),
          amountReceived: newCumulativeReceived,
          dateReceived: new Date(dateReceived),
        },
      });
      if (updateResult.count === 0) {
        return { kind: 'write_conflict' as const };
      }

      const updatedInvoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

      const becamePaidNow = newStatus === INVOICE_STATUS.PAID && existingInvoice.status !== INVOICE_STATUS.PAID;

      if (becamePaidNow && existingInvoice.items && existingInvoice.items.length > 0) {
        for (const item of existingInvoice.items) {
          if (item.productId) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (product) {
              const newStock = product.currentStock - item.quantity;
              await tx.product.update({
                where: { id: item.productId },
                data: {
                  currentStock: newStock,
                  status: newStock <= 0 ? "OUT_OF_STOCK" : (newStock <= product.safetyStock ? "LOW_STOCK" : "IN_STOCK"),
                },
              });
              await tx.inventoryMovement.create({
                data: {
                  workspaceId,
                  productId: item.productId,
                  type: "OUT",
                  quantity: -item.quantity,
                  reason: `Invoice #${updatedInvoice.invoiceNumber} Payment`,
                  referenceId: updatedInvoice.id,
                },
              });
            }
          }
        }
      }
      return { kind: 'ok' as const, existingInvoice, updatedInvoice, newStatus };
    });

    if (transitionResult.kind === 'not_found') {
      return NextResponse.json(
        { success: false, error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found or unauthorized' } },
        { status: 404 },
      );
    }
    if (transitionResult.kind === 'invalid') {
      return NextResponse.json({ success: false, error: transitionResult.error }, { status: 400 });
    }
    if (transitionResult.kind === 'write_conflict') {
      return NextResponse.json(
        { success: false, error: { code: 'WRITE_CONFLICT_RETRY', message: 'Concurrent payment update detected. Retry with the same idempotency key.' } },
        { status: 409 },
      );
    }

    const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
    const { existingInvoice, updatedInvoice, newStatus } = transitionResult;

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

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'invoice', action: 'payment', error: String(error) });
    }

    const responseBody = { success: true, invoice: updatedInvoice };
    await consumeFinancialIdempotency({
      workspaceId,
      operation,
      idempotencyKey,
      responseBody,
    });
    idempotencyConsumed = true;
    return NextResponse.json(responseBody);
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
  finally {
    if (idempotencyContext && !idempotencyConsumed) {
      await releaseFinancialIdempotency(idempotencyContext);
    }
  }
}
