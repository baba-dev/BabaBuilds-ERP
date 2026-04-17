export type PayrollRunStatus = 'DRAFT' | 'GENERATED' | 'APPROVED' | 'POSTED' | 'FAILED';

export type PayrollLineInput = {
  employeeId: string;
  baseSalaryCents: number;
  overtimeHours?: number;
  overtimeRateCents?: number;
  bonusCents?: number;
  preTaxDeductionsCents?: number;
  postTaxDeductionsCents?: number;
  taxRate?: number;
};

export type PayrollLineResult = {
  employeeId: string;
  grossCents: number;
  taxableIncomeCents: number;
  taxWithheldCents: number;
  netPayCents: number;
  meta: {
    overtimePayCents: number;
    bonusCents: number;
    preTaxDeductionsCents: number;
    postTaxDeductionsCents: number;
    taxRate: number;
  };
};

export type PayrollRun = {
  id: string;
  status: PayrollRunStatus;
  lineItems: PayrollLineResult[];
};

export type PayrollPostingResult = {
  runId: string;
  idempotencyKey: string;
  ledgerBatchId: string;
  postedEntryCount: number;
  replayed: boolean;
};

const DEFAULT_TAX_RATE = 0;

function clampNonNegativeInt(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function quantile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function roundHalfUp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function calculatePayrollLine(input: PayrollLineInput): PayrollLineResult {
  const baseSalaryCents = clampNonNegativeInt(input.baseSalaryCents);
  const overtimeHours = Number.isFinite(input.overtimeHours) ? Math.max(0, Number(input.overtimeHours)) : 0;
  const overtimeRateCents = clampNonNegativeInt(input.overtimeRateCents ?? 0);
  const bonusCents = clampNonNegativeInt(input.bonusCents ?? 0);
  const preTaxDeductionsCents = clampNonNegativeInt(input.preTaxDeductionsCents ?? 0);
  const postTaxDeductionsCents = clampNonNegativeInt(input.postTaxDeductionsCents ?? 0);
  const taxRate = Number.isFinite(input.taxRate) ? Math.max(0, Number(input.taxRate)) : DEFAULT_TAX_RATE;

  const overtimePayCents = roundHalfUp(overtimeHours * overtimeRateCents);
  const grossCents = baseSalaryCents + overtimePayCents + bonusCents;
  const taxableIncomeCents = Math.max(0, grossCents - preTaxDeductionsCents);
  const taxWithheldCents = roundHalfUp(taxableIncomeCents * taxRate);

  const unboundedNet = grossCents - preTaxDeductionsCents - taxWithheldCents - postTaxDeductionsCents;
  const netPayCents = Math.max(0, unboundedNet);

  return {
    employeeId: input.employeeId,
    grossCents,
    taxableIncomeCents,
    taxWithheldCents,
    netPayCents,
    meta: {
      overtimePayCents,
      bonusCents,
      preTaxDeductionsCents,
      postTaxDeductionsCents,
      taxRate,
    },
  };
}

export function calculatePayrollRun(lines: PayrollLineInput[]) {
  const lineItems = lines.map(calculatePayrollLine);
  return {
    lineItems,
    totals: {
      grossCents: lineItems.reduce((sum, line) => sum + line.grossCents, 0),
      taxWithheldCents: lineItems.reduce((sum, line) => sum + line.taxWithheldCents, 0),
      netPayCents: lineItems.reduce((sum, line) => sum + line.netPayCents, 0),
    },
  };
}

const ALLOWED_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  DRAFT: ['GENERATED', 'FAILED'],
  GENERATED: ['APPROVED', 'FAILED'],
  APPROVED: ['POSTED', 'FAILED'],
  POSTED: [],
  FAILED: ['DRAFT'],
};

