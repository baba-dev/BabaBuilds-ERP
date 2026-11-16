import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { applyStockChange, applyStockCount, InventoryError } from '@/lib/inventory/service';
import { adjustSchema, poCreateSchema, productFieldsSchema, receiveSchema } from '@/lib/inventory/schemas';

/** A tiny in-memory stand-in for the parts of the transaction client the stock functions use. */
function fakeTx(stock: number, safety = 5) {
  const state = { stock, safety, status: 'IN_STOCK', movements: [] as Record<string, unknown>[] };
  const tx = {
    product: {
      findFirst: async () => ({ id: 'p1', name: 'Widget', currentStock: state.stock, safetyStock: state.safety }),
      findFirstOrThrow: async () => ({ currentStock: state.stock, safetyStock: state.safety }),
      updateMany: async ({ where, data }: { where: { currentStock?: { gte: number } }; data: { currentStock: { increment: number } } }) => {
        if (where.currentStock && state.stock < where.currentStock.gte) return { count: 0 };
        state.stock += data.currentStock.increment;
        return { count: 1 };
      },
      update: async ({ data }: { data: { status: string } }) => { state.status = data.status; return {}; },
    },
    inventoryMovement: { create: async ({ data }: { data: Record<string, unknown> }) => { state.movements.push(data); return data; } },
  };
  return { tx: tx as never, state };
}

describe('applyStockChange', () => {
  test('adds stock, records the balance and clears low-stock status', async () => {
    const { tx, state } = fakeTx(2);
    const r = await applyStockChange(tx, { workspaceId: 'w', productId: 'p1', delta: 20, type: 'IN', reason: 'PO' });
    expect(r.balance).toBe(22);
    expect(state.status).toBe('IN_STOCK');
    expect(state.movements[0]).toMatchObject({ quantity: 20, balanceAfter: 22, type: 'IN' });
  });

  test('refuses to remove more than is on hand', async () => {
    const { tx, state } = fakeTx(3);
    await expect(applyStockChange(tx, { workspaceId: 'w', productId: 'p1', delta: -4, type: 'ADJ', reason: 'x' })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(state.stock).toBe(3);
    expect(state.movements).toHaveLength(0);
  });

  test('flags low and out of stock after removal', async () => {
    const a = fakeTx(8);
    await applyStockChange(a.tx, { workspaceId: 'w', productId: 'p1', delta: -4, type: 'OUT', reason: 'sale' });
    expect(a.state.status).toBe('LOW_STOCK');
    const b = fakeTx(4);
    await applyStockChange(b.tx, { workspaceId: 'w', productId: 'p1', delta: -4, type: 'OUT', reason: 'sale' });
    expect(b.state.status).toBe('OUT_OF_STOCK');
  });

  test('a count writes only the difference and skips unchanged counts', async () => {
    const { tx, state } = fakeTx(10);
    const same = await applyStockCount(tx, { workspaceId: 'w', productId: 'p1', counted: 10, reason: 'count' });
    expect(same.delta).toBe(0);
    expect(state.movements).toHaveLength(0);
    const lower = await applyStockCount(tx, { workspaceId: 'w', productId: 'p1', counted: 7, reason: 'count' });
    expect(lower).toMatchObject({ delta: -3, balance: 7 });
    expect(state.movements[0]).toMatchObject({ type: 'ADJ', quantity: -3 });
  });

  test('InventoryError carries a code', () => {
    expect(new InventoryError('CONFLICT', 'x').code).toBe('CONFLICT');
  });
});

describe('schemas', () => {
  test('product normalises SKU and lets safety stock be zero', () => {
    const p = productFieldsSchema.parse({ sku: ' ab-1 ', name: 'Bolt', safetyStock: 0 });
    expect(p.sku).toBe('AB-1');
    expect(p.safetyStock).toBe(0);
    expect(p.unit).toBe('pcs');
  });

  test('rejects negative prices and blank names', () => {
    expect(() => productFieldsSchema.parse({ sku: 'A', name: ' ', baselinePrice: 5 })).toThrow();
    expect(() => productFieldsSchema.parse({ sku: 'A', name: 'x', costPrice: -1 })).toThrow();
  });

  test('adjust defaults to ADD and rejects fractions', () => {
    expect(adjustSchema.parse({ productId: 'p', quantity: 3 }).mode).toBe('ADD');
    expect(() => adjustSchema.parse({ productId: 'p', quantity: 1.5 })).toThrow();
  });

  test('purchase order needs lines and parses the expected date', () => {
    expect(() => poCreateSchema.parse({ supplier: 'S', lines: [] })).toThrow();
    const po = poCreateSchema.parse({ supplier: 'S', expectedDate: '2026-12-01', lines: [{ productId: 'p', quantity: 2, unitPrice: 10 }] });
    expect(po.expectedDate?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  test('receipt lines must be positive whole quantities', () => {
    expect(receiveSchema.parse({}).lines).toBeUndefined();
    expect(() => receiveSchema.parse({ lines: [{ itemId: 'i', quantity: 0 }] })).toThrow();
  });
});
