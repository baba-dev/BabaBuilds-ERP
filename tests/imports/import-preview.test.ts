import { describe, expect, it } from 'vitest';
import { deterministicMapping } from '@/lib/imports/ai/mapping-ai';
import { getImportAdapter } from '@/lib/imports/adapters/entity-adapters';
import { buildPreview } from '@/lib/imports/core/preview';

describe('import mapping + preview', () => {
  it('maps common client headers with synonyms', () => {
    const adapter = getImportAdapter('clients');
    const headers = ['Client Name', 'Email Address', 'Phone Number'];
    const mapping = deterministicMapping(headers, adapter.fields);
    expect(mapping.find((m) => m.sourceHeader === 'Client Name')?.targetField).toBe('name');
    expect(mapping.find((m) => m.sourceHeader === 'Email Address')?.targetField).toBe('email');
  });

  it('flags invalid and duplicate inventory rows', () => {
    const preview = buildPreview({
      entity: 'inventory',
      fileName: 'inventory.csv',
      sourceMode: 'arbitrary',
      aiUsed: false,
      headers: ['sku', 'name', 'currentStock'],
      rows: [
        ['SKU1', 'Chair', '-3'],
        ['SKU1', 'Chair', '10'],
      ],
      mappings: [
        { sourceHeader: 'sku', targetField: 'sku', confidence: 1, source: 'manual' },
        { sourceHeader: 'name', targetField: 'name', confidence: 1, source: 'manual' },
        { sourceHeader: 'currentStock', targetField: 'currentStock', confidence: 1, source: 'manual' },
      ],
    });

    expect(preview.counts.errors).toBeGreaterThan(0);
    expect(preview.counts.duplicates).toBe(1);
  });

  it('requires expense amount to be positive', () => {
    const preview = buildPreview({
      entity: 'expenses',
      fileName: 'expenses.csv',
      sourceMode: 'template',
      aiUsed: false,
      headers: ['amount', 'vendor'],
      rows: [['0', 'Vendor A']],
      mappings: [
        { sourceHeader: 'amount', targetField: 'amount', confidence: 1, source: 'manual' },
        { sourceHeader: 'vendor', targetField: 'vendor', confidence: 1, source: 'manual' },
      ],
    });

    expect(preview.rows[0].issues.some((i) => i.code === 'INVALID_AMOUNT')).toBe(true);
  });
});
