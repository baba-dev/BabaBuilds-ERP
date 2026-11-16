import { describe, expect, it } from 'vitest';
import { checkInStatus, countLeaveDays, daysByYear, holidayDates, prorateEntitlement, rangesOverlap, todayInZone, utcDay } from '@/lib/workforce/calendar';

const week = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

describe('utcDay', () => {
  it('files a date under the same UTC day however it is written', () => {
    expect(utcDay('2026-11-16').toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(utcDay(new Date('2026-11-16T22:30:00Z')).toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });
});

describe('countLeaveDays', () => {
  const none = new Set<string>();
  it('counts working days only: a Friday to Tuesday request is three days', () => {
    const r = countLeaveDays({ start: utcDay('2026-11-13'), end: utcDay('2026-11-17'), workingDays: week, holidays: none });
    expect(r.days).toBe(3); // Fri 13, Mon 16, Tue 17
    expect(r.dates.map((d) => d.date)).toEqual(['2026-11-13', '2026-11-16', '2026-11-17']);
  });

  it('does not charge public holidays', () => {
    const hol = new Set(['2026-11-16']);
    expect(countLeaveDays({ start: utcDay('2026-11-16'), end: utcDay('2026-11-18'), workingDays: week, holidays: hol }).days).toBe(2);
  });

  it('allows a half day on a single working day only', () => {
    expect(countLeaveDays({ start: utcDay('2026-11-16'), end: utcDay('2026-11-16'), workingDays: week, holidays: none, halfDay: 'FIRST' }).days).toBe(0.5);
    expect(countLeaveDays({ start: utcDay('2026-11-16'), end: utcDay('2026-11-17'), workingDays: week, holidays: none, halfDay: 'FIRST' }).days).toBe(2);
  });

  it('is zero for a request that covers only a weekend', () => {
    expect(countLeaveDays({ start: utcDay('2026-11-14'), end: utcDay('2026-11-15'), workingDays: week, holidays: none }).days).toBe(0);
  });

  it('splits a request across a year end', () => {
    const r = countLeaveDays({ start: utcDay('2026-12-30'), end: utcDay('2027-01-05'), workingDays: week, holidays: none });
    expect(daysByYear(r.dates)).toEqual({ 2026: 2, 2027: 3 });
  });
});

describe('holidayDates', () => {
  it('repeats yearly holidays in every year of the range', () => {
    const set = holidayDates([{ date: new Date('2020-01-26T00:00:00Z'), isRecurring: true }, { date: new Date('2026-12-31T00:00:00Z'), isRecurring: false }], utcDay('2026-12-20'), utcDay('2027-01-31'));
    expect([...set].sort()).toEqual(['2026-01-26', '2026-12-31', '2027-01-26']);
  });
});

describe('rangesOverlap', () => {
  it('is inclusive at both ends', () => {
    const r = (a: string, b: string) => ({ start: utcDay(a), end: utcDay(b) });
    expect(rangesOverlap(r('2026-11-10', '2026-11-12'), r('2026-11-12', '2026-11-14'))).toBe(true);
    expect(rangesOverlap(r('2026-11-10', '2026-11-11'), r('2026-11-12', '2026-11-14'))).toBe(false);
  });
});

describe('prorateEntitlement', () => {
  it('gives the full year to people who joined earlier and a share to mid-year joiners', () => {
    expect(prorateEntitlement(18, utcDay('2024-03-01'), 2026)).toBe(18);
    expect(prorateEntitlement(18, utcDay('2026-07-10'), 2026)).toBe(9); // 6 months left
    expect(prorateEntitlement(18, utcDay('2026-11-01'), 2026)).toBe(3); // 2 months left
    expect(prorateEntitlement(18, utcDay('2027-02-01'), 2026)).toBe(0);
    expect(prorateEntitlement(12, null, 2026)).toBe(12);
  });
});

describe('workplace time', () => {
  it('files an evening check-in in India under the same Indian day', () => {
    // 20:30 UTC on the 15th is 02:00 on the 16th in India.
    expect(todayInZone(new Date('2026-11-15T20:30:00Z'), 'Asia/Kolkata').toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(todayInZone(new Date('2026-11-15T20:30:00Z'), 'UTC').toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('marks a check-in late only after the grace period', () => {
    expect(checkInStatus(new Date('2026-11-16T03:40:00Z'), 'Asia/Kolkata', '09:00', 15)).toBe('PRESENT'); // 09:10 IST
    expect(checkInStatus(new Date('2026-11-16T03:50:00Z'), 'Asia/Kolkata', '09:00', 15)).toBe('LATE'); // 09:20 IST
  });
});
