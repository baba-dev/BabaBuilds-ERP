import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { recordInvoicePayment } from "@/lib/invoices/payments";
import { withPermission } from "@/lib/rbac";
import { parseInvoicePaymentPayload } from "@/lib/types/business";

/**
 * Legacy single-step "log payment" endpoint (still used by the dashboard quick action).
 * New code should use POST /api/invoices/[id]/payments. Differences from the old behaviour:
 *  - requires `invoices.edit`;
 *  - the idempotency key is only taken from the client; without one every call is a distinct payment
 *    (the old auto-generated key silently dropped a second same-amount, same-day instalment).
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireInvoiceAccess("invoices.edit");
    if (!auth.ok) return auth.response;
    const { workspaceId, userId } = auth.access;
    const { id } = await context.params;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const payload = parseInvoicePaymentPayload(body);
    if (!payload || !(payload.amountReceived > 0) || payload.amountReceived > 1_000_000_000 || Number.isNaN(Date.parse(payload.dateReceived))) {
      return NextResponse.json({ success: false, error: { code: "INVALID_PAYMENT_PAYLOAD", message: "Invalid request payload." } }, { status: 400 });
    }

    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const date = (v: unknown) => (typeof v === "string" && v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
    const rate = num(body?.withholdingRatePercent);
    const whAmount = num(body?.withholdingAmount);
    if ((rate !== null && (rate < 0 || rate > 100)) || (whAmount !== null && whAmount < 0)) {
      return NextResponse.json({ success: false, error: { code: "INVALID_WITHHOLDING", message: "Invalid withholding values." } }, { status: 400 });
    }
    const withholding = {
      ratePercent: rate,
      amount: whAmount,
      deductedAt: date(body?.withholdingDeductedAt),
      depositedAt: date(body?.withholdingDepositedAt),
      depositDueAt: date(body?.withholdingDepositDueAt),
      returnPeriodKey: typeof body?.returnPeriodKey === "string" ? body.returnPeriodKey : null,
    };
    const hasWithholding = Object.values(withholding).some((v) => v !== null);
    if (hasWithholding) {
      const perm = await withPermission(userId, workspaceId, "tax.withholding.record");
      if (!perm.granted) return perm.response;
    }

    const headerKey = request.headers.get("Idempotency-Key")?.trim();
    const bodyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const result = await recordInvoicePayment({
      workspaceId,
      userId,
      invoiceId: id,
      amount: payload.amountReceived,
      receivedAt: new Date(payload.dateReceived),
      method: "OTHER",
      idempotencyKey: headerKey || bodyKey || `legacy:${randomUUID()}`,
      withholding: hasWithholding ? withholding : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: { code: result.code, message: result.message, ...result.details } }, { status: result.status });
    }
    return NextResponse.json({ success: true, replayed: result.replayed, status: result.status });
  } catch (error) {
    console.error("Legacy payment capture error:", error);
    return apiError(500, "PAYMENT_PROCESSING_FAILED", "Failed to process payment.");
  }
}
