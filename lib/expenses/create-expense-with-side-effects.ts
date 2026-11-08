import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { determineAndPersistTax } from "@/src/server/tax/service";
import { createPrismaTaxPersistence } from "@/lib/tax/prisma-tax-persistence";
import { appendTaxAuditEvent, newTaxCorrelationId } from "@/lib/tax/audit";
import { computeWithheldAmount, defaultDepositDueDate, deriveReturnPeriodKey } from "@/lib/tax/withholding";
import { logActivity } from "@/lib/security/activity-log";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";

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

  const created = await tx.expense.create({
    data: {
      workspaceId: input.workspaceId,
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

  if (deductedAt && computedWithholdingAmount && computedWithholdingAmount.gt(0)) {
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
    invalidateDashboardCacheForWorkspace(input.workspaceId);
  } catch {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId: input.workspaceId, entity: "expense", action: "create" });
  }

  return created;
}

export async function createExpenseWithSideEffectsTx(tx: Tx, input: CreateExpenseWithSideEffectsInput) {
  return createWithinTx(tx, input);
}
