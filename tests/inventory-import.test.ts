import { describe, expect, test } from 'vitest';
import { planImport } from '@/lib/inventory/import';

describe('planImport', () => {
  const existing = new Set(['OLD-1']);

  test('splits new and existing SKUs and keeps opening stock only for new ones', () => {
    const p = planImport([{ sku: 'new-1', name: 'New', cost: '10', price: '15', stock: '7' }, { sku: 'old-1', name: 'Old', stock: '99' }], existing);
    expect(p.errors).toEqual([]);
    expect(p.create).toEqual([{ row: 2, sku: 'NEW-1', name: 'New', openingStock: 7 }]);
    expect(p.update).toHaveLength(1);
    expect(p.valid.find((v) => v.existing)?.openingStock).toBe(0);
  });

  test('reports row-level problems with spreadsheet row numbers', () => {
    const p = planImport([{ sku: 'A', name: 'Ok' }, { sku: 'B', name: '' }, { sku: 'C', name: 'x', stock: '-3' }, { sku: 'D', name: 'y', gstRate: '250' }, { sku: 'A', name: 'dup' }], existing);
    expect(p.errors.map((e) => `${e.row}:${e.sku}`)).toEqual(['3:B', '4:C', '5:D', '6:A']);
    expect(p.valid).toHaveLength(1);
  });

  test('parses thousands separators and skips blank lines', () => {
    const p = planImport([{ sku: '', name: '' }, { sku: 'X', name: 'Item', cost: '1,250.50', price: '2,000' }], existing);
    expect(p.valid[0].fields.costPrice).toBe(1250.5);
    expect(p.valid[0].fields.baselinePrice).toBe(2000);
  });
});
