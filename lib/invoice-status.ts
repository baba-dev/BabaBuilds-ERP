import type { InvoiceStatus } from "@prisma/client";

export const INVOICE_STATUS = {
  PENDING: "PENDING",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
} as const;

export type InvoiceStatusValue = InvoiceStatus | (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

const LEGACY_TO_CANONICAL: Record<string, InvoiceStatusValue> = {
  pending: INVOICE_STATUS.PENDING,
  partially_paid: INVOICE_STATUS.PARTIALLY_PAID,
  "partially paid": INVOICE_STATUS.PARTIALLY_PAID,
  paid: INVOICE_STATUS.PAID,
};

export function toInvoiceStatus(status: unknown): InvoiceStatusValue {
  if (typeof status !== "string") return INVOICE_STATUS.PENDING;
  const normalized = status.trim().toLowerCase();
  return LEGACY_TO_CANONICAL[normalized] ?? INVOICE_STATUS.PENDING;
}

export function isPaidInvoiceStatus(status: unknown): boolean {
  return toInvoiceStatus(status) === INVOICE_STATUS.PAID;
}

export function isOpenInvoiceStatus(status: unknown): boolean {
  return !isPaidInvoiceStatus(status);
}

export function getInvoiceStatusBadgeKey(status: unknown): "status_paid" | "status_partial" | "status_pending" {
  const canonical = toInvoiceStatus(status);
  if (canonical === INVOICE_STATUS.PAID) return "status_paid";
  if (canonical === INVOICE_STATUS.PARTIALLY_PAID) return "status_partial";
  return "status_pending";
}
