import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/modules', () => ({ isModuleEnabled: vi.fn() }));
vi.mock('@/lib/notifications/dispatcher', () => ({ dispatchNotification: vi.fn() }));

import { planPayrollReminders } from '@/lib/payroll/service/reminders';

const at = (iso: string) => new Date(`${iso}T06:00:00.000Z`);
const base = { payDay: 28, processingOffsetDays: 3, currentMonthRun: null, hasPeople: true, dues: [], reviewWaitingSince: null };

describe('payroll reminders', () => {
  it('nudges on the processing day and two days later, never after pay day', () => {
    expect(planPayrollReminders({ ...base, now: at('2026-11-25') }).map((r) => r.title)).toEqual(['Time to run payroll']);
    expect(planPayrollReminders({ ...base, now: at('2026-11-27') })).toHaveLength(1);
    expect(planPayrollReminders({ ...base, now: at('2026-11-26') })).toHaveLength(0);
    expect(planPayrollReminders({ ...base, now: at('2026-11-30') })).toHaveLength(0);
  });
  it('stays quiet once the month has a run or nobody is on payroll', () => {
    expect(planPayrollReminders({ ...base, now: at('2026-11-25'), currentMonthRun: { status: 'DRAFT' } })).toHaveLength(0);
    expect(planPayrollReminders({ ...base, now: at('2026-11-25'), hasPeople: false })).toHaveLength(0);
  });
  it('clamps a pay day of 31 to the end of a short month', () => {
    expect(planPayrollReminders({ ...base, payDay: 31, processingOffsetDays: 0, now: at('2026-02-28') })).toHaveLength(1);
  });
  it('reminds 3 and 1 days before a statutory due date and on the day', () => {
    const due = (iso: string) => ({ kind: 'PF', amount: 10000, dueDate: new Date(`${iso}T23:59:59.999Z`) });
    expect(planPayrollReminders({ ...base, now: at('2026-11-12'), dues: [due('2026-11-15')] })).toHaveLength(1);
    expect(planPayrollReminders({ ...base, now: at('2026-11-14'), dues: [due('2026-11-15')] })[0]!.title).toContain('1 day');
    expect(planPayrollReminders({ ...base, now: at('2026-11-15'), dues: [due('2026-11-15')] })[0]!.title).toContain('today');
    expect(planPayrollReminders({ ...base, now: at('2026-11-13'), dues: [due('2026-11-15')] })).toHaveLength(0);
  });
  it('nags about overdue payments only on Mondays', () => {
    const due = { kind: 'TDS', amount: 5000, dueDate: new Date('2026-11-07T23:59:59.999Z') };
    expect(planPayrollReminders({ ...base, now: at('2026-11-16'), dues: [due] })[0]!.title).toContain('overdue'); // Monday
    expect(planPayrollReminders({ ...base, now: at('2026-11-17'), dues: [due] })).toHaveLength(0);
  });
  it('reminds when a run has waited two days for approval', () => {
    expect(planPayrollReminders({ ...base, now: at('2026-11-10'), reviewWaitingSince: at('2026-11-08') }).map((r) => r.title)).toContain('Payroll is waiting for approval');
    expect(planPayrollReminders({ ...base, now: at('2026-11-09'), reviewWaitingSince: at('2026-11-08') })).toHaveLength(0);
  });
});
