import { describe, expect, it } from 'vitest';
import { computeVariance, runChecks, type CheckEmployee } from '@/lib/payroll/service/checks';

const emp = (over: Partial<CheckEmployee> = {}): CheckEmployee => ({
  id: 'e1', name: 'Asha', hasCompensation: true, paymentMode: 'BANK_TRANSFER', hasBank: true, bankKey: 'HDFC0001:1234', hasPan: true, hasUan: true, pfEnabled: true, esiEnabled: false, hasEsiNumber: false,
  ptState: 'KA', joinsThisPeriod: false, leavesThisPeriod: false, onLeaveStatus: false, pendingLeaveRequests: 0, missingAttendanceDays: 0, ytdAssumed: false, lopDays: 0, ...over,
});
const codes = (e: CheckEmployee[]) => runChecks({ employees: e, workforceLinked: true, periodInPast: true }).map((i) => i.code);

describe('payroll pre-flight checks', () => {
  it('is quiet for a complete employee', () => expect(codes([emp()])).toEqual([]));
  it('blocks a run with nobody in it', () => expect(codes([])).toEqual(['NO_EMPLOYEES']));
  it('flags missing pay structure and skips the rest', () => expect(codes([emp({ hasCompensation: false, hasPan: false })])).toEqual(['NO_COMPENSATION']));
  it('flags missing identifiers by what they affect', () => {
    const c = codes([emp({ hasBank: false, hasPan: false, hasUan: false, esiEnabled: true, hasEsiNumber: false, ptState: null })]);
    expect(c).toEqual(expect.arrayContaining(['NO_BANK', 'NO_PAN', 'NO_UAN', 'NO_ESI_NUMBER', 'NO_PT_STATE']));
  });
  it('does not ask for a bank account when paying in cash', () => expect(codes([emp({ paymentMode: 'CASH', hasBank: false })])).not.toContain('NO_BANK'));
  it('spots two people on one account', () => {
    const c = codes([emp(), emp({ id: 'e2', name: 'Ravi' })]);
    expect(c.filter((x) => x === 'DUPLICATE_BANK')).toHaveLength(2);
  });
  it('treats a zero net pay as an error', () => expect(runChecks({ employees: [emp({ netPay: 0, gross: 5000 })], workforceLinked: false, periodInPast: false }).find((i) => i.code === 'ZERO_NET')?.severity).toBe('error'));
  it('only mentions missing attendance for a past month with Workforce on', () => {
    expect(runChecks({ employees: [emp({ missingAttendanceDays: 4 })], workforceLinked: true, periodInPast: false }).map((i) => i.code)).not.toContain('MISSING_ATTENDANCE');
    expect(runChecks({ employees: [emp({ missingAttendanceDays: 4 })], workforceLinked: false, periodInPast: true }).map((i) => i.code)).not.toContain('MISSING_ATTENDANCE');
  });
});

describe('variance against the last run', () => {
  const prev = [{ employeeId: 'a', name: 'A', netPay: 50000, gross: 60000 }, { employeeId: 'b', name: 'B', netPay: 40000, gross: 50000 }, { employeeId: 'g', name: 'G', netPay: 30000, gross: 35000 }];
  it('flags big changes, joiners and leavers, biggest first', () => {
    const cur = [{ employeeId: 'a', name: 'A', netPay: 50500, gross: 60000 }, { employeeId: 'b', name: 'B', netPay: 20000, gross: 25000 }, { employeeId: 'n', name: 'N', netPay: 25000, gross: 30000 }];
    const v = computeVariance(prev, cur);
    expect(v.map((x) => [x.employeeId, x.kind])).toEqual([['g', 'GONE'], ['n', 'NEW'], ['b', 'CHANGED']].sort((x, y) => v.findIndex((f) => f.employeeId === x[0]) - v.findIndex((f) => f.employeeId === y[0])));
    expect(v.find((x) => x.employeeId === 'a')).toBeUndefined();
    expect(v[0]!.employeeId).toBe('g');
  });
  it('ignores small rupee changes even when the percentage is large', () => {
    expect(computeVariance([{ employeeId: 'a', name: 'A', netPay: 1000, gross: 1000 }], [{ employeeId: 'a', name: 'A', netPay: 1600, gross: 1600 }])).toEqual([]);
  });
});
