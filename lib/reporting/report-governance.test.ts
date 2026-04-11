import test from 'node:test';
import assert from 'node:assert/strict';
import { runReportRegression } from '@/lib/reporting/report-governance';

const fixtureDataset = {
  workspaceId: 'ws_fixture_01',
  invoices: [
    { id: 'inv_001', totalAmount: '1000.00', grandTotal: '1180.00', invoiceDate: '2026-01-10' },
    { id: 'inv_002', totalAmount: '500.00', grandTotal: null, invoiceDate: '2026-02-10' },
    { id: 'inv_003', totalAmount: '250.00', grandTotal: '295.00', invoiceDate: '2026-03-10' },
  ],
  payments: [
    { id: 'pay_001', invoiceId: 'inv_001', amount: '1180.00', receivedAt: '2026-01-18' },
    { id: 'pay_002', invoiceId: 'inv_002', amount: '200.00', receivedAt: '2026-02-18' },
  ],
  journalEntries: [
    { id: 'je_001', accountCode: 'ACC_EXP', postingDate: '2026-03-31', amount: '100.00' },
    { id: 'je_002', accountCode: 'ACC_EXP', postingDate: '2026-03-31', amount: '-20.00' },
    { id: 'je_003', accountCode: 'ACC_EXP', postingDate: '2026-04-15', amount: '15.00' },
  ],
  deductions80C: [
    { id: 'ded_001', amount: '50000.00' },
    { id: 'ded_002', amount: '110000.00' },
  ],
};

test('report governance regression snapshot is deterministic and policy controls pass', () => {
  const snapshot = runReportRegression(fixtureDataset, '2026-03-31T23:59:59.000Z');

  assert.equal(snapshot.metrics.recognizedRevenue, '1975.00');
  assert.equal(snapshot.metrics.deferredRevenue, '595.00');
  assert.equal(snapshot.metrics.accrualBalance, '80.00');
  assert.equal(snapshot.metrics.estimatedTax, '0.00');

  assert.equal(snapshot.explainability.length, 3);
  assert.equal(snapshot.explainability[0].figureId, 'kpi.totalRevenue');
  assert.equal(snapshot.explainability[0].sourceEntries.length, 3);

  const deferredTrace = snapshot.explainability.find((artifact) => artifact.figureId === 'kpi.deferredRevenue');
  assert.ok(deferredTrace);
  assert.equal(deferredTrace?.value, '595.00');

  snapshot.validation.forEach((control) => {
    assert.equal(control.passed, true, `failed control ${control.controlId}: ${control.actual}`);
  });

  assert.equal(snapshot.controls.reportDefinitionVersion, '2026.04.11');
  assert.equal(snapshot.controls.policyVersion, '2026.04.11');
});
