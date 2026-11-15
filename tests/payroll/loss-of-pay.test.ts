import { describe, expect, it } from 'vitest';
import { deriveLossOfPay } from '@/lib/payroll/integrations/loss-of-pay';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const base = { periodStart: d('2026-10-01'), periodEnd: d('2026-10-31'), workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], holidays: new Set<string>(), attendance: [], leaves: [] };

describe('loss of pay from Workforce', () => {
  it('counts an absent working day once and ignores weekends', () => {
    const r = deriveLossOfPay({ ...base, attendance: [{ date: d('2026-10-05'), status: 'ABSENT' }, { date: d('2026-10-03'), status: 'ABSENT' }] }); // 5 Oct is Monday, 3 Oct is Saturday
    expect(r.absentDays).toBe(1);
    expect(r.lopDays).toBe(1);
  });
  it('counts a half day as half', () => {
    expect(deriveLossOfPay({ ...base, attendance: [{ date: d('2026-10-06'), status: 'HALF_DAY' }] }).lopDays).toBe(0.5);
  });
  it('counts approved unpaid leave but not paid leave', () => {
    const r = deriveLossOfPay({ ...base, leaves: [{ start: d('2026-10-12'), end: d('2026-10-14'), days: 3, isPaid: false }, { start: d('2026-10-19'), end: d('2026-10-20'), days: 2, isPaid: true }] });
    expect(r.unpaidLeaveDays).toBe(3);
    expect(r.lopDays).toBe(3);
  });
  it('does not double count a day covered by leave and marked absent', () => {
    const r = deriveLossOfPay({ ...base, leaves: [{ start: d('2026-10-12'), end: d('2026-10-12'), days: 1, isPaid: false }], attendance: [{ date: d('2026-10-12'), status: 'ABSENT' }] });
    expect(r.lopDays).toBe(1);
  });
  it('never counts holidays', () => {
    const r = deriveLossOfPay({ ...base, holidays: new Set(['2026-10-02']), attendance: [{ date: d('2026-10-02'), status: 'ABSENT' }] });
    expect(r.lopDays).toBe(0);
  });
  it('only looks inside the period of employment and reports days with no record', () => {
    const r = deriveLossOfPay({ ...base, joinDate: d('2026-10-20') });
    expect(r.missingDays).toBe(9); // working days from 20 to 31 October
    expect(r.lopDays).toBe(0);
  });
  it('handles a half-day leave on one date', () => {
    expect(deriveLossOfPay({ ...base, leaves: [{ start: d('2026-10-07'), end: d('2026-10-07'), days: 0.5, isPaid: false }] }).lopDays).toBe(0.5);
  });
});
