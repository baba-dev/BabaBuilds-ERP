import type { Prisma, PrismaClient } from '@prisma/client';
import { TaxResolutionSource } from '@prisma/client';
import type {
  TaxComponentLineRecord,
  TaxDecisionAuditLogRecord,
  TaxDeterminationRecord,
  TaxPersistencePort,
  TaxRateOverrideRecord,
  TaxableEventRecord,
} from '@/src/server/tax/service';

type Db = PrismaClient | Prisma.TransactionClient;

function mapResolutionSource(
  source: TaxDeterminationRecord['resolutionSource'],
): TaxResolutionSource {
  if (source === 'MANUAL_OVERRIDE') return TaxResolutionSource.MANUAL_OVERRIDE;
  if (source === 'WORKSPACE_RULE') return TaxResolutionSource.WORKSPACE_RULE;
  return TaxResolutionSource.FALLBACK;
}

function mapOverrides(rows: Array<{ id: string; workspaceId: string; scopeType: string; scopeRef: string | null; rate: number; effectiveFrom: Date; effectiveTo: Date | null; isActive: boolean }>): TaxRateOverrideRecord[] {
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    scopeType: row.scopeType,
    scopeRef: row.scopeRef,
    rate: row.rate,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    isActive: row.isActive,
  }));
}

export function createPrismaTaxPersistence(db: Db): TaxPersistencePort {
  return {
    async createTaxableEvent(input: Omit<TaxableEventRecord, 'id'>): Promise<TaxableEventRecord> {
      const created = await db.taxableEvent.create({
        data: {
          workspaceId: input.workspaceId,
          sourceEntityKind: input.sourceEntityKind,
          sourceEntityId: input.sourceEntityId,
          taxableAmount: input.taxableAmount,
          originCountryCode: input.originCountryCode,
          destinationCountryCode: input.destinationCountryCode,
          occurredAt: input.occurredAt,
          invoiceId: input.sourceEntityKind === 'invoice' ? input.sourceEntityId : null,
          expenseId: input.sourceEntityKind === 'expense' ? input.sourceEntityId : null,
        },
      });
      return {
        id: created.id,
        workspaceId: created.workspaceId,
        sourceEntityKind: created.sourceEntityKind as TaxableEventRecord['sourceEntityKind'],
        sourceEntityId: created.sourceEntityId,
        taxableAmount: Number(created.taxableAmount),
        originCountryCode: created.originCountryCode,
        destinationCountryCode: created.destinationCountryCode,
        occurredAt: created.occurredAt,
      };
    },

    async createTaxDetermination(input: Omit<TaxDeterminationRecord, 'id'>): Promise<TaxDeterminationRecord> {
      const created = await db.taxDetermination.create({
        data: {
          workspaceId: input.workspaceId,
          taxableEventId: input.taxableEventId,
          ratePercent: input.ratePercent,
          taxAmount: input.taxAmount,
          totalAmount: input.totalAmount,
          resolutionSource: input.resolutionSource,
          resolutionReason: input.resolutionReason,
          overrideId: input.overrideId ?? null,
        },
      });
      return {
        id: created.id,
        workspaceId: created.workspaceId,
        taxableEventId: created.taxableEventId,
        ratePercent: created.ratePercent,
        taxAmount: Number(created.taxAmount),
        totalAmount: Number(created.totalAmount),
        resolutionSource: created.resolutionSource as TaxDeterminationRecord['resolutionSource'],
        resolutionReason: created.resolutionReason,
        overrideId: created.overrideId,
      };
    },

    async createTaxComponentLines(
      input: Array<Omit<TaxComponentLineRecord, 'id'>>,
    ): Promise<TaxComponentLineRecord[]> {
      const created = await Promise.all(
        input.map((line) =>
          db.taxComponentLine.create({
            data: {
              workspaceId: line.workspaceId,
              taxDeterminationId: line.taxDeterminationId,
              componentKey: line.componentKey,
              ratePercent: line.ratePercent,
              taxableAmount: line.taxableAmount,
              taxAmount: line.taxAmount,
            },
          }),
        ),
      );
      return created.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        taxDeterminationId: row.taxDeterminationId,
        componentKey: row.componentKey,
        ratePercent: row.ratePercent,
        taxableAmount: Number(row.taxableAmount),
        taxAmount: Number(row.taxAmount),
      }));
    },

    async findActiveTaxRateOverrides(input: {
      workspaceId: string;
      asOf: Date;
    }): Promise<TaxRateOverrideRecord[]> {
      const rows = await db.taxRateOverride.findMany({
        where: {
          workspaceId: input.workspaceId,
          isActive: true,
          effectiveFrom: { lte: input.asOf },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.asOf } }],
        },
        orderBy: [{ effectiveFrom: 'desc' }],
      });
      return mapOverrides(rows);
    },

    async createTaxDecisionAuditLog(
      input: Omit<TaxDecisionAuditLogRecord, 'id'>,
    ): Promise<TaxDecisionAuditLogRecord> {
      const created = await db.taxDecisionAuditLog.create({
        data: {
          workspaceId: input.workspaceId,
          invoiceId: input.invoiceId ?? null,
          resolvedRatePercent: input.resolvedRatePercent,
          resolutionSource: mapResolutionSource(input.resolutionSource),
          basisJson: input.basisJson as Prisma.InputJsonValue,
          inputHash: input.inputHash,
          createdBy: input.createdBy,
        },
      });
      return {
        id: created.id,
        workspaceId: created.workspaceId,
        invoiceId: created.invoiceId,
        resolvedRatePercent: created.resolvedRatePercent,
        resolutionSource: input.resolutionSource,
        basisJson: created.basisJson as Record<string, unknown>,
        inputHash: created.inputHash,
        createdBy: created.createdBy,
      };
    },
  };
}
