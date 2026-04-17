import { createHash } from 'node:crypto';
import { COUNTRY_DEFAULT_TAX_RATES } from '@/lib/tax/rules';

export type TaxSourceEntityKind = 'invoice' | 'expense';

export interface TaxSourceEntityRef {
  kind: TaxSourceEntityKind;
  entityId: string;
  workspaceId: string;
  taxableAmount: number;
  originCountryCode?: string | null;
  destinationCountryCode?: string | null;
  clientId?: string | null;
  serviceRef?: string | null;
  occurredAt: Date;
  isTaxExempt?: boolean;
}

export interface TaxRateOverrideRecord {
  id: string;
  workspaceId: string;
  scopeType: 'WORKSPACE' | 'CLIENT' | 'SERVICE' | string;
  scopeRef?: string | null;
  rate: number;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  isActive: boolean;
}

export interface TaxableEventRecord {
  id: string;
  workspaceId: string;
  sourceEntityKind: TaxSourceEntityKind;
  sourceEntityId: string;
  taxableAmount: number;
  originCountryCode: string;
  destinationCountryCode: string;
  occurredAt: Date;
}

export interface TaxDeterminationRecord {
  id: string;
  workspaceId: string;
  taxableEventId: string;
  ratePercent: number;
  taxAmount: number;
  totalAmount: number;
  resolutionSource: 'MANUAL_OVERRIDE' | 'WORKSPACE_RULE' | 'FALLBACK';
  resolutionReason: string;
  overrideId?: string | null;
}

