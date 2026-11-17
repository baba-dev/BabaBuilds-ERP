import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { determineAndPersistTax } from "@/src/server/tax/service";
import { createPrismaTaxPersistence } from "@/lib/tax/prisma-tax-persistence";
import { appendTaxAuditEvent, newTaxCorrelationId } from "@/lib/tax/audit";
import { computeWithheldAmount, defaultDepositDueDate, deriveReturnPeriodKey } from "@/lib/tax/withholding";
import { logActivity } from "@/lib/security/activity-log";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { resolveVendor } from "./vendors";
import { billDueDate } from "./payables";

type Tx = Prisma.TransactionClient;

export type CreateExpenseWithSideEffectsInput = {
  workspaceId: string;
  userId: string;
  request?: Request;
  date: Date;
  category: string;
  vendor: string;
  amount: number;
  description?: string | null;
  receiptUrl?: string | null;
  withholdingRatePercent?: number | null;
  explicitWithholdingAmount?: number | null;
  withholdingDeductedAt?: Date | null;
  withholdingDepositedAt?: Date | null;
  withholdingDepositDueAt?: Date | null;
  returnPeriodKeyRaw?: string | null;
  /** GST columns already validated by normalizeExpenseGst. */
  gst?: Record<string, unknown> | null;
  /** Pick an existing vendor; otherwise one is found or created from the name. */
  vendorId?: string | null;
  dueDate?: Date | null;
  source?: "MANUAL" | "SCAN" | "EMAIL" | "RECURRING" | "PO" | "BANK" | "IMPORT" | "AI";
  approvalStatus?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
  billable?: boolean;
  clientId?: string | null;
  markupPercent?: number | null;
  purchaseOrderId?: string | null;
  recurringId?: string | null;
};

async function createWithinTx(tx: Tx, input: CreateExpenseWithSideEffectsInput) {
  const deductedAt = input.withholdingDeductedAt ?? null;
  const computedWithholdingAmount = deductedAt
    ? computeWithheldAmount({
        grossAmount: input.amount,
        ratePercent: input.withholdingRatePercent ?? null,
        explicitWithheldAmount: input.explicitWithholdingAmount ?? null,
        deductedAt,
      })
    : null;

  const depositDueAt = deductedAt
    ? (input.withholdingDepositDueAt ?? defaultDepositDueDate(deductedAt))
    : null;

  const gst = (input.gst ?? {}) as Record<string, unknown>;
  const vendorRow = input.vendorId
    ? await tx.vendor.findFirst({ where: { id: input.vendorId, workspaceId: input.workspaceId } })
    : await resolveVendor(tx, input.workspaceId, input.vendor, {
        gstin: (gst.vendorGstin as string | null | undefined) ?? null, stateCode: (gst.vendorStateCode as string | null | undefined) ?? null,
        msmeClass: (gst.vendorMsme as string | null | undefined) ?? null, udyam: (gst.vendorUdyam as string | null | undefined) ?? null, category: input.category,
      });
  const unpaid = gst.paymentStatus === "UNPAID";
  const dueDate = input.dueDate ?? (unpaid ? billDueDate({ date: input.date, vendorMsme: gst.vendorMsme as string | null | undefined, vendorAgreedDays: gst.vendorAgreedDays as number | null | undefined, vendorTermsDays: vendorRow?.paymentTermsDays }) : null);
  if (input.clientId) {
    const client = await tx.client.findFirst({ where: { id: input.clientId, workspaceId: input.workspaceId }, select: { id: true } });
    if (!client) throw new Error("CLIENT_NOT_FOUND");
  }

  const created = await tx.expense.create({
    data: {
      workspaceId: input.workspaceId,
      vendorId: vendorRow?.id ?? null,
      dueDate,
      source: input.source ?? "MANUAL",
      approvalStatus: input.approvalStatus ?? "APPROVED",
      submittedByUserId: input.userId === "system-reconciliation" ? null : input.userId,
      approvedByUserId: (input.approvalStatus ?? "APPROVED") === "APPROVED" ? (input.userId === "system-reconciliation" ? null : input.userId) : null,
      approvedAt: (input.approvalStatus ?? "APPROVED") === "APPROVED" ? new Date() : null,
      billable: Boolean(input.billable && input.clientId),
      clientId: input.billable ? input.clientId ?? null : input.clientId ?? null,
      markupPercent: input.billable ? input.markupPercent ?? null : null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      recurringId: input.recurringId ?? null,
      date: input.date,
      category: input.category,
      vendor: input.vendor,
      amount: input.amount,
      description: input.description ?? null,
      receiptUrl: input.receiptUrl ?? null,
      withholdingRatePercent: input.withholdingRatePercent ?? null,
      withholdingAmount: computedWithholdingAmount,
      withholdingDeductedAt: deductedAt,
      withholdingDepositedAt: input.withholdingDepositedAt ?? null,
      withholdingDepositDueAt: depositDueAt,
      ...(input.gst ?? {}),
    },
  });

  const ws = await tx.workspace.findUnique({ where: { id: input.workspaceId }, select: { countryCode: true } });
  const countryCode = (ws?.countryCode ?? "IN").trim().toUpperCase() || "IN";

  await determineAndPersistTax(createPrismaTaxPersistence(tx), {
    source: {
      kind: "expense",
      entityId: created.id,
      workspaceId: input.workspaceId,
      taxableAmount: input.amount,
      originCountryCode: countryCode,
      destinationCountryCode: countryCode,
      occurredAt: input.date,
    },
    actorUserId: input.userId,
  });

  await appendTaxAuditEvent(tx, {
    workspaceId: input.workspaceId,
    eventType: "DETERMINATION",
    correlationId: newTaxCorrelationId(),
    actorUserId: input.userId,
    entityType: "Expense",
    entityId: created.id,
    payload: { vendor: input.vendor, category: input.category, amount: input.amount },
  });

  if (deductedAt && computedWithholdingAmount && computedWithholdingAmount.gt(0) && (input.approvalStatus ?? "APPROVED") === "APPROVED") {
    await tx.withholdingEvent.create({
      data: {
        workspaceId: input.workspaceId,
        sourceType: "EXPENSE_PAYMENT",
        sourceId: created.id,
        expenseId: created.id,
        counterpartyName: input.vendor || null,
        grossAmount: input.amount,
        withheldAmount: computedWithholdingAmount,
        withholdingRatePercent: input.withholdingRatePercent ?? null,
        deductedAt,
        depositedAt: input.withholdingDepositedAt ?? null,
        depositDueAt,
        returnPeriodKey: deriveReturnPeriodKey(deductedAt, input.returnPeriodKeyRaw),
        createdByUserId: input.userId,
      },
    });
  }

  return created;
}

export async function createExpenseWithSideEffects(input: CreateExpenseWithSideEffectsInput) {
  const created = await prisma.$transaction((tx) => createWithinTx(tx, input));

  logActivity({
    action: "expense_created",
    status: "SUCCESS",
    workspaceId: input.workspaceId,
    actor: { userId: input.userId },
    entity: { type: "expense", id: created.id },
    request: input.request,
  });

  try {
    await invalidateDashboardCacheForWorkspace(input.workspaceId);
  } catch {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId: input.workspaceId, entity: "expense", action: "create" });
  }

  return created;
}

export async function createExpenseWithSideEffectsTx(tx: Tx, input: CreateExpenseWithSideEffectsInput) {
  return createWithinTx(tx, input);
}
