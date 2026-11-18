import { describe, expect, it } from 'vitest';
import {
  addUtcMonths, countBillableMailboxes, cycleStart, nextAnniversary, managedTitles, pickBillableCount, planRetainerItemSync,
  prorateIncrease, remainingCycleFraction, utcDay,
} from '@/lib/email-billing/usage-math';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('utcDay', () => {
  it('truncates to UTC midnight', () => {
    expect(utcDay(new Date('2026-11-17T23:59:59.999Z')).toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });
});

describe('cycle fraction and proration', () => {
  it('derives the cycle start from the billing frequency', () => {
    expect(cycleStart(d('2026-12-01'), 'MONTHLY').toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(cycleStart(d('2026-12-01'), 'QUARTERLY').toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(cycleStart(d('2026-12-01'), 'ANNUALLY').toISOString().slice(0, 10)).toBe('2025-12-01');
  });

  it('is the share of the cycle still ahead, clamped to 0..1', () => {
    expect(remainingCycleFraction(d('2026-11-01'), d('2026-12-01'), 'MONTHLY')).toBe(1);
    expect(remainingCycleFraction(d('2026-11-16'), d('2026-12-01'), 'MONTHLY')).toBe(0.5);
    expect(remainingCycleFraction(d('2026-12-01'), d('2026-12-01'), 'MONTHLY')).toBe(0);
    expect(remainingCycleFraction(d('2026-12-05'), d('2026-12-01'), 'MONTHLY')).toBe(0);
    expect(remainingCycleFraction(d('2026-10-01'), d('2026-12-01'), 'MONTHLY')).toBe(1);
  });

  it('prorates increases only, rounded to cents', () => {
    expect(prorateIncrease(30, 0.5)).toBe(15);
    expect(prorateIncrease(10, 1 / 3)).toBe(3.33);
    expect(prorateIncrease(0, 0.5)).toBe(0);
    expect(prorateIncrease(-10, 0.5)).toBe(0);
    expect(prorateIncrease(10, 0)).toBe(0);
  });
});

describe('billable counts', () => {
  const boxes = [
    { status: 'ACTIVE', isAdmin: false }, { status: 'ACTIVE', isAdmin: true },
    { status: 'REMOVED', isAdmin: false }, { status: 'ARCHIVED', isAdmin: false },
  ];
  it('counts only active mailboxes and can exclude admins', () => {
    expect(countBillableMailboxes(boxes, { ignoreAdmins: false })).toBe(2);
    expect(countBillableMailboxes(boxes, { ignoreAdmins: true })).toBe(1);
  });

  it('LATEST ignores history; HIGH_WATER_MARK uses the cycle peak', () => {
    expect(pickBillableCount('LATEST', 4, [9, 8])).toBe(4);
    expect(pickBillableCount('HIGH_WATER_MARK', 4, [3, 9, 8])).toBe(9);
    expect(pickBillableCount('HIGH_WATER_MARK', 4, [])).toBe(4);
  });
});

describe('planRetainerItemSync', () => {
  const [hosting, seats, extra] = managedTitles('a.com');
  const row = (id: string, title: string, quantity: number, unitPrice: number, taxRate: number | null = 0.18) => ({ id, title, quantity, unitPrice, taxRate });

  it('updates changed managed lines and leaves identical ones alone', () => {
    const plan = planRetainerItemSync([row('1', hosting, 1, 20), row('2', extra, 1, 3)], [{ title: hosting, quantity: 1, unitPrice: 20 }, { title: extra, quantity: 4, unitPrice: 3 }], 'a.com');
    expect(plan).toEqual({ update: [{ id: '2', quantity: 4, unitPrice: 3 }], create: [], remove: [] });
  });

  it('creates a newly needed line with the existing tax rate, and removes a line the calculator no longer emits', () => {
    const plan = planRetainerItemSync([row('1', hosting, 1, 20, 0.12), row('2', extra, 2, 3)], [{ title: hosting, quantity: 1, unitPrice: 20 }], 'a.com');
    expect(plan.remove).toEqual(['2']);
    const grow = planRetainerItemSync([row('1', hosting, 1, 20, 0.12)], [{ title: hosting, quantity: 1, unitPrice: 20 }, { title: extra, quantity: 2, unitPrice: 3 }], 'a.com');
    expect(grow.create).toEqual([{ title: extra, quantity: 2, unitPrice: 3, taxRate: 0.12 }]);
  });

  it('never touches lines a person added or that belong to another domain', () => {
    const plan = planRetainerItemSync([row('1', seats, 3, 4), row('9', 'Custom setup fee', 1, 100), row('8', 'Email Mailbox Seats - other.com', 5, 4)], [{ title: seats, quantity: 5, unitPrice: 4 }], 'a.com');
    expect(plan.update).toEqual([{ id: '1', quantity: 5, unitPrice: 4 }]);
    expect(plan.remove).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it('does not create a zero-quantity line', () => {
    expect(planRetainerItemSync([], [{ title: seats, quantity: 0, unitPrice: 4 }], 'a.com').create).toEqual([]);
  });
});

describe('nextAnniversary (billing follows the issue date)', () => {
  const next = (start: string, freq: string, from: string) => nextAnniversary(d(start), freq, d(from)).toISOString().slice(0, 10);

  it('bills on the start day itself when it is today or later', () => {
    expect(next('2026-11-18', 'MONTHLY', '2026-11-18')).toBe('2026-11-18');
    expect(next('2026-12-05', 'ANNUALLY', '2026-11-18')).toBe('2026-12-05');
    expect(nextAnniversary(new Date('2026-11-18T00:00:00Z'), 'MONTHLY', new Date('2026-11-18T15:30:00Z')).toISOString().slice(0, 10)).toBe('2026-11-18');
  });

  it('otherwise bills on the next monthly, quarterly or yearly anniversary, counting today', () => {
    expect(next('2026-01-15', 'MONTHLY', '2026-11-18')).toBe('2026-12-15');
    expect(next('2026-01-15', 'MONTHLY', '2026-11-15')).toBe('2026-11-15');
    expect(next('2026-01-15', 'MONTHLY', '2026-11-14')).toBe('2026-11-15');
    expect(next('2025-03-10', 'ANNUALLY', '2026-11-18')).toBe('2027-03-10');
    expect(next('2025-03-10', 'ANNUALLY', '2026-03-10')).toBe('2026-03-10');
    expect(next('2025-03-10', 'ANNUALLY', '2026-03-11')).toBe('2027-03-10');
    expect(next('2026-01-20', 'QUARTERLY', '2026-11-18')).toBe('2027-01-20');
    expect(next('2026-02-20', 'QUARTERLY', '2026-11-18')).toBe('2026-11-20');
  });

  it('keeps month-end starts on the end of the month without drifting', () => {
    expect(next('2026-01-31', 'MONTHLY', '2026-02-10')).toBe('2026-02-28');
    expect(next('2026-01-31', 'MONTHLY', '2026-03-01')).toBe('2026-03-31');
    expect(next('2026-01-31', 'MONTHLY', '2026-04-05')).toBe('2026-04-30');
    expect(next('2026-01-31', 'QUARTERLY', '2026-11-18')).toBe('2027-01-31');
    expect(next('2026-01-31', 'QUARTERLY', '2026-02-01')).toBe('2026-04-30');
  });

  it('handles 29 February starts in and out of leap years', () => {
    expect(next('2024-02-29', 'ANNUALLY', '2026-11-18')).toBe('2027-02-28');
    expect(next('2024-02-29', 'ANNUALLY', '2027-03-01')).toBe('2028-02-29');
    expect(next('2024-02-29', 'ANNUALLY', '2025-01-01')).toBe('2025-02-28');
  });

  it('is never in the past and never skips an anniversary, for many starts and dates', () => {
    const starts = ['2023-05-31', '2024-02-29', '2025-12-01', '2026-06-15', '2026-11-30'];
    for (const start of starts) for (const freq of ['MONTHLY', 'QUARTERLY', 'ANNUALLY']) {
      const step = freq === 'MONTHLY' ? 1 : freq === 'QUARTERLY' ? 3 : 12;
      for (let day = 0; day < 800; day += 7) {
        const from = new Date(Date.UTC(2026, 0, 1 + day));
        const due = nextAnniversary(d(start), freq, from);
        expect(due.getTime()).toBeGreaterThanOrEqual(utcDay(from).getTime());
        // The previous anniversary (if any) is strictly before today, so nothing was skipped.
        const startDay = d(start);
        const monthsFromStart = (due.getUTCFullYear() - startDay.getUTCFullYear()) * 12 + (due.getUTCMonth() - startDay.getUTCMonth());
        if (monthsFromStart > 0) {
          expect(monthsFromStart % step).toBe(0);
          expect(addUtcMonths(startDay, monthsFromStart - step).getTime()).toBeLessThan(utcDay(from).getTime());
        }
      }
    }
  });
});
