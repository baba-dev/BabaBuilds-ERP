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
  cumulativeAmountReceived,
  invoiceGrandTotal,
  allowOverpayment = false,
}: {
  invoiceStatus: string;
  cumulativeAmountReceived: number;
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

  if (!allowOverpayment && cumulativeAmountReceived > invoiceGrandTotal) {
    return {
      ok: false,
      error: { code: 'OVERPAYMENT_NOT_ALLOWED', message: 'Overpayment is not allowed.' },
    };
  }

  return { ok: true };
};
