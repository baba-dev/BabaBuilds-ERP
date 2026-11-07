import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { INVOICE_STATUS, toInvoiceStatus } from "@/lib/invoice-status";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { resolveInvoicePdfStoragePath } from "@/lib/invoice/pdf-storage";
import { applyInvoiceStatusStamp, getInvoiceStampDescriptor } from "@/lib/invoice/pdf-stamp";
import { computeWithheldAmount, defaultDepositDueDate, deriveReturnPeriodKey } from "@/lib/tax/withholding";
import { appendTaxAuditEvent, newTaxCorrelationId } from "@/lib/tax/audit";
import { addInvoiceEvent } from "@/lib/invoices/events";
import { commitInvoiceStock, InvoiceStockError } from "@/lib/invoices/stock";
import { effectiveTotal } from "@/lib/invoices/serialize";
import type { PaymentMethodValue } from "@/lib/invoices/types";
import { determineInvoicePaymentStatus } from "@/app/api/invoices/[id]/pay/logic";

const HALF_PAISA = new Prisma.Decimal("0.005");

export type PaymentFailure = {
  ok: false;
  status: 400 | 404 | 409 | 429 | 502;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RecordPaymentInput = {
  workspaceId: string;
  userId: string;
  invoiceId: string;
  amount: number | string;
  receivedAt: Date;
  method: PaymentMethodValue;
  reference?: string | null;
  notes?: string | null;
  bankTransactionId?: string | null;
  /** Required: generated once per open dialog so retries are safe and genuine repeat payments are not dropped. */
  idempotencyKey: string;
  withholding?: {
    ratePercent: number | null;
    amount: number | null;
    deductedAt: Date | null;
    depositedAt: Date | null;
    depositDueAt: Date | null;
    returnPeriodKey: string | null;
  };
};

/** Sum of non-reversed payments. */
async function activePaymentTotal(tx: Prisma.TransactionClient, invoiceId: string) {
  const agg = await tx.invoicePayment.aggregate({
    where: { invoiceId, reversedAt: null },
    _sum: { amount: true },
  });
  return toDecimal(agg._sum.amount ?? 0);
}

/**
 * Other writers (payment-link webhooks, bank reconciliation, the sync cron, POS) set Invoice.amountReceived
 * directly. Before any ledger operation, give that money a row so the payment list always adds up.
 */
export async function reconcileLedger(
  tx: Prisma.TransactionClient,
  invoice: { id: string; workspaceId: string; amountReceived: Prisma.Decimal | null; dateReceived: Date | null; createdAt: Date },
) {
  const received = toDecimal(invoice.amountReceived ?? 0);
  const active = await activePaymentTotal(tx, invoice.id);
  const delta = received.minus(active).toDecimalPlaces(2);
  if (delta.gt(HALF_PAISA)) {
    await tx.invoicePayment.create({
      data: {
        workspaceId: invoice.workspaceId,
        invoiceId: invoice.id,
        amount: delta,
        receivedAt: invoice.dateReceived ?? invoice.createdAt,
        method: "OTHER",
        notes: "Imported from invoice record",
      },
    });
  }
  return received;
}

function statusForTotals(received: Prisma.Decimal, total: Prisma.Decimal) {
  return received.lte(0) ? INVOICE_STATUS.PENDING : determineInvoicePaymentStatus(received, total);
}

export async function recordInvoicePayment(
  input: RecordPaymentInput,
): Promise<
  | { ok: true; replayed: boolean; invoiceId: string; paymentId: string; status: string; becamePaid: boolean }
  | PaymentFailure
> {
  const amount = toDecimal(input.amount).toDecimalPlaces(2);
  if (!amount.gt(0)) {
    return { ok: false, status: 400, code: "INVALID_AMOUNT", message: "Amount must be greater than zero." };
  }
  if (Number.isNaN(input.receivedAt.getTime())) {
    return { ok: false, status: 400, code: "INVALID_DATE", message: "Invalid payment date." };
  }

  const existing = await prisma.invoicePayment.findUnique({
    where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey } },
    include: { invoice: { select: { status: true } } },
  });
  if (existing) {
    if (existing.invoiceId !== input.invoiceId || !toDecimal(existing.amount).equals(amount)) {
      return { ok: false, status: 409, code: "IDEMPOTENCY_HASH_MISMATCH", message: "Idempotency key was already used for a different payment." };
    }
    return { ok: true, replayed: true, invoiceId: existing.invoiceId, paymentId: existing.id, status: existing.invoice.status, becamePaid: false };
  }

  const correlationId = newTaxCorrelationId();
  let result:
    | { kind: "ok"; paymentId: string; status: string; becamePaid: boolean; statusChanged: boolean; invoice: Prisma.InvoiceGetPayload<object> }
    | { kind: "fail"; failure: PaymentFailure };

  try {
    result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: input.invoiceId, workspaceId: input.workspaceId } });
      if (!invoice) {
        return { kind: "fail" as const, failure: { ok: false, status: 404, code: "INVOICE_NOT_FOUND", message: "Invoice not found." } as PaymentFailure };
      }
      if (invoice.status === "VOID") {
        return { kind: "fail" as const, failure: { ok: false, status: 409, code: "INVOICE_VOID", message: "A voided invoice cannot receive payments." } as PaymentFailure };
      }

      const total = effectiveTotal(invoice);
      const alreadyReceived = await reconcileLedger(tx, invoice);
      const cumulative = alreadyReceived.plus(amount).toDecimalPlaces(2);
      if (cumulative.gt(total.plus(HALF_PAISA))) {
        return {
          kind: "fail" as const,
          failure: {
            ok: false,
            status: 400,
            code: "OVERPAYMENT_NOT_ALLOWED",
            message: "This payment is more than the remaining balance.",
            details: { remaining: total.minus(alreadyReceived).toDecimalPlaces(2).toFixed(2) },
          } as PaymentFailure,
        };
      }

      const payment = await tx.invoicePayment.create({
        data: {
          workspaceId: input.workspaceId,
          invoiceId: invoice.id,
          amount,
          receivedAt: input.receivedAt,
          method: input.method,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          bankTransactionId: input.bankTransactionId ?? null,
          idempotencyKey: input.idempotencyKey,
          createdByUserId: input.userId,
        },
      });

      const newStatus = toInvoiceStatus(statusForTotals(cumulative, total));
      const updated = await tx.invoice.updateMany({
        where: { id: invoice.id, workspaceId: input.workspaceId, status: invoice.status },
        data: { status: newStatus, amountReceived: cumulative, dateReceived: input.receivedAt },
      });
      if (updated.count === 0) {
        throw new ConcurrentInvoiceUpdateError();
      }

      const wh = input.withholding;
      if (wh?.deductedAt) {
        const computed = computeWithheldAmount({
          grossAmount: amount.toNumber(),
          ratePercent: wh.ratePercent,
          explicitWithheldAmount: wh.amount,
          deductedAt: wh.deductedAt,
        });
        const dueAt = wh.depositDueAt ?? defaultDepositDueDate(wh.deductedAt);
        if (computed && computed.gt(0)) {
          const event = await tx.withholdingEvent.create({
            data: {
              workspaceId: input.workspaceId,
              sourceType: "INVOICE_PAYMENT",
              sourceId: invoice.id,
              invoiceId: invoice.id,
              counterpartyName: invoice.clientName,
              grossAmount: amount,
              withheldAmount: computed,
              withholdingRatePercent: wh.ratePercent,
              deductedAt: wh.deductedAt,
              depositedAt: wh.depositedAt,
              depositDueAt: dueAt,
              returnPeriodKey: deriveReturnPeriodKey(wh.deductedAt, wh.returnPeriodKey),
              createdByUserId: input.userId,
            },
          });
          await appendTaxAuditEvent(tx, {
            workspaceId: input.workspaceId,
            eventType: "WITHHOLDING_RECORDED",
            correlationId,
            actorUserId: input.userId,
            entityType: "WithholdingEvent",
            entityId: event.id,
            payload: { invoiceId: invoice.id, returnPeriodKey: event.returnPeriodKey, withheldAmount: event.withheldAmount.toString() },
          });
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              withholdingRatePercent: wh.ratePercent,
              withholdingAmount: computed,
              withholdingDeductedAt: wh.deductedAt,
              withholdingDepositedAt: wh.depositedAt,
              withholdingDepositDueAt: dueAt,
            },
          });
        }
      }

      const becamePaid = newStatus === INVOICE_STATUS.PAID && invoice.status !== INVOICE_STATUS.PAID;
      // Legacy fallback: invoices issued before "stock leaves at issue" are committed on their first full payment.
      if (becamePaid) {
        await commitInvoiceStock(tx, { workspaceId: input.workspaceId, invoiceId: invoice.id, actorUserId: input.userId });
      }

      await addInvoiceEvent(tx, {
        workspaceId: input.workspaceId,
        invoiceId: invoice.id,
        type: "PAYMENT_RECORDED",
        message: `${amount.toFixed(2)} ${invoice.currency} received`,
        metadata: { paymentId: payment.id, method: input.method, reference: input.reference ?? null },
        actorUserId: input.userId,
      });

      const fresh = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      return {
        kind: "ok" as const,
        paymentId: payment.id,
        status: newStatus,
        becamePaid,
        statusChanged: newStatus !== toInvoiceStatus(invoice.status),
        invoice: fresh,
      };
    });
  } catch (error) {
    if (error instanceof InvoiceStockError) {
      return { ok: false, status: 409, code: "INSUFFICIENT_STOCK", message: `Not enough stock to complete this invoice${error.productName ? ` (${error.productName})` : ""}.` };
    }
    if (error instanceof ConcurrentInvoiceUpdateError) {
      return { ok: false, status: 409, code: "WRITE_CONFLICT_RETRY", message: "The invoice changed while saving. Please retry." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Same idempotency key raced in: treat as a replay.
      const raced = await prisma.invoicePayment.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey } },
        include: { invoice: { select: { status: true } } },
      });
      if (raced) return { ok: true, replayed: true, invoiceId: raced.invoiceId, paymentId: raced.id, status: raced.invoice.status, becamePaid: false };
    }
    throw error;
  }

  if (result.kind === "fail") return result.failure;

  // ── Best-effort side effects (never fail the payment) ────────────────────────────────
  if (result.statusChanged) {
    try {
      const filePath = resolveInvoicePdfStoragePath(result.invoice);
      const stamp = filePath
        ? getInvoiceStampDescriptor({ status: toInvoiceStatus(result.status), dateReceivedIso: input.receivedAt.toISOString().slice(0, 10) })
        : null;
      if (filePath && stamp) {
        await applyInvoiceStatusStamp({ filePath, stampLabel: stamp.stampLabel, receivedDateText: stamp.receivedDateText });
      }
    } catch (error) {
      console.error("[invoice-payment] PDF stamp failed", error);
    }
  }
  invalidateInvoiceCaches(input.workspaceId, "payment");
  if (result.becamePaid) {
    dispatchNotification({
      event: "INVOICE_PAID",
      workspaceId: input.workspaceId,
      data: {
        invoiceNumber: result.invoice.invoiceNumber,
        clientName: result.invoice.clientName,
        amount: String(effectiveTotal(result.invoice)),
      },
    }).catch(() => null);
  }

  return { ok: true, replayed: false, invoiceId: input.invoiceId, paymentId: result.paymentId, status: result.status, becamePaid: result.becamePaid };
}

