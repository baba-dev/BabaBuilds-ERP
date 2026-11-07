import { Prisma } from "@prisma/client";
import { serializeMoney, toDecimal } from "@/lib/money";
import type {
  CreditNoteDto,
  InvoiceDetailDto,
  InvoiceDisplayStatus,
  InvoiceEventDto,
  InvoiceItemDto,
  InvoiceListItemDto,
  InvoicePaymentDto,
  InvoiceSourceValue,
  StoredInvoiceStatus,
} from "@/lib/invoices/types";

const MS_PER_DAY = 86_400_000;

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  clientId: string | null;
  clientName: string;
  currency: string;
  exchangeRate: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  baseGrandTotal: Prisma.Decimal | null;
  amountReceived: Prisma.Decimal | null;
  status: string;
  source: string;
  sourceProposalId: string | null;
  providerGateway: string | null;
  providerPaymentLinkId: string | null;
  sentAt: Date | null;
  lastReminderSentAt: Date | null;
  createdAt: Date;
  pdfPath: string;
};

/** Legacy rows may carry grandTotal = 0 with the real total in totalAmount. */
export function effectiveTotal(row: { grandTotal: Prisma.Decimal; totalAmount: Prisma.Decimal }): Prisma.Decimal {
  const grand = toDecimal(row.grandTotal);
  return grand.gt(0) ? grand : toDecimal(row.totalAmount);
}

export function balanceOf(total: Prisma.Decimal, received: Prisma.Decimal, status: string): Prisma.Decimal {
  if (status === "VOID") return new Prisma.Decimal(0);
  return Prisma.Decimal.max(new Prisma.Decimal(0), total.minus(received)).toDecimalPlaces(2);
}

export function getDisplayStatus(status: string, dueDate: Date | null, balance: Prisma.Decimal, now = new Date()): InvoiceDisplayStatus {
  const stored = (["PENDING", "PARTIALLY_PAID", "PAID", "VOID"].includes(status) ? status : "PENDING") as StoredInvoiceStatus;
  if ((stored === "PENDING" || stored === "PARTIALLY_PAID") && dueDate && balance.gt(0) && dueDate.getTime() < startOfUtcDay(now)) {
    return "OVERDUE";
  }
  return stored;
}

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function toListItem(row: InvoiceRow, now = new Date()): InvoiceListItemDto {
  const total = effectiveTotal(row);
  const received = toDecimal(row.amountReceived);
  const balance = balanceOf(total, received, row.status);
  const displayStatus = getDisplayStatus(row.status, row.dueDate, balance, now);
  const base = row.baseGrandTotal ?? total.mul(toDecimal(row.exchangeRate));

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate.toISOString(),
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    clientId: row.clientId,
    clientName: row.clientName,
    currency: row.currency,
    exchangeRate: toDecimal(row.exchangeRate).toString(),
    grandTotal: serializeMoney(total),
    amountReceived: serializeMoney(received),
    balance: serializeMoney(balance),
    baseGrandTotal: serializeMoney(base),
    status: (["PENDING", "PARTIALLY_PAID", "PAID", "VOID"].includes(row.status) ? row.status : "PENDING") as StoredInvoiceStatus,
    displayStatus,
    daysOverdue:
      displayStatus === "OVERDUE" && row.dueDate
        ? Math.max(1, Math.floor((startOfUtcDay(now) - startOfUtcDay(row.dueDate)) / MS_PER_DAY))
        : null,
    source: row.source as InvoiceSourceValue,
    sourceProposalId: row.sourceProposalId,
    paymentLinkGateway: row.providerGateway,
    hasPaymentLink: Boolean(row.providerPaymentLinkId),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    lastReminderSentAt: row.lastReminderSentAt ? row.lastReminderSentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    pdfPath: row.pdfPath,
  };
}

type DetailRow = InvoiceRow & {
  billingMonth: string;
  financialYear: string;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  taxRate: number;
  taxMode: string;
  serviceDescription: string;
  voidedAt: Date | null;
  voidReason: string | null;
  withholdingAmount: Prisma.Decimal | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    taxRate: number | null;
    totalAmount: Prisma.Decimal;
    sacCode: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: Prisma.Decimal;
    receivedAt: Date;
    method: string;
    reference: string | null;
    notes: string | null;
    createdAt: Date;
    reversedAt: Date | null;
    reversalReason: string | null;
  }>;
  events: Array<{ id: string; type: string; message: string | null; createdAt: Date }>;
  creditNotes: Array<{ id: string; creditNoteNumber: string; amount: Prisma.Decimal; reason: string; issuedAt: Date }>;
};

export function toDetail(row: DetailRow, now = new Date()): InvoiceDetailDto {
  const items: InvoiceItemDto[] = row.items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: serializeMoney(item.unitPrice),
    taxRate: item.taxRate,
    totalAmount: serializeMoney(item.totalAmount),
    sacCode: item.sacCode,
  }));
  const payments: InvoicePaymentDto[] = row.payments.map((p) => ({
    id: p.id,
    amount: serializeMoney(p.amount),
    receivedAt: p.receivedAt.toISOString(),
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
    reversedAt: p.reversedAt ? p.reversedAt.toISOString() : null,
    reversalReason: p.reversalReason,
  }));
  const events: InvoiceEventDto[] = row.events.map((e) => ({
    id: e.id,
    type: e.type,
    message: e.message,
    createdAt: e.createdAt.toISOString(),
  }));
  const creditNotes: CreditNoteDto[] = row.creditNotes.map((c) => ({
    id: c.id,
    creditNoteNumber: c.creditNoteNumber,
    amount: serializeMoney(c.amount),
    reason: c.reason,
    issuedAt: c.issuedAt.toISOString(),
  }));

  return {
    ...toListItem(row, now),
    billingMonth: row.billingMonth,
    financialYear: row.financialYear,
    // Legacy rows (chat/seed/POS-era) may have no subtotal; derive it from the total.
    subtotal: serializeMoney(toDecimal(row.subtotal).gt(0) ? row.subtotal : effectiveTotal(row).minus(toDecimal(row.taxAmount))),
    taxAmount: serializeMoney(row.taxAmount),
    taxRate: row.taxRate,
    taxMode: row.taxMode,
    serviceDescription: row.serviceDescription,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidReason: row.voidReason,
    withholdingAmount: row.withholdingAmount ? serializeMoney(row.withholdingAmount) : null,
    items,
    payments,
    events,
    creditNotes,
  };
}
