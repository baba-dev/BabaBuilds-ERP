import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMakerCheckerDecision,
  buildPrivilegedAccessControlReport,
  buildQuarterlySoDCertificationTasks,
  detectSoDConflictsByRole,
  validateBreakGlassAccounts,
} from './segregation-of-duties';

test('detectSoDConflictsByRole flags high-risk overlap for OWNER and ADMIN', () => {
  const conflicts = detectSoDConflictsByRole();

  const ownerConflicts = conflicts.filter((item) => item.role === 'OWNER');
  const adminConflicts = conflicts.filter((item) => item.role === 'ADMIN');

  assert.ok(ownerConflicts.length > 0);
  assert.ok(adminConflicts.length > 0);
});

test('maker-checker decision blocks same user approvals', () => {
  assert.throws(() =>
    applyMakerCheckerDecision(
      {
        workflow: 'TAX_CONFIG_EDIT',
        operationKey: 'operation_123',
        makerUserId: 'maker_1',
        requestedAt: new Date('2026-04-10T00:00:00.000Z').toISOString(),
        decision: 'PENDING',
        reason: 'Tax override requested',
        auditTrailId: 'audit_123',
      },
      {
        checkerUserId: 'maker_1',
        checkerRole: 'ADMIN',
        decision: 'APPROVED',
      }
    )
  );
});

test('validateBreakGlassAccounts flags missing expiry and stale review', () => {
  const results = validateBreakGlassAccounts(
    [
      {
        userId: 'u1',
        label: 'Break Glass 1',
        expiresAt: null,
        lastReviewAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    new Date('2026-04-10T00:00:00.000Z')
  );

  assert.equal(results[0]?.isValid, false);
  assert.ok(results[0]?.findings.some((finding) => finding.includes('Missing expiration')));
  assert.ok(results[0]?.findings.some((finding) => finding.includes('stale')));
});

test('quarterly certifications require remediation when conflicts exist', () => {
  const tasks = buildQuarterlySoDCertificationTasks({
    managerUserId: 'mgr_1',
    dueDate: new Date('2026-06-30T00:00:00.000Z'),
  });

  const ownerTask = tasks.find((task) => task.role === 'OWNER');
  assert.ok(ownerTask);
  assert.equal(ownerTask?.status, 'EXCEPTION_REMEDIATION_REQUIRED');
});

test('privileged access control report includes all six privileged workflows', () => {
  const report = buildPrivilegedAccessControlReport('mgr_1');
  assert.equal(report.privilegedWorkflows.length, 6);
});
