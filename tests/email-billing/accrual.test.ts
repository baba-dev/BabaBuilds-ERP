import { describe, expect, it } from 'vitest';
import { accrueAddress, monthlyRate, monthsBetween } from '@/lib/email-billing/accrual';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const months = (a: string, b: string) => monthsBetween(d(a), d(b));
const day = (date: Date) => date.toISOString().slice(0, 10);

describe('monthsBetween (start inclusive, end exclusive)', () => {
  it('counts exact calendar months as whole numbers', () => {
    expect(months('2026-01-10', '2026-02-10')).toBe(1);
    expect(months('2026-01-10', '2026-04-10')).toBe(3);
    expect(months('2025-11-18', '2026-11-18')).toBe(12);
  });

  it('adds the remaining days as a fraction of the month they fall in', () => {
    expect(months('2026-01-10', '2026-01-25')).toBeCloseTo(15 / 31, 10);
    expect(months('2026-02-01', '2026-02-15')).toBeCloseTo(14 / 28, 10);
    // 40 days from 10 January: one month (to 10 Feb) plus 9 days of a 28-day month (10 Feb to 10 Mar).
    expect(months('2026-01-10', '2026-02-19')).toBeCloseTo(1 + 9 / 28, 10);
  });

  it('is zero for an empty or backwards period', () => {
    expect(months('2026-03-01', '2026-03-01')).toBe(0);
    expect(months('2026-03-02', '2026-03-01')).toBe(0);
  });

  it('keeps month-end starts from drifting', () => {
    expect(months('2026-01-31', '2026-02-28')).toBeCloseTo(28 / 28, 10);
    expect(months('2026-01-31', '2026-03-31')).toBe(2);
    expect(months('2024-02-29', '2025-02-28')).toBe(12);
  });

  it('is continuous and never decreases as the end date moves later', () => {
    for (const start of ['2026-01-31', '2026-02-29'.replace('29', '28'), '2025-12-15', '2024-02-29']) {
      let prev = 0;
      for (let i = 1; i <= 800; i += 1) {
        const end = new Date(d(start).getTime() + i * 86_400_000);
        const value = monthsBetween(d(start), end);
        expect(value).toBeGreaterThanOrEqual(prev);
        expect(value - prev).toBeLessThan(0.1); // a day is never more than ~1/28 of a month
        prev = value;
      }
    }
  });

  it('splitting a period at any date and adding the parts gives the whole, when the split falls on an anniversary', () => {
    const whole = months('2026-01-10', '2026-07-10');
    expect(months('2026-01-10', '2026-03-10') + months('2026-03-10', '2026-07-10')).toBeCloseTo(whole, 10);
  });
});

describe('monthlyRate', () => {
  it('turns a monthly, quarterly or yearly price into a monthly one', () => {
    expect(monthlyRate(100, 'MONTHLY')).toBe(100);
    expect(monthlyRate(300, 'QUARTERLY')).toBe(100);
    expect(monthlyRate(1200, 'ANNUALLY')).toBe(100);
    expect(monthlyRate('90.50', 'MONTHLY')).toBe(90.5);
  });
});

describe('accrueAddress', () => {
  const base = { billedThrough: null, monthlyRate: 100 };

  it('charges from the first day through the collection day, both inclusive', () => {
    // 10 January through 9 February = one month of service.
    const p = accrueAddress({ ...base, billingStartsOn: d('2026-01-10'), asOf: d('2026-02-09') })!;
    expect(day(p.firstDay)).toBe('2026-01-10');
    expect(day(p.lastDay)).toBe('2026-02-09');
    expect(p.months).toBe(1);
    expect(p.amount).toBe(100);
  });

  it('charges a single day when started and collected on the same day', () => {
    const p = accrueAddress({ ...base, billingStartsOn: d('2026-11-18'), asOf: d('2026-11-18') })!;
    expect(p.amount).toBeCloseTo(100 / 30, 1);
    expect(p.months).toBeCloseTo(1 / 30, 10);
  });

  it('continues the day after what was last collected, so nothing is charged twice or skipped', () => {
    const first = accrueAddress({ ...base, billingStartsOn: d('2026-01-10'), asOf: d('2026-03-09') })!;
    const second = accrueAddress({ ...base, billingStartsOn: d('2026-01-10'), billedThrough: first.lastDay, asOf: d('2026-05-09') })!;
    expect(day(second.firstDay)).toBe('2026-03-10');
    const together = accrueAddress({ ...base, billingStartsOn: d('2026-01-10'), asOf: d('2026-05-09') })!;
    expect(first.amount + second.amount).toBeCloseTo(together.amount, 2);
    expect(together.amount).toBe(400);
  });

  it('charges nothing before it starts or when everything is already collected', () => {
    expect(accrueAddress({ ...base, billingStartsOn: d('2026-12-01'), asOf: d('2026-11-18') })).toBeNull();
    expect(accrueAddress({ ...base, billingStartsOn: d('2026-01-01'), billedThrough: d('2026-11-18'), asOf: d('2026-11-18') })).toBeNull();
    expect(accrueAddress({ ...base, billingStartsOn: d('2026-01-01'), billedThrough: d('2026-12-31'), asOf: d('2026-11-18') })).toBeNull();
  });

  it('stops when service ended: removal or cancellation bounds the charge', () => {
    // Removed on 20 Feb (first day without service): charged through 19 Feb.
    const p = accrueAddress({ ...base, billingStartsOn: d('2026-01-20'), asOf: d('2026-11-18'), endsBefore: d('2026-02-20') })!;
    expect(day(p.lastDay)).toBe('2026-02-19');
    expect(p.months).toBe(1);
    // A removal after the collection date does not extend anything.
    const q = accrueAddress({ ...base, billingStartsOn: d('2026-01-20'), asOf: d('2026-02-19'), endsBefore: d('2026-06-01') })!;
    expect(day(q.lastDay)).toBe('2026-02-19');
    // Already collected through the removal: nothing more.
    expect(accrueAddress({ ...base, billingStartsOn: d('2026-01-20'), billedThrough: d('2026-02-19'), asOf: d('2026-11-18'), endsBefore: d('2026-02-20') })).toBeNull();
  });

  it('rounds each address to cents, and the same inputs always give the same amount', () => {
    const args = { ...base, monthlyRate: 99.99, billingStartsOn: d('2026-01-10'), asOf: d('2026-02-01') };
    const a = accrueAddress(args)!;
    expect(a.amount).toBe(Math.round(a.amount * 100) / 100);
    expect(accrueAddress(args)).toEqual(a);
  });

  it('works for quarterly and yearly prices via the monthly rate', () => {
    const p = accrueAddress({ billedThrough: null, billingStartsOn: d('2026-01-10'), asOf: d('2026-01-09'.replace('01-09', '07-09')), monthlyRate: monthlyRate(1200, 'ANNUALLY') })!;
    expect(p.months).toBe(6);
    expect(p.amount).toBe(600);
  });
});
