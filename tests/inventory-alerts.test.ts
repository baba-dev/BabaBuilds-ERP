import { describe, expect, test } from 'vitest';
import { planInventoryAlerts } from '@/lib/inventory/alerts';

const base = { outOfStock: [], lowStock: [], urgentReorder: 0, overdueOrders: [] as { poNumber: string; supplier: string; expectedDate: Date }[] };
const monday = new Date('2026-11-16T07:00:00Z');
const tuesday = new Date('2026-11-17T07:00:00Z');

describe('planInventoryAlerts', () => {
  test('out of stock is nudged Monday and Thursday only', () => {
    expect(planInventoryAlerts({ ...base, now: monday, outOfStock: ['Cement'] })).toHaveLength(1);
    expect(planInventoryAlerts({ ...base, now: tuesday, outOfStock: ['Cement'] })).toHaveLength(0);
    expect(planInventoryAlerts({ ...base, now: new Date('2026-11-19T07:00:00Z'), outOfStock: ['Cement'] })).toHaveLength(1);
  });

  test('low stock digest is Monday only and mentions urgent reorders', () => {
    const [a] = planInventoryAlerts({ ...base, now: monday, lowStock: ['Bolt', 'Nut'], urgentReorder: 2 });
    expect(a.title).toContain('2 items are running low');
    expect(a.body).toContain('2 should be reordered now');
    expect(planInventoryAlerts({ ...base, now: tuesday, lowStock: ['Bolt'] })).toHaveLength(0);
  });

  test('long lists are shortened', () => {
    const [a] = planInventoryAlerts({ ...base, now: monday, outOfStock: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(a.body).toContain('and 2 more');
  });

  test('late purchase orders nudge on day 1, 7 and every week after', () => {
    const due = new Date('2026-11-09T00:00:00Z');
    const order = { poNumber: 'PO-0001', supplier: 'Shree', expectedDate: due };
    const on = (d: string) => planInventoryAlerts({ ...base, now: new Date(`${d}T07:00:00Z`), overdueOrders: [order] }).length;
    expect(on('2026-11-10')).toBe(1);
    expect(on('2026-11-11')).toBe(0);
    expect(on('2026-11-16')).toBe(1);
    expect(on('2026-11-23')).toBe(1);
    expect(on('2026-11-24')).toBe(0);
  });
});
