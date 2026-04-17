import { describe, expect, it } from 'vitest';
import {
  determineAndPersistTax,
  type TaxComponentLineRecord,
  type TaxDecisionAuditLogRecord,
  type TaxDeterminationRecord,
  type TaxPersistencePort,
  type TaxRateOverrideRecord,
  type TaxableEventRecord,
} from '@/src/server/tax/service';

class InMemoryTaxPersistence implements TaxPersistencePort {
  public taxableEvents: TaxableEventRecord[] = [];
  public determinations: TaxDeterminationRecord[] = [];
  public componentLines: TaxComponentLineRecord[] = [];
  public auditLogs: TaxDecisionAuditLogRecord[] = [];

  constructor(private readonly overrides: TaxRateOverrideRecord[] = []) {}

  async createTaxableEvent(input: Omit<TaxableEventRecord, 'id'>): Promise<TaxableEventRecord> {
    const created = { ...input, id: `evt_${this.taxableEvents.length + 1}` };
    this.taxableEvents.push(created);
    return created;
  }

  async createTaxDetermination(input: Omit<TaxDeterminationRecord, 'id'>): Promise<TaxDeterminationRecord> {
    const created = { ...input, id: `det_${this.determinations.length + 1}` };
    this.determinations.push(created);
    return created;
  }

  async createTaxComponentLines(input: Array<Omit<TaxComponentLineRecord, 'id'>>): Promise<TaxComponentLineRecord[]> {
    const created = input.map((line, index) => ({
      ...line,
      id: `line_${this.componentLines.length + index + 1}`,
    }));

    this.componentLines.push(...created);
    return created;
  }

  async findActiveTaxRateOverrides(input: {
    workspaceId: string;
    asOf: Date;
  }): Promise<TaxRateOverrideRecord[]> {
    const asOfMs = input.asOf.getTime();
    return this.overrides.filter((override) => {
      if (override.workspaceId !== input.workspaceId || !override.isActive) return false;
      if (override.effectiveFrom.getTime() > asOfMs) return false;
      if (override.effectiveTo && override.effectiveTo.getTime() < asOfMs) return false;
      return true;
    });
  }

  async createTaxDecisionAuditLog(input: Omit<TaxDecisionAuditLogRecord, 'id'>): Promise<TaxDecisionAuditLogRecord> {
    const created = { ...input, id: `audit_${this.auditLogs.length + 1}` };
    this.auditLogs.push(created);
    return created;
  }
}

describe('determineAndPersistTax', () => {
  it('creates taxable event and applies deterministic same-country tax rules', async () => {
    const persistence = new InMemoryTaxPersistence();

    const result = await determineAndPersistTax(persistence, {
      source: {
        kind: 'invoice',
        entityId: 'inv_1',
        workspaceId: 'ws_1',
        taxableAmount: 1000,
        originCountryCode: 'IN',
        destinationCountryCode: 'IN',
        occurredAt: new Date('2026-01-15T00:00:00.000Z'),
      },
      actorUserId: 'user_1',
    });

    expect(result.taxableEvent.id).toBe('evt_1');
    expect(result.determination.ratePercent).toBe(18);
    expect(result.determination.taxAmount).toBe(180);
    expect(result.determination.resolutionSource).toBe('WORKSPACE_RULE');
    expect(result.componentLines).toHaveLength(1);
    expect(result.auditLog.basisJson).toMatchObject({
      taxableEventId: 'evt_1',
      taxDeterminationId: 'det_1',
      resolutionReason: 'SAME_COUNTRY_STANDARD_RATE',
    });
  });

  it('creates zero-tax determination for exempt source entities', async () => {
    const persistence = new InMemoryTaxPersistence();

    const result = await determineAndPersistTax(persistence, {
      source: {
        kind: 'expense',
        entityId: 'exp_1',
        workspaceId: 'ws_1',
        taxableAmount: 600,
        originCountryCode: 'IN',
        destinationCountryCode: 'IN',
        occurredAt: new Date('2026-01-15T00:00:00.000Z'),
        isTaxExempt: true,
      },
      actorUserId: 'user_2',
    });

    expect(result.determination.ratePercent).toBe(0);
    expect(result.determination.taxAmount).toBe(0);
    expect(result.determination.resolutionReason).toBe('SOURCE_MARKED_EXEMPT');
    expect(result.auditLog.invoiceId).toBeNull();
    expect(result.auditLog.resolutionSource).toBe('WORKSPACE_RULE');
  });

  it('uses matching manual override ahead of default country rules', async () => {
    const persistence = new InMemoryTaxPersistence([
      {
        id: 'ovr_service',
        workspaceId: 'ws_1',
        scopeType: 'SERVICE',
        scopeRef: 'svc_design',
        rate: 12,
        effectiveFrom: new Date('2025-01-01T00:00:00.000Z'),
        effectiveTo: null,
        isActive: true,
      },
    ]);

    const result = await determineAndPersistTax(persistence, {
      source: {
        kind: 'invoice',
        entityId: 'inv_2',
        workspaceId: 'ws_1',
        taxableAmount: 200,
        originCountryCode: 'IN',
        destinationCountryCode: 'IN',
        serviceRef: 'svc_design',
        occurredAt: new Date('2026-01-15T00:00:00.000Z'),
      },
      actorUserId: 'user_3',
    });

    expect(result.determination.ratePercent).toBe(12);
    expect(result.determination.taxAmount).toBe(24);
    expect(result.determination.resolutionSource).toBe('MANUAL_OVERRIDE');
    expect(result.determination.overrideId).toBe('ovr_service');
    expect(result.auditLog.basisJson).toMatchObject({
      overrideId: 'ovr_service',
      resolutionReason: 'OVERRIDE_APPLIED',
    });
  });
});