export interface TaxComponentLineRecord {
  id: string;
  workspaceId: string;
  taxDeterminationId: string;
  componentKey: string;
  ratePercent: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface TaxDecisionAuditLogRecord {
  id: string;
  workspaceId: string;
  invoiceId?: string | null;
  resolvedRatePercent: number;
  resolutionSource: 'MANUAL_OVERRIDE' | 'WORKSPACE_RULE' | 'FALLBACK';
  basisJson: Record<string, unknown>;
  inputHash: string;
  createdBy: string;
}

export interface TaxPersistencePort {
  createTaxableEvent(input: Omit<TaxableEventRecord, 'id'>): Promise<TaxableEventRecord>;
  createTaxDetermination(input: Omit<TaxDeterminationRecord, 'id'>): Promise<TaxDeterminationRecord>;
  createTaxComponentLines(input: Array<Omit<TaxComponentLineRecord, 'id'>>): Promise<TaxComponentLineRecord[]>;
  findActiveTaxRateOverrides(input: {
    workspaceId: string;
    asOf: Date;
  }): Promise<TaxRateOverrideRecord[]>;
  createTaxDecisionAuditLog(input: Omit<TaxDecisionAuditLogRecord, 'id'>): Promise<TaxDecisionAuditLogRecord>;
}

export interface DetermineTaxInput {
  source: TaxSourceEntityRef;
  actorUserId: string;
}

export interface DetermineTaxResult {
  taxableEvent: TaxableEventRecord;
  determination: TaxDeterminationRecord;
  componentLines: TaxComponentLineRecord[];
  auditLog: TaxDecisionAuditLogRecord;
}

const normalizeCountryCode = (value?: string | null): string => (value ?? '').trim().toUpperCase();

function resolveManualOverride(input: {
  overrides: TaxRateOverrideRecord[];
  source: TaxSourceEntityRef;
}): TaxRateOverrideRecord | null {
  const { overrides, source } = input;
  const rankedScopes = ['SERVICE', 'CLIENT', 'WORKSPACE'];

  const candidates = overrides.filter((override) => {
    if (!override.isActive || override.workspaceId !== source.workspaceId) return false;

    if (override.scopeType === 'SERVICE') {
      return Boolean(source.serviceRef && override.scopeRef === source.serviceRef);
    }

    if (override.scopeType === 'CLIENT') {
      return Boolean(source.clientId && override.scopeRef === source.clientId);
    }

    if (override.scopeType === 'WORKSPACE') {
      return true;
    }

    return false;
  });

  candidates.sort((a, b) => {
    const scopeDelta = rankedScopes.indexOf(a.scopeType) - rankedScopes.indexOf(b.scopeType);
    if (scopeDelta !== 0) return scopeDelta;
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  });

  return candidates[0] ?? null;
}

export async function determineAndPersistTax(
  persistence: TaxPersistencePort,
  input: DetermineTaxInput
): Promise<DetermineTaxResult> {
  const source = input.source;
  const originCountryCode = normalizeCountryCode(source.originCountryCode);
  const destinationCountryCode = normalizeCountryCode(source.destinationCountryCode) || originCountryCode;

  const taxableEvent = await persistence.createTaxableEvent({
    workspaceId: source.workspaceId,
    sourceEntityKind: source.kind,
    sourceEntityId: source.entityId,
    taxableAmount: source.taxableAmount,
    originCountryCode,
    destinationCountryCode,
    occurredAt: source.occurredAt,
  });

  const activeOverrides = await persistence.findActiveTaxRateOverrides({
    workspaceId: source.workspaceId,
    asOf: source.occurredAt,
  });

  let ratePercent = 0;
  let resolutionSource: TaxDeterminationRecord['resolutionSource'] = 'FALLBACK';
  let resolutionReason = 'NO_MATCHING_RULE';
  let overrideId: string | null = null;

  if (source.isTaxExempt) {
    ratePercent = 0;
    resolutionSource = 'WORKSPACE_RULE';
    resolutionReason = 'SOURCE_MARKED_EXEMPT';
  } else {
    const applicableOverride = resolveManualOverride({ overrides: activeOverrides, source });

    if (applicableOverride) {
      ratePercent = applicableOverride.rate;
      resolutionSource = 'MANUAL_OVERRIDE';
      resolutionReason = 'OVERRIDE_APPLIED';
      overrideId = applicableOverride.id;
    } else if (originCountryCode !== '' && originCountryCode === destinationCountryCode) {
      ratePercent = (COUNTRY_DEFAULT_TAX_RATES[originCountryCode] ?? 0) * 100;
      resolutionSource = 'WORKSPACE_RULE';
      resolutionReason = 'SAME_COUNTRY_STANDARD_RATE';
    } else {
      ratePercent = 0;
      resolutionSource = 'FALLBACK';
      resolutionReason = 'CROSS_BORDER_OR_UNKNOWN_COUNTRY';
    }
  }

  const taxAmount = Number((source.taxableAmount * (ratePercent / 100)).toFixed(2));
  const totalAmount = Number((source.taxableAmount + taxAmount).toFixed(2));

  const determination = await persistence.createTaxDetermination({
    workspaceId: source.workspaceId,
    taxableEventId: taxableEvent.id,
    ratePercent,
    taxAmount,
    totalAmount,
    resolutionSource,
    resolutionReason,
    overrideId,
  });

  const componentLines = await persistence.createTaxComponentLines([
    {
      workspaceId: source.workspaceId,
      taxDeterminationId: determination.id,
      componentKey: 'BASE_TAX',
      ratePercent,
      taxableAmount: source.taxableAmount,
      taxAmount,
    },
  ]);

  const inputHash = createHash('sha256')
    .update(
      JSON.stringify({
        source,
        ratePercent,
        resolutionSource,
        resolutionReason,
        overrideId,
      })
    )
    .digest('hex');

  const auditLog = await persistence.createTaxDecisionAuditLog({
    workspaceId: source.workspaceId,
    invoiceId: source.kind === 'invoice' ? source.entityId : null,
    resolvedRatePercent: ratePercent,
    resolutionSource,
    basisJson: {
      source,
      taxableEventId: taxableEvent.id,
      taxDeterminationId: determination.id,
      componentLineIds: componentLines.map((line) => line.id),
      resolutionReason,
      overrideId,
    },
    inputHash,
    createdBy: input.actorUserId,
  });

  return {
    taxableEvent,
    determination,
    componentLines,
    auditLog,
  };
}
