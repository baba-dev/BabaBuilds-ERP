import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { INVOICE_STATUS, toInvoiceStatus, type InvoiceStatusValue } from '@/lib/invoice-status';
import { parseInvoicePaymentPayload } from '@/lib/types/business';

type PaymentValidationErrorCode =
  | 'INVALID_PAYMENT_PAYLOAD'
  | 'INVOICE_STATUS_NOT_PAYABLE'
  | 'OVERPAYMENT_NOT_ALLOWED';

type ValidationError<TCode extends PaymentValidationErrorCode> = {
  ok: false;
  error: {
    code: TCode;
    message: string;
  };
};

type ValidationSuccess<TData = undefined> = TData extends undefined
  ? { ok: true }
  : { ok: true; data: TData };

type ValidationResult<TData = undefined, TCode extends PaymentValidationErrorCode = PaymentValidationErrorCode> =
  | ValidationSuccess<TData>
  | ValidationError<TCode>;

const getWorkspaceId = (session: unknown) => {
  if (!session || typeof session !== "object") return null;
  const workspaceId = (session as { workspaceId?: unknown }).workspaceId;
  return typeof workspaceId === "string" ? workspaceId : null;
};

export const determineInvoicePaymentStatus = (
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

export const validatePayInvoicePayload = (
  payload: unknown
): ValidationResult<{ amountReceived: number; dateReceived: string }, 'INVALID_PAYMENT_PAYLOAD'> => {
  const parsedPayload = parseInvoicePaymentPayload(payload);
  if (!parsedPayload) {
    return {
      ok: false,
      error: { code: 'INVALID_PAYMENT_PAYLOAD', message: 'Invalid request payload.' },
    };
  }

  const { amountReceived, dateReceived } = parsedPayload;
  const isValidDate = Number.isFinite(new Date(dateReceived).valueOf());
  const isValidAmount =
    Number.isFinite(amountReceived) && amountReceived >= 0 && amountReceived <= 1_000_000_000;

  if (!isValidDate || !isValidAmount) {
    return {
      ok: false,
      error: { code: 'INVALID_PAYMENT_PAYLOAD', message: 'Invalid request payload.' },
    };
  }

  return { ok: true, data: { amountReceived, dateReceived } };
};

export const validatePaymentBusinessRules = ({
  invoiceStatus,
  paymentAmount,
  invoiceGrandTotal,
  allowOverpayment = false,
}: {
  invoiceStatus: string;
  paymentAmount: number;
  invoiceGrandTotal: number;
  allowOverpayment?: boolean;
}): ValidationResult<undefined, 'INVOICE_STATUS_NOT_PAYABLE' | 'OVERPAYMENT_NOT_ALLOWED'> => {
  const payableStatuses = new Set<string>([INVOICE_STATUS.PENDING, INVOICE_STATUS.PARTIALLY_PAID]);
  if (!payableStatuses.has(invoiceStatus)) {
    return {
      ok: false,
      error: { code: 'INVOICE_STATUS_NOT_PAYABLE', message: 'Invoice is not payable in its current status.' },
    };
  }

  if (!allowOverpayment && paymentAmount > invoiceGrandTotal) {
    return {
      ok: false,
      error: { code: 'OVERPAYMENT_NOT_ALLOWED', message: 'Overpayment is not allowed.' },
    };
  }

  return { ok: true };
};

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
    const paymentAmount = amountReceived;

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

    // 3. SMART STATUS DETERMINATION
    // Compare the new payment amount against the total bill
    const invoiceGrandTotal = Number(existingInvoice.grandTotal ?? existingInvoice.totalAmount);
    const businessRuleValidation = validatePaymentBusinessRules({
      invoiceStatus: existingInvoice.status,
      paymentAmount,
      invoiceGrandTotal,
    });
    if (!businessRuleValidation.ok) {
      return NextResponse.json(
        { success: false, error: businessRuleValidation.error },
        { status: 400 }
      );
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
