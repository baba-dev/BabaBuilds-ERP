import { describe, expect, it } from 'vitest';
import { cashSuggestions, changeDue, computePosTotals, percentDiscount } from '@/lib/pos/totals';

describe('computePosTotals', () => {
  it('adds GST on top of the price', () => {
    const t = computePosTotals([{ unitPrice: 380, quantity: 2, taxRate: 18 }]);
    expect(t).toMatchObject({ subtotal: 760, discount: 0, taxable: 760, tax: 136.8, total: 896.8 });
  });

  it('charges no tax when the seller may not collect GST', () => {
    const t = computePosTotals([{ unitPrice: 100, quantity: 1, taxRate: 18 }], 0, false);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(100);
  });

  it('shares a discount across lines and taxes what is left', () => {
    const t = computePosTotals([{ unitPrice: 100, quantity: 1, taxRate: 18 }, { unitPrice: 100, quantity: 1, taxRate: 5 }], 20);
    expect(t.lines.map((l) => l.discount)).toEqual([10, 10]);
    expect(t.tax).toBe(16.2 + 4.5);
    expect(t.total).toBe(180 + 20.7);
  });

  it('never splits a paisa: line discounts add back to the discount', () => {
    const t = computePosTotals([{ unitPrice: 33.33, quantity: 1, taxRate: 12 }, { unitPrice: 33.33, quantity: 1, taxRate: 12 }, { unitPrice: 33.34, quantity: 1, taxRate: 12 }], 10);
    expect(Math.round(t.lines.reduce((s, l) => s + l.discount, 0) * 100)).toBe(1000);
    expect(t.discount).toBe(10);
  });

  it('caps the discount at the subtotal', () => {
    const t = computePosTotals([{ unitPrice: 50, quantity: 1, taxRate: 18 }], 500);
    expect(t.discount).toBe(50);
    expect(t.total).toBe(0);
  });

  it('is exact on awkward floats', () => {
    expect(computePosTotals([{ unitPrice: 0.1, quantity: 3, taxRate: 0 }]).total).toBe(0.3);
  });
});

describe('helpers', () => {
  it('percentDiscount rounds to the paisa and clamps', () => {
    expect(percentDiscount(333.33, 10)).toBe(33.33);
    expect(percentDiscount(100, 150)).toBe(100);
    expect(percentDiscount(100, -5)).toBe(0);
  });

  it('changeDue needs enough cash', () => {
    expect(changeDue(896.8, 1000)).toBe(103.2);
    expect(changeDue(100, 100)).toBe(0);
    expect(changeDue(100, 99.99)).toBeNull();
  });

  it('cashSuggestions starts at the exact amount and stays small', () => {
    const s = cashSuggestions(896.8);
    expect(s[0]).toBe(897);
    expect(s.length).toBeLessThanOrEqual(4);
    expect(s).toEqual([...s].sort((a, b) => a - b));
  });
});
