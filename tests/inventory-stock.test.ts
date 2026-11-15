import { describe, expect, it } from 'vitest';
import { deadStock, reorderSuggestions, stockStatus, summarizeStock, weightedAverageCost, type StockProduct } from '@/lib/inventory/stock';

const p = (over: Partial<StockProduct> = {}): StockProduct => ({
  id: 'p1', name: 'Widget', sku: 'W-1', unit: 'pcs', category: null, currentStock: 50, safetyStock: 10, costPrice: 20, baselinePrice: 30,
  reorderQuantity: null, leadTimeDays: null, preferredVendorId: null, createdAt: new Date('2026-01-01'), ...over,
});
const none = new Map<string, { last30: number; last90: number }>();

describe('stock status', () => {
  it('flips at zero and at the safety level', () => {
    expect(stockStatus(0, 5)).toBe('OUT_OF_STOCK');
    expect(stockStatus(-2, 5)).toBe('OUT_OF_STOCK');
    expect(stockStatus(5, 5)).toBe('LOW_STOCK');
    expect(stockStatus(6, 5)).toBe('IN_STOCK');
  });
});

describe('weighted average cost', () => {
  it('blends old stock and the new goods', () => {
    expect(weightedAverageCost({ stock: 100, cost: 10, qty: 100, unitCost: 20 })).toBe(15);
    expect(weightedAverageCost({ stock: 30, cost: 10, qty: 10, unitCost: 14 })).toBe(11);
  });
  it('takes the new cost when nothing is on hand', () => {
    expect(weightedAverageCost({ stock: 0, cost: 10, qty: 5, unitCost: 12.5 })).toBe(12.5);
    expect(weightedAverageCost({ stock: -4, cost: 10, qty: 5, unitCost: 12.5 })).toBe(12.5);
  });
  it('leaves the cost alone for a zero receipt', () => expect(weightedAverageCost({ stock: 10, cost: 9, qty: 0, unitCost: 99 })).toBe(9));
});

describe('summary', () => {
  it('values stock at cost and at price, ignoring negative stock', () => {
    const s = summarizeStock([p(), p({ id: 'p2', currentStock: 0 }), p({ id: 'p3', currentStock: -3 }), p({ id: 'p4', currentStock: 5 })]);
    expect(s.units).toBe(55);
    expect(s.stockValue).toBe(1100);
    expect(s.retailValue).toBe(1650);
    expect(s.potentialMargin).toBe(550);
    expect(s.outOfStock).toBe(2);
    expect(s.lowStock).toBe(1);
    expect(s.negativeStock).toBe(1);
  });
});

describe('reorder suggestions', () => {
  it('stays quiet when there is plenty of cover', () => {
    expect(reorderSuggestions({ products: [p()], sold: new Map([['p1', { last30: 15, last90: 45 }]]), onOrder: new Map() })).toEqual([]);
  });
  it('asks for enough to cover lead time plus a month when selling fast', () => {
    const [s] = reorderSuggestions({ products: [p({ currentStock: 12, leadTimeDays: 10 })], sold: new Map([['p1', { last30: 60, last90: 150 }]]), onOrder: new Map() });
    // 2 a day, cover 40 days = 80, have 12 -> 68
    expect(s).toMatchObject({ suggestedQty: 68, urgency: 'NOW', reason: 'LOW_COVER', dailyDemand: 2 });
    expect(s!.estimatedCost).toBe(1360);
  });
  it('counts what is already on order so the gap is not ordered twice', () => {
    expect(reorderSuggestions({ products: [p({ currentStock: 4 })], sold: new Map([['p1', { last30: 30, last90: 90 }]]), onOrder: new Map([['p1', 200]]) })).toEqual([]);
  });
  it('rounds up to the order multiple', () => {
    const [s] = reorderSuggestions({ products: [p({ currentStock: 2, reorderQuantity: 25 })], sold: new Map([['p1', { last30: 30, last90: 90 }]]), onOrder: new Map() });
    expect(s!.suggestedQty % 25).toBe(0);
    expect(s!.suggestedQty).toBeGreaterThanOrEqual(25);
  });
  it('flags an out-of-stock item first and still orders something with no sales history', () => {
    const r = reorderSuggestions({ products: [p({ id: 'a', currentStock: 0, safetyStock: 5 }), p({ id: 'b', currentStock: 8, safetyStock: 10 })], sold: none, onOrder: new Map() });
    expect(r[0]).toMatchObject({ productId: 'a', reason: 'OUT_OF_STOCK', urgency: 'NOW' });
    expect(r[1]!.suggestedQty).toBeGreaterThan(0);
  });
});

describe('dead stock', () => {
  const now = new Date('2026-11-15');
  it('finds old stock nothing has sold from, biggest money first', () => {
    const d = deadStock({ now, products: [p({ id: 'old', currentStock: 10, costPrice: 100 }), p({ id: 'sold', currentStock: 10 }), p({ id: 'new', currentStock: 10, createdAt: new Date('2026-11-01') }), p({ id: 'empty', currentStock: 0 })], lastSold: new Map([['sold', new Date('2026-11-01')]]) });
    expect(d.items.map((i) => i.productId)).toEqual(['old']);
    expect(d.tiedUp).toBe(1000);
  });
});
