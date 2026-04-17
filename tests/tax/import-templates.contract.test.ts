import { describe, expect, it } from 'vitest';
import { TAX_IMPORT_TEMPLATES, TAX_IMPORT_TEMPLATE_TYPES } from '@/lib/tax/import-templates';

describe('TAX_IMPORT_TEMPLATES contract', () => {
  it('defines non-empty column lists for every template type', () => {
    for (const type of TAX_IMPORT_TEMPLATE_TYPES) {
      const cols = TAX_IMPORT_TEMPLATES[type].columns;
      expect(cols.length).toBeGreaterThan(0);
      expect(new Set(cols).size).toBe(cols.length);
    }
  });
});