export function transitionPayrollRunStatus(current: PayrollRunStatus, next: PayrollRunStatus) {
  if (current === next) return next;
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid payroll run transition from ${current} to ${next}.`);
  }
  return next;
}

const postingStore = new Map<string, PayrollPostingResult>();

function postingStoreKey(runId: string, idempotencyKey: string) {
  return `${runId}::${idempotencyKey}`;
}

export function resetPayrollPostingStore() {
  postingStore.clear();
}

export function postPayrollRun(input: {
  run: PayrollRun;
  idempotencyKey: string;
  ledgerBatchId: string;
}) {
  if (input.run.status !== 'APPROVED' && input.run.status !== 'POSTED') {
    throw new Error('Run must be APPROVED before posting.');
  }

  const key = postingStoreKey(input.run.id, input.idempotencyKey);
  const replay = postingStore.get(key);
  if (replay) return { ...replay, replayed: true };

  const postedEntryCount = input.run.lineItems.length;
  const result: PayrollPostingResult = {
    runId: input.run.id,
    idempotencyKey: input.idempotencyKey,
    ledgerBatchId: input.ledgerBatchId,
    postedEntryCount,
    replayed: false,
  };

  postingStore.set(key, result);
  return result;
}

const payrollTelemetryState = {
  runGenerationTimeMs: [] as number[],
  approvalLatencyMs: [] as number[],
  postingAttempts: 0,
  postingFailures: 0,
  reconciliationMismatches: 0,
};

export function resetPayrollTelemetry() {
  payrollTelemetryState.runGenerationTimeMs = [];
  payrollTelemetryState.approvalLatencyMs = [];
  payrollTelemetryState.postingAttempts = 0;
  payrollTelemetryState.postingFailures = 0;
  payrollTelemetryState.reconciliationMismatches = 0;
}

export function recordRunGenerationTime(durationMs: number) {
  payrollTelemetryState.runGenerationTimeMs.push(clampNonNegativeInt(durationMs));
}

export function recordPostingResult(success: boolean) {
  payrollTelemetryState.postingAttempts += 1;
  if (!success) payrollTelemetryState.postingFailures += 1;
}

export function recordReconciliationMismatch(mismatchCount: number) {
  payrollTelemetryState.reconciliationMismatches += clampNonNegativeInt(mismatchCount);
}

export function recordApprovalLatency(durationMs: number) {
  payrollTelemetryState.approvalLatencyMs.push(clampNonNegativeInt(durationMs));
}

export function getPayrollTelemetrySnapshot() {
  const runDurations = payrollTelemetryState.runGenerationTimeMs;
  const approvalDurations = payrollTelemetryState.approvalLatencyMs;
  const postingFailureRate = payrollTelemetryState.postingAttempts === 0
    ? 0
    : payrollTelemetryState.postingFailures / payrollTelemetryState.postingAttempts;

  return {
    runGenerationTimeMs: {
      count: runDurations.length,
      avg: runDurations.length ? roundHalfUp(runDurations.reduce((sum, ms) => sum + ms, 0) / runDurations.length) : 0,
      p95: quantile(runDurations, 0.95),
      max: runDurations.length ? Math.max(...runDurations) : 0,
    },
    postingFailureRate,
    reconciliationMismatches: payrollTelemetryState.reconciliationMismatches,
    approvalLatencyMs: {
      count: approvalDurations.length,
      avg: approvalDurations.length ? roundHalfUp(approvalDurations.reduce((sum, ms) => sum + ms, 0) / approvalDurations.length) : 0,
      p95: quantile(approvalDurations, 0.95),
      max: approvalDurations.length ? Math.max(...approvalDurations) : 0,
    },
  };
}

export function assertPayrollRunPermission(input: {
  actorId?: string | null;
  action: 'GENERATE' | 'APPROVE' | 'POST';
  permissions: string[];
}) {
  if (!input.actorId) throw new Error('Unauthorized: missing actor identity.');

  const requiredPermission = {
    GENERATE: 'payroll.generate',
    APPROVE: 'payroll.approve',
    POST: 'payroll.post',
  }[input.action];

  if (!input.permissions.includes(requiredPermission)) {
    throw new Error(`Unauthorized: missing permission ${requiredPermission}.`);
  }
}

export function enforcePayrollSoD(input: { makerUserId: string; checkerUserId: string }) {
  if (input.makerUserId === input.checkerUserId) {
    throw new Error('Segregation-of-duties violation: maker and approver must be different users.');
  }
}

export function buildPayrollRunSnapshot(input: {
  runId: string;
  generatedAt: string;
  lineItems: PayrollLineResult[];
}) {
  const sorted = [...input.lineItems].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  return {
    runId: input.runId,
    generatedAt: input.generatedAt,
    employeeCount: sorted.length,
    totals: {
      grossCents: sorted.reduce((sum, line) => sum + line.grossCents, 0),
      taxWithheldCents: sorted.reduce((sum, line) => sum + line.taxWithheldCents, 0),
      netPayCents: sorted.reduce((sum, line) => sum + line.netPayCents, 0),
    },
    lineItems: sorted.map((line) => ({
      employeeId: line.employeeId,
      grossCents: line.grossCents,
      taxableIncomeCents: line.taxableIncomeCents,
      taxWithheldCents: line.taxWithheldCents,
      netPayCents: line.netPayCents,
    })),
  };
}
