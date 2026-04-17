import { test, expect, beforeEach } from 'vitest';
import {
  assertPayrollRunPermission,
  buildPayrollRunSnapshot,
  calculatePayrollLine,
  calculatePayrollRun,
  enforcePayrollSoD,
  getPayrollTelemetrySnapshot,
  postPayrollRun,
  recordApprovalLatency,
  recordPostingResult,
  recordReconciliationMismatch,
  recordRunGenerationTime,
  resetPayrollPostingStore,
  resetPayrollTelemetry,
  transitionPayrollRunStatus,
  type PayrollRun,
} from '@/lib/payroll/run';

beforeEach(() => {
  resetPayrollPostingStore();
  resetPayrollTelemetry();
});

test('unit: payroll formulas and rounding handle decimals + clamp edge cases', () => {
  const line = calculatePayrollLine({
    employeeId: 'emp_001',
    baseSalaryCents: 500_000,
    overtimeHours: 3.5,
    overtimeRateCents: 1_250,
    bonusCents: 12_345,
    preTaxDeductionsCents: 10_000,
    postTaxDeductionsCents: 5_000,
    taxRate: 0.2075,
  });

  expect(line.grossCents).toBe(516_720);
  expect(line.taxableIncomeCents).toBe(506_720);
  expect(line.taxWithheldCents).toBe(105_144);
  expect(line.netPayCents).toBe(396_576);

  const clamped = calculatePayrollLine({
    employeeId: 'emp_002',
    baseSalaryCents: -100,
    overtimeHours: -4,
    overtimeRateCents: -100,
    bonusCents: -1,
    preTaxDeductionsCents: 999,
    postTaxDeductionsCents: 999,
    taxRate: -1,
  });

  expect(clamped.grossCents).toBe(0);
  expect(clamped.taxableIncomeCents).toBe(0);
  expect(clamped.taxWithheldCents).toBe(0);
  expect(clamped.netPayCents).toBe(0);
});

test('integration: lifecycle transitions enforce policy', () => {
  expect(transitionPayrollRunStatus('DRAFT', 'GENERATED')).toBe('GENERATED');
  expect(transitionPayrollRunStatus('GENERATED', 'APPROVED')).toBe('APPROVED');
  expect(transitionPayrollRunStatus('APPROVED', 'POSTED')).toBe('POSTED');

  expect(() => transitionPayrollRunStatus('DRAFT', 'POSTED')).toThrow(/Invalid payroll run transition/);
});

test('integration: posting is idempotent for same run and key', () => {
  resetPayrollPostingStore();

  const lineItems = calculatePayrollRun([
    { employeeId: 'emp_001', baseSalaryCents: 100_000, taxRate: 0.2 },
    { employeeId: 'emp_002', baseSalaryCents: 80_000, taxRate: 0.15 },
  ]).lineItems;

  const run: PayrollRun = { id: 'run_001', status: 'APPROVED', lineItems };

  const first = postPayrollRun({ run, idempotencyKey: 'idem_1', ledgerBatchId: 'lb_1' });
  const replay = postPayrollRun({ run, idempotencyKey: 'idem_1', ledgerBatchId: 'lb_1' });

  expect(first.postedEntryCount).toBe(2);
  expect(first.replayed).toBe(false);
  expect(replay.replayed).toBe(true);
  expect(replay.ledgerBatchId).toBe('lb_1');
});

test('permissions: unauthorized access and segregation-of-duties are enforced', () => {
  expect(() => assertPayrollRunPermission({ actorId: null, action: 'GENERATE', permissions: ['payroll.generate'] })).toThrow(/Unauthorized: missing actor identity/);

  expect(() => assertPayrollRunPermission({ actorId: 'user_1', action: 'APPROVE', permissions: ['payroll.generate'] })).toThrow(/Unauthorized: missing permission payroll.approve/);

  expect(() => enforcePayrollSoD({ makerUserId: 'user_1', checkerUserId: 'user_1' })).toThrow(/Segregation-of-duties violation/);

  expect(() => enforcePayrollSoD({ makerUserId: 'user_1', checkerUserId: 'user_2' })).not.toThrow();
});

test('snapshot: payroll output regression remains deterministic', () => {
  const lineItems = calculatePayrollRun([
    {
      employeeId: 'emp_B',
      baseSalaryCents: 250_000,
      overtimeHours: 1.25,
      overtimeRateCents: 2_000,
      taxRate: 0.2,
      preTaxDeductionsCents: 5_000,
    },
    {
      employeeId: 'emp_A',
      baseSalaryCents: 300_000,
      bonusCents: 10_000,
      postTaxDeductionsCents: 2_500,
      taxRate: 0.23,
    },
  ]).lineItems;

  const snapshot = buildPayrollRunSnapshot({
    runId: 'run_apr_2026',
    generatedAt: '2026-04-17T00:00:00.000Z',
    lineItems,
  });

  expect(snapshot).toEqual({
    runId: 'run_apr_2026',
    generatedAt: '2026-04-17T00:00:00.000Z',
    employeeCount: 2,
    totals: {
      grossCents: 562_500,
      taxWithheldCents: 120_800,
      netPayCents: 434_200,
    },
    lineItems: [
      {
        employeeId: 'emp_A',
        grossCents: 310_000,
        taxableIncomeCents: 310_000,
        taxWithheldCents: 71_300,
        netPayCents: 236_200,
      },
      {
        employeeId: 'emp_B',
        grossCents: 252_500,
        taxableIncomeCents: 247_500,
        taxWithheldCents: 49_500,
        netPayCents: 198_000,
      },
    ],
  });
});

test('telemetry: tracks generation time, posting failures, mismatches, and approval latency', () => {
  resetPayrollTelemetry();

  recordRunGenerationTime(95);
  recordRunGenerationTime(170);
  recordRunGenerationTime(120);

  recordPostingResult(true);
  recordPostingResult(false);
  recordPostingResult(false);

  recordReconciliationMismatch(3);
  recordReconciliationMismatch(2);

  recordApprovalLatency(450);
  recordApprovalLatency(300);
  recordApprovalLatency(700);

  const metrics = getPayrollTelemetrySnapshot();

  expect(metrics).toEqual({
    runGenerationTimeMs: {
      count: 3,
      avg: 128,
      p95: 170,
      max: 170,
    },
    postingFailureRate: 2 / 3,
    reconciliationMismatches: 5,
    approvalLatencyMs: {
      count: 3,
      avg: 483,
      p95: 700,
      max: 700,
    },
  });
});
