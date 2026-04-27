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
import { toDecimal } from '@/lib/money';
import { computeWithheldAmount, defaultDepositDueDate, deriveReturnPeriodKey } from '@/lib/tax/withholding';
import { withPermission } from '@/lib/rbac';
import { appendTaxAuditEvent, newTaxCorrelationId } from '@/lib/tax/audit';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { resolveInvoicePdfStoragePath } from '@/lib/invoice/pdf-storage';
import { applyInvoiceStatusStamp } from '@/lib/invoice/pdf-stamp';

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
    const userId = (session?.user as { id?: string | null } | undefined)?.id as string | undefined;
    if (!workspaceId || !userId) {
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
    const withholdingRatePercent = typeof body?.withholdingRatePercent === 'number' ? body.withholdingRatePercent : null;
    const withholdingAmount = typeof body?.withholdingAmount === 'number' ? body.withholdingAmount : null;
    const withholdingDeductedAt = body?.withholdingDeductedAt ? new Date(body.withholdingDeductedAt) : null;
    const withholdingDepositedAt = body?.withholdingDepositedAt ? new Date(body.withholdingDepositedAt) : null;
    const withholdingDepositDueAt = body?.withholdingDepositDueAt ? new Date(body.withholdingDepositDueAt) : null;
    const returnPeriodKey = typeof body?.returnPeriodKey === 'string' ? body.returnPeriodKey : null;

    if (withholdingRatePercent !== null && (!Number.isFinite(withholdingRatePercent) || withholdingRatePercent < 0 || withholdingRatePercent > 100)) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_WITHHOLDING_RATE', message: 'Withholding rate percent must be between 0 and 100.' } }, { status: 400 });
    }
    if (withholdingAmount !== null && (!Number.isFinite(withholdingAmount) || withholdingAmount < 0)) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_WITHHOLDING_AMOUNT', message: 'Withholding amount must be non-negative.' } }, { status: 400 });
    }
    if (withholdingDeductedAt && Number.isNaN(withholdingDeductedAt.getTime())) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_WITHHOLDING_DATE', message: 'Invalid withholding deduction date.' } }, { status: 400 });
    }
    if (withholdingDepositedAt && Number.isNaN(withholdingDepositedAt.getTime())) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_WITHHOLDING_DATE', message: 'Invalid withholding deposited date.' } }, { status: 400 });
    }
    if (withholdingDepositDueAt && Number.isNaN(withholdingDepositDueAt.getTime())) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_WITHHOLDING_DATE', message: 'Invalid withholding due date.' } }, { status: 400 });
    }

    const hasWithholdingPayload =
      withholdingRatePercent !== null ||
      withholdingAmount !== null ||
      Boolean(withholdingDeductedAt) ||
      Boolean(withholdingDepositedAt) ||
      Boolean(withholdingDepositDueAt) ||
      Boolean(returnPeriodKey);
    if (hasWithholdingPayload) {
      const whPerm = await withPermission(userId, workspaceId, 'tax.withholding.record');
      if (!whPerm.granted) return whPerm.response;
    }

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

      // Use Prisma.Decimal for all cumulative arithmetic to avoid IEEE 754 drift.
      const existingReceived = toDecimal(existingInvoice.amountReceived ?? 0);
      const newCumulativeReceived = existingReceived.plus(toDecimal(incomingPayment)).toDecimalPlaces(2);
      const invoiceGrandTotal = toDecimal(existingInvoice.grandTotal ?? existingInvoice.totalAmount);

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
          amountReceived: newCumulativeReceived.toNumber(),
          dateReceived: new Date(dateReceived),
        },
      });
      if (updateResult.count === 0) {
        return { kind: 'write_conflict' as const };
      }

      const deductedAt = withholdingDeductedAt ?? null;
      const computedWithheldAmount = deductedAt
        ? computeWithheldAmount({
            grossAmount: incomingPayment,
            ratePercent: withholdingRatePercent,
            explicitWithheldAmount: withholdingAmount,
            deductedAt,
          })
        : null;
      const depositDueAt = deductedAt ? (withholdingDepositDueAt ?? defaultDepositDueDate(deductedAt)) : null;

      if (deductedAt && computedWithheldAmount && computedWithheldAmount.gt(0)) {
        const wh = await tx.withholdingEvent.create({
          data: {
            workspaceId,
            sourceType: 'INVOICE_PAYMENT',
            sourceId: existingInvoice.id,
            invoiceId: existingInvoice.id,
            counterpartyName: existingInvoice.clientName,
            grossAmount: incomingPayment,
            withheldAmount: computedWithheldAmount,
            withholdingRatePercent,
            deductedAt,
            depositedAt: withholdingDepositedAt,
            depositDueAt,
            returnPeriodKey: deriveReturnPeriodKey(deductedAt, returnPeriodKey),
            createdByUserId: (session?.user as any)?.id ?? null,
          },
        });

        await appendTaxAuditEvent(tx, {
          workspaceId,
          eventType: 'WITHHOLDING_RECORDED',
          correlationId: newTaxCorrelationId(),
          actorUserId: userId,
          entityType: 'WithholdingEvent',
          entityId: wh.id,
          payload: {
            invoiceId: existingInvoice.id,
            returnPeriodKey: wh.returnPeriodKey,
            withheldAmount: wh.withheldAmount.toString(),
          },
        });

        await tx.invoice.update({
          where: { id: existingInvoice.id },
          data: {
            withholdingRatePercent,
            withholdingAmount: computedWithheldAmount,
            withholdingDeductedAt: deductedAt,
            withholdingDepositedAt: withholdingDepositedAt,
            withholdingDepositDueAt: depositDueAt,
          },
        });
      }

      const updatedInvoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

      const becamePaidNow = newStatus === INVOICE_STATUS.PAID && existingInvoice.status !== INVOICE_STATUS.PAID;

      if (becamePaidNow && existingInvoice.items && existingInvoice.items.length > 0) {
        for (const item of existingInvoice.items) {
          if (item.productId) {
            const product = await tx.product.findFirst({ where: { id: item.productId, workspaceId } });
            if (product) {
              // Clamp to 0 — stock cannot go negative. The movement log still records
              // the full quantity so over-shipments are visible in inventory history.
              const newStock = Math.max(0, product.currentStock - item.quantity);
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
                  quantity: -item.quantity, // record actual quantity even if it exceeded stock
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

    const { existingInvoice, updatedInvoice, newStatus } = transitionResult;
    const statusChanged = newStatus !== toInvoiceStatus(existingInvoice.status);
    const becamePaidNow = newStatus === INVOICE_STATUS.PAID && existingInvoice.status !== INVOICE_STATUS.PAID;

    if (statusChanged) {
      const resolvedPdfPath = resolveInvoicePdfStoragePath(updatedInvoice);
      if (resolvedPdfPath) {
        const stamped = await applyInvoiceStatusStamp({
          sourcePdfPath: resolvedPdfPath,
          targetStatus: newStatus,
          dateReceived,
        });
        if (stamped) {
          fs.writeFileSync(resolvedPdfPath, stamped);
        }
      }
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'invoice', action: 'payment', error: String(error) });
    }

    if (becamePaidNow) {
      dispatchNotification({
        event: 'INVOICE_PAID',
        workspaceId,
        data: {
          invoiceNumber: updatedInvoice.invoiceNumber,
          clientName: updatedInvoice.clientName,
          amount: String(updatedInvoice.grandTotal ?? updatedInvoice.totalAmount),
        },
      }).catch(() => null);
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
