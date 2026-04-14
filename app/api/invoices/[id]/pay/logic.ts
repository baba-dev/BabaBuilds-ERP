import { Prisma } from '@prisma/client';
import { INVOICE_STATUS, type InvoiceStatusValue } from '@/lib/invoice-status';
import { parseInvoicePaymentPayload } from '@/lib/types/business';

export type PaymentValidationErrorCode =
  | 'INVALID_PAYMENT_PAYLOAD'
  | 'INVOICE_STATUS_NOT_PAYABLE'
  | 'OVERPAYMENT_NOT_ALLOWED';

export type ValidationError<TCode extends PaymentValidationErrorCode> = {
  ok: false;
  error: {
    code: TCode;
    message: string;
  };
};

export type ValidationSuccess<TData = undefined> = TData extends undefined
  ? { ok: true }
  : { ok: true; data: TData };

export type ValidationResult<TData = undefined, TCode extends PaymentValidationErrorCode = PaymentValidationErrorCode> =
  | ValidationSuccess<TData>
  | ValidationError<TCode>;

export const getWorkspaceId = (session: unknown) => {
  if (!session || typeof session !== "object") return null;
  const workspaceId = (session as { workspaceId?: unknown }).workspaceId;
  return typeof workspaceId === "string" ? workspaceId : null;
};

/**
 * Determines the invoice payment status using Prisma.Decimal arithmetic to
 * avoid IEEE 754 floating-point errors on cumulative partial payments.
 *
 * A 1-paisa (0.005) tolerance is applied when comparing cumulative received
 * against the grand total — this handles legacy Float storage imprecision in
 * the amountReceived column without allowing meaningful overpayment.
 */
export const determineInvoicePaymentStatus = (
  cumulativeReceived: Prisma.Decimal,
  invoiceGrandTotal: Prisma.Decimal
): InvoiceStatusValue => {
  if (cumulativeReceived.lte(0)) {
    return INVOICE_STATUS.PENDING;
  }

  // 1-paisa tolerance: if the shortfall is less than half a paisa, treat as fully paid.
  const ONE_PAISA = new Prisma.Decimal('0.005');
  const shortfall = invoiceGrandTotal.minus(cumulativeReceived);
  if (shortfall.lte(ONE_PAISA)) {
    return INVOICE_STATUS.PAID;
  }

  return INVOICE_STATUS.PARTIALLY_PAID;
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

/**
 * Validates business rules using Prisma.Decimal to avoid float-equality issues
 * when checking whether a payment would exceed the invoice total.
 */
export const validatePaymentBusinessRules = ({
  invoiceStatus,
  cumulativeAmountReceived,
  invoiceGrandTotal,
  allowOverpayment = false,
}: {
  invoiceStatus: string;
  cumulativeAmountReceived: Prisma.Decimal;
  invoiceGrandTotal: Prisma.Decimal;
  allowOverpayment?: boolean;
}): ValidationResult<undefined, 'INVOICE_STATUS_NOT_PAYABLE' | 'OVERPAYMENT_NOT_ALLOWED'> => {
  const payableStatuses = new Set<string>([INVOICE_STATUS.PENDING, INVOICE_STATUS.PARTIALLY_PAID]);
  if (!payableStatuses.has(invoiceStatus)) {
    return {
      ok: false,
      error: { code: 'INVOICE_STATUS_NOT_PAYABLE', message: 'Invoice is not payable in its current status.' },
    };
  }

  // Allow a 1-paisa tolerance — compare strictly: overpayment means cumulative > total + 0.005
  const ONE_PAISA = new Prisma.Decimal('0.005');
  if (!allowOverpayment && cumulativeAmountReceived.gt(invoiceGrandTotal.plus(ONE_PAISA))) {
    return {
      ok: false,
      error: { code: 'OVERPAYMENT_NOT_ALLOWED', message: 'Overpayment is not allowed.' },
    };
  }

  return { ok: true };
};
