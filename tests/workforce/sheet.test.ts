import { describe, expect, it } from 'vitest';
import { buildSheet } from '@/lib/workforce/sheet';
import { utcDay } from '@/lib/workforce/calendar';

const week = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const base = { year: 2026, month: 11, workingDays: week, holidays: new Set(['2026-11-12']), today: utcDay('2026-11-20') };

describe('buildSheet', () => {
  it('marks weekly offs and holidays and counts attendance by status', () => {
    const s = buildSheet({
      ...base,
      employees: [{ id: 'e1', name: 'Asha', joinDate: null, exitDate: null }],
      attendance: [
        { employeeId: 'e1', date: utcDay('2026-11-02'), status: 'PRESENT' }, { employeeId: 'e1', date: utcDay('2026-11-03'), status: 'LATE' },
        { employeeId: 'e1', date: utcDay('2026-11-04'), status: 'REMOTE' }, { employeeId: 'e1', date: utcDay('2026-11-05'), status: 'ABSENT' }, { employeeId: 'e1', date: utcDay('2026-11-06'), status: 'HALF_DAY' },
      ],
      leaves: [],
    });
    const r = s.rows[0]!;
    expect(r.days[0]).toBe('OFF'); // Sun 1 Nov
    expect(r.days[11]).toBe('HOL'); // 12 Nov
    expect(r.days.slice(1, 6)).toEqual(['P', 'L', 'R', 'A', 'H']);
    expect(r.totals).toMatchObject({ present: 3.5, late: 1, remote: 1, absent: 1, halfDay: 1 });
  });

  it('counts a working day with no record as missing, but only up to today', () => {
    const s = buildSheet({ ...base, employees: [{ id: 'e1', name: 'A', joinDate: null, exitDate: null }], attendance: [], leaves: [] });
    const r = s.rows[0]!;
    expect(r.days[8]).toBe(''); // Mon 9 Nov, past, no record
    expect(r.days[22]).toBe(''); // Mon 23 Nov, future
    expect(r.totals.missing).toBe(14); // 15 working days up to 20 Nov minus the 12 Nov holiday
  });

  it('shows approved leave, split into paid and unpaid, and half-day leave as half', () => {
    const s = buildSheet({
      ...base,
      employees: [{ id: 'e1', name: 'A', joinDate: null, exitDate: null }],
      attendance: [],
      leaves: [
        { employeeId: 'e1', start: utcDay('2026-11-02'), end: utcDay('2026-11-03'), days: 2, isPaid: true },
        { employeeId: 'e1', start: utcDay('2026-11-04'), end: utcDay('2026-11-04'), days: 0.5, isPaid: false },
      ],
    });
    const r = s.rows[0]!;
    expect(r.days.slice(1, 4)).toEqual(['LV', 'LV', 'UL']);
    expect(r.totals).toMatchObject({ paidLeave: 2, unpaidLeave: 0.5 });
  });

  it('leaves days before joining and after leaving blank', () => {
    const s = buildSheet({ ...base, employees: [{ id: 'e1', name: 'A', joinDate: utcDay('2026-11-10'), exitDate: utcDay('2026-11-18') }], attendance: [], leaves: [] });
    const r = s.rows[0]!;
    expect(r.days[8]).toBe('-'); // 9 Nov
    expect(r.days[9]).toBe(''); // 10 Nov, first day
    expect(r.days[18]).toBe('-'); // 19 Nov, after leaving
  });
});
