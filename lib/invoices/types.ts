/**
 * Client-safe invoice DTOs shared by /api/invoices/* and the /income UI.
 * Money is always a decimal string (never a float) in the invoice's own currency unless named `base*`.
 */

export const INVOICE_SOURCES = ["MANUAL", "PROPOSAL", "RETAINER", "POS", "SHOP", "API"] as const;
export type InvoiceSourceValue = (typeof INVOICE_SOURCES)[number];

export const PAYMENT_METHODS = ["BANK_TRANSFER", "UPI", "CARD", "CASH", "CHEQUE", "PAYMENT_LINK", "OTHER"] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export type StoredInvoiceStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "VOID";
/** OVERDUE is derived (open + past due date); it is never stored. */
export type InvoiceDisplayStatus = StoredInvoiceStatus | "OVERDUE";

export type InvoiceListItemDto = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  clientId: string | null;
  clientName: string;
  currency: string;
  exchangeRate: string;
  grandTotal: string;
  amountReceived: string;
  balance: string;
  /** grandTotal converted to the workspace base currency. */
  baseGrandTotal: string;
  status: StoredInvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
  /** Positive = days late (open invoices only). */
  daysOverdue: number | null;
  source: InvoiceSourceValue;
  sourceProposalId: string | null;
  paymentLinkGateway: string | null;
  hasPaymentLink: boolean;
  sentAt: string | null;
  lastReminderSentAt: string | null;
  createdAt: string;
  pdfPath: string;
};

export type InvoicePaymentDto = {
  id: string;
  amount: string;
  receivedAt: string;
  method: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
};

export type InvoiceEventDto = {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
};

export type CreditNoteDto = {
  id: string;
  creditNoteNumber: string;
  amount: string;
  reason: string;
  issuedAt: string;
};

export type InvoiceItemDto = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string;
  taxRate: number | null;
  totalAmount: string;
  sacCode: string | null;
};

export type InvoiceDetailDto = InvoiceListItemDto & {
  billingMonth: string;
  financialYear: string;
  subtotal: string;
  taxAmount: string;
  taxRate: number;
  taxMode: string;
  serviceDescription: string;
  voidedAt: string | null;
  voidReason: string | null;
  withholdingAmount: string | null;
  items: InvoiceItemDto[];
  payments: InvoicePaymentDto[];
  events: InvoiceEventDto[];
  creditNotes: CreditNoteDto[];
};

export type InvoiceListMeta = {
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
  /** Count per display status for the current filters (ignoring the status filter itself). */
  statusCounts: Record<InvoiceDisplayStatus, number>;
};

export type InvoiceListResponse = { data: InvoiceListItemDto[]; meta: InvoiceListMeta };

export type InvoiceSummaryDto = {
  period: { from: string; to: string; label: string };
  baseCurrency: string;
  billed: string;
  billedPrevious: string;
  collected: string;
  collectedPrevious: string;
  outstanding: string;
  overdue: string;
  notYetDue: string;
  overdueCount: number;
  openCount: number;
  /** Average days from invoice date to final payment for invoices fully paid in the period; null if none. */
  avgDaysToPay: number | null;
  /** Billed in the period per currency, in invoice currency (for multi-currency workspaces). */
  billedByCurrency: Array<{ currency: string; amount: string }>;
  taxEstimate: {
    eligible: boolean;
    enabled: boolean;
    ratePercent: number;
    /** collected-in-period × rate; only present when enabled. */
    estimatedIncome: string | null;
    thresholdLabel: string | null;
    /** Aggregate turnover for the FY used for the threshold; only when eligible. */
    fyTurnover: string | null;
    threshold: string | null;
    thresholdPercent: number | null;
  };
};
