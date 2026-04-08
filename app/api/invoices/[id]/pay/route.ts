import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { INVOICE_STATUS, toInvoiceStatus, type InvoiceStatusValue } from '@/lib/invoice-status';
import { z } from 'zod';

const MAX_PAYMENT_AMOUNT = 1_000_000_000;
const PAYABLE_STATUSES = new Set<InvoiceStatusValue>([
  INVOICE_STATUS.PENDING,
  INVOICE_STATUS.PARTIALLY_PAID,
  INVOICE_STATUS.PAID,
]);

const payInvoiceSchema = z.object({
  amountReceived: z
    .number()
    .finite('amountReceived must be finite')
    .min(0, 'amountReceived must be >= 0')
    .max(MAX_PAYMENT_AMOUNT, `amountReceived must be <= ${MAX_PAYMENT_AMOUNT}`),
  dateReceived: z
    .string()
    .min(1, 'dateReceived is required')
    .refine(
      (value) =>
        /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value) &&
        !Number.isNaN(new Date(value).getTime()),
      'dateReceived must be a valid ISO date string'
    ),
  allowOverpayment: z.boolean().optional().default(false),
});

type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;

type PaymentValidationError = { code: string; message: string; details?: unknown };

export function validatePayInvoicePayload(payload: unknown):
  | { ok: true; data: PayInvoiceInput }
  | { ok: false; error: PaymentValidationError } {
  const parsed = payInvoiceSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PAYMENT_PAYLOAD',
        message: 'Payment payload validation failed',
        details: parsed.error.flatten(),
      },
    };
  }

  return { ok: true, data: parsed.data };
}

export function determineInvoicePaymentStatus(paymentAmount: number, invoiceGrandTotal: number): InvoiceStatusValue {
  if (paymentAmount > 0 && paymentAmount < invoiceGrandTotal) {
    return INVOICE_STATUS.PARTIALLY_PAID;
  }
  if (paymentAmount === 0) {
    return INVOICE_STATUS.PENDING;
  }
  return INVOICE_STATUS.PAID;
}

export function validatePaymentBusinessRules(params: {
  invoiceStatus: unknown;
  paymentAmount: number;
  invoiceGrandTotal: number;
  allowOverpayment?: boolean;
}): { ok: true } | { ok: false; error: PaymentValidationError } {
  if (!PAYABLE_STATUSES.has(params.invoiceStatus as InvoiceStatusValue)) {
    return {
      ok: false,
      error: {
        code: 'INVOICE_STATUS_NOT_PAYABLE',
        message: `Invoices in status "${String(params.invoiceStatus)}" cannot be paid`,
      },
    };
  }

  if (!params.allowOverpayment && params.paymentAmount > params.invoiceGrandTotal) {
    return {
      ok: false,
      error: {
        code: 'OVERPAYMENT_NOT_ALLOWED',
        message: 'Payment amount exceeds invoice total',
      },
    };
  }

  return { ok: true };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 }
      );
    }
    const workspaceId = (session as any).workspaceId;

    const { id } = await context.params;
    const invoiceId = id;

    const payloadValidation = validatePayInvoicePayload(await request.json());
    if (!payloadValidation.ok) {
      return NextResponse.json({ success: false, error: payloadValidation.error }, { status: 400 });
    }
    const { amountReceived: paymentAmount, dateReceived, allowOverpayment } = payloadValidation.data;

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

    const invoiceGrandTotal = Number((existingInvoice as any).grandTotal || existingInvoice.totalAmount);
    const businessRuleValidation = validatePaymentBusinessRules({
      invoiceStatus: existingInvoice.status,
      paymentAmount,
      invoiceGrandTotal,
      allowOverpayment,
    });
    if (!businessRuleValidation.ok) {
      return NextResponse.json({ success: false, error: businessRuleValidation.error }, { status: 400 });
    }

    const newStatus = determineInvoicePaymentStatus(paymentAmount, invoiceGrandTotal);

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: toInvoiceStatus(newStatus),
        amountReceived: paymentAmount,
        dateReceived: new Date(dateReceived),
      },
    });

    const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');

    if (newStatus === INVOICE_STATUS.PAID) {
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
