import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { recordInvoicePayment } from "@/lib/invoices/payments";
import { withPermission } from "@/lib/rbac";
import { PAYMENT_METHODS } from "@/lib/invoices/types";

const dateField = z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");

const recordPaymentSchema = z.object({
  amount: z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().finite().positive().max(1_000_000_000)),
  receivedAt: dateField,
  method: z.enum(PAYMENT_METHODS).default("OTHER"),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  bankTransactionId: z.string().trim().max(64).optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
  withholdingRatePercent: z.number().min(0).max(100).nullish(),
  withholdingAmount: z.number().min(0).nullish(),
  withholdingDeductedAt: dateField.nullish(),
  withholdingDepositedAt: dateField.nullish(),
  withholdingDepositDueAt: dateField.nullish(),
  returnPeriodKey: z.string().trim().max(20).nullish(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireInvoiceAccess("invoices.edit");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.access;
    const { id } = await params;

    const parsed = recordPaymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(400, "INVALID_PAYMENT_PAYLOAD", parsed.error.issues[0]?.message ?? "Invalid payment details.");
    }
    const body = parsed.data;

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || body.idempotencyKey;
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return apiError(400, "IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key header is required so a retry can never double-record a payment.");
    }

    const hasWithholding = Boolean(
      body.withholdingRatePercent != null || body.withholdingAmount != null || body.withholdingDeductedAt || body.withholdingDepositedAt || body.withholdingDepositDueAt || body.returnPeriodKey,
    );
    if (hasWithholding) {
      const wh = await withPermission(userId, workspaceId, "tax.withholding.record");
      if (!wh.granted) return wh.response;
    }

    const result = await recordInvoicePayment({
      workspaceId,
      userId,
      invoiceId: id,
      amount: body.amount,
      receivedAt: new Date(body.receivedAt),
      method: body.method,
      reference: body.reference,
      notes: body.notes,
      bankTransactionId: body.bankTransactionId,
      idempotencyKey,
      withholding: hasWithholding
        ? {
            ratePercent: body.withholdingRatePercent ?? null,
            amount: body.withholdingAmount ?? null,
            deductedAt: body.withholdingDeductedAt ? new Date(body.withholdingDeductedAt) : null,
            depositedAt: body.withholdingDepositedAt ? new Date(body.withholdingDepositedAt) : null,
            depositDueAt: body.withholdingDepositDueAt ? new Date(body.withholdingDepositDueAt) : null,
            returnPeriodKey: body.returnPeriodKey ?? null,
          }
        : undefined,
    });

    if (!result.ok) return apiError(result.status, result.code, result.message, result.details);
    return NextResponse.json(
      { success: true, replayed: result.replayed, paymentId: result.paymentId, status: result.status },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (error) {
    console.error("Payment capture error:", error);
    return apiError(500, "PAYMENT_PROCESSING_FAILED", "Failed to process payment.");
  }
}
