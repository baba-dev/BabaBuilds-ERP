import { describe, expect, it } from 'vitest';
import { cashVariance, customerBalance, summarizeShift, varianceNeedsNote } from '@/lib/pos/closeout';

describe('summarizeShift', () => {
  it('expects only cash in the till and groups every method', () => {
    const s = summarizeShift([{ method: 'CASH', amount: 100.1 }, { method: 'CASH', amount: 200.2 }, { method: 'UPI', amount: 500 }, { method: 'CARD', amount: 50 }]);
    expect(s.expectedCash).toBe(300.3);
    expect(s.total).toBe(850.3);
    expect(s.byMethod[0]).toEqual({ method: 'UPI', count: 1, amount: 500 });
  });

  it('is zero for an empty shift', () => {
    expect(summarizeShift([])).toEqual({ expectedCash: 0, total: 0, byMethod: [] });
  });
});

describe('cashVariance', () => {
  it('is negative when the till is short and exact on floats', () => {
    expect(cashVariance(300.3, 290)).toBe(-10.3);
    expect(cashVariance(0.3, 0.1 + 0.2)).toBe(0);
    expect(cashVariance(100, 105.5)).toBe(5.5);
  });

  it('asks for a note only when there is a difference', () => {
    expect(varianceNeedsNote(0)).toBe(false);
    expect(varianceNeedsNote(-0.01)).toBe(true);
    expect(varianceNeedsNote(1, 2)).toBe(false);
  });
});

describe('customerBalance', () => {
  const now = new Date('2026-11-16T00:00:00Z');
  it('adds up unpaid balances and the overdue part, ignoring paid and void', () => {
    const b = customerBalance([
      { total: 1000, received: 400, dueDate: new Date('2026-11-01'), status: 'PARTIALLY_PAID' },
      { total: 500, received: 0, dueDate: new Date('2026-12-01'), status: 'PENDING' },
      { total: 300, received: 300, dueDate: null, status: 'PAID' },
      { total: 900, received: 0, dueDate: new Date('2026-10-01'), status: 'VOID' },
    ], now);
    expect(b).toEqual({ owed: 1100, overdue: 600, open: 2 });
  });
});