class ConcurrentInvoiceUpdateError extends Error {}

export async function reverseInvoicePayment(input: {
  workspaceId: string;
  userId: string;
  invoiceId: string;
  paymentId: string;
  reason: string;
}): Promise<{ ok: true; status: string } | PaymentFailure> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    return { ok: false, status: 400, code: "REASON_REQUIRED", message: "Please give a short reason for reversing this payment." };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const payment = await tx.invoicePayment.findFirst({
      where: { id: input.paymentId, invoiceId: input.invoiceId, workspaceId: input.workspaceId },
      include: { invoice: true },
    });
    if (!payment) {
      return { ok: false, status: 404, code: "PAYMENT_NOT_FOUND", message: "Payment not found." } as PaymentFailure;
    }
    if (payment.reversedAt) {
      return { ok: false, status: 409, code: "ALREADY_REVERSED", message: "This payment was already reversed." } as PaymentFailure;
    }
    if (payment.invoice.status === "VOID") {
      return { ok: false, status: 409, code: "INVOICE_VOID", message: "A voided invoice cannot be changed." } as PaymentFailure;
    }

    await reconcileLedger(tx, payment.invoice);
    await tx.invoicePayment.update({
      where: { id: payment.id },
      data: { reversedAt: new Date(), reversedByUserId: input.userId, reversalReason: reason },
    });

    const remaining = await activePaymentTotal(tx, payment.invoiceId);
    const total = effectiveTotal(payment.invoice);
    const status = toInvoiceStatus(statusForTotals(remaining, total));
    const latest = await tx.invoicePayment.findFirst({
      where: { invoiceId: payment.invoiceId, reversedAt: null },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    });
    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: { status, amountReceived: remaining.gt(0) ? remaining : null, dateReceived: latest?.receivedAt ?? null },
    });
    await addInvoiceEvent(tx, {
      workspaceId: input.workspaceId,
      invoiceId: payment.invoiceId,
      type: "PAYMENT_REVERSED",
      message: `${toDecimal(payment.amount).toFixed(2)} ${payment.invoice.currency} reversed: ${reason}`,
      metadata: { paymentId: payment.id },
      actorUserId: input.userId,
    });
    return { ok: true, status } as const;
  });

  if (outcome.ok) invalidateInvoiceCaches(input.workspaceId, "payment_reversal");
  return outcome;
}

export function invalidateInvoiceCaches(workspaceId: string, action: string) {
  try {
    invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (error) {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "invoice", action, error: String(error) });
  }
}
