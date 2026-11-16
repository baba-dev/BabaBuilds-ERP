import { describe, expect, it } from 'vitest';
import { priceShopOrder, toMinorUnits } from '@/lib/shop/pricing';
import { canDelete, canMove, needsAction } from '@/lib/shop/status';

const line = (id: string, qty: number, price: number, rate: number) => ({ productId: id, name: id, sku: id, quantity: qty, unitPrice: price, taxRate: rate });

describe('priceShopOrder', () => {
  it('adds GST per line at each product rate', () => {
    const p = priceShopOrder([line('a', 2, 380, 18), line('b', 1, 100, 5)], true);
    expect(p).toMatchObject({ subtotal: 860, tax: 141.8, total: 1001.8 });
    expect(p.lines.map((l) => l.lineTax)).toEqual([136.8, 5]);
  });

  it('charges nothing extra when the shop may not collect GST', () => {
    const p = priceShopOrder([line('a', 1, 100, 18)], false);
    expect(p.tax).toBe(0);
    expect(p.total).toBe(100);
    expect(p.lines[0]!.taxRate).toBe(0);
  });

  it('merges the same product so stock is checked against the whole quantity', () => {
    const p = priceShopOrder([line('a', 2, 10, 0), line('a', 3, 10, 0)], true);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]!.quantity).toBe(5);
  });
});

describe('toMinorUnits', () => {
  it('uses paise/cents, but whole units for zero-decimal currencies', () => {
    expect(toMinorUnits(1001.8, 'INR')).toBe(100180);
    expect(toMinorUnits(0.29, 'usd')).toBe(29);
    expect(toMinorUnits(500, 'JPY')).toBe(500);
  });
});

describe('order status rules', () => {
  it('follows the fulfilment path and never goes backwards', () => {
    expect(canMove('PENDING', 'PAID')).toBe(true);
    expect(canMove('PAID', 'SHIPPED')).toBe(true);
    expect(canMove('SHIPPED', 'FULFILLED')).toBe(true);
    expect(canMove('FULFILLED', 'PENDING' as never)).toBe(false);
    expect(canMove('REFUNDED', 'PAID')).toBe(false);
    expect(canMove('PAID', 'PENDING' as never)).toBe(false);
  });

  it('only unpaid orders can be deleted', () => {
    expect(canDelete('PENDING')).toBe(true);
    expect(canDelete('FAILED')).toBe(true);
    expect(canDelete('PAID')).toBe(false);
    expect(canDelete('REFUNDED')).toBe(false);
  });

  it('flags orders waiting on the owner', () => {
    expect(needsAction('PAID')).toBe(true);
    expect(needsAction('REFUND_DUE')).toBe(true);
    expect(needsAction('SHIPPED')).toBe(false);
  });
});

import { planShopMaintenance } from '@/lib/shop/maintenance';

describe('planShopMaintenance', () => {
  const now = new Date('2026-11-18T07:00:00Z'); // a Wednesday
  const o = (id: string, status: string, hoursAgo: number, paid = false) => ({ id, status, createdAt: new Date(now.getTime() - hoursAgo * 3_600_000), paidAt: paid ? new Date(now.getTime() - hoursAgo * 3_600_000) : null, shippedAt: null });

  it('closes checkouts older than a day and leaves fresh ones', () => {
    expect(planShopMaintenance([o('a', 'PENDING', 30), o('b', 'PENDING', 3)], now).expire).toEqual(['a']);
  });

  it('nudges for paid orders unshipped after two days, and for refunds due', () => {
    const p = planShopMaintenance([o('a', 'PAID', 60, true), o('b', 'PAID', 5, true), o('c', 'REFUND_DUE', 1, true)], now);
    expect(p.nudges.map((n) => n.key.split(':')[0])).toEqual(['refund', 'ship']);
    expect(p.nudges[1]!.title).toContain('1 paid order is');
  });

  it('does not nag about shipping at the weekend', () => {
    const sat = new Date('2026-11-21T07:00:00Z');
    expect(planShopMaintenance([{ id: 'a', status: 'PAID', createdAt: sat, paidAt: new Date('2026-11-15T00:00:00Z'), shippedAt: null }], sat).nudges).toEqual([]);
  });
});
