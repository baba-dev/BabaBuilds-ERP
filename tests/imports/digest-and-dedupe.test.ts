import { describe, expect, it } from 'vitest';
import { computeImportDigest } from '@/lib/imports/core/digest';
import { buildPreview } from '@/lib/imports/core/preview';

describe('import integrity + dedupe', () => {
  it('produces stable digest for identical payloads', () => {
    const payload = { entity: 'services', headers: ['name'], rows: [['A']], mappings: [] };
    expect(computeImportDigest(payload)).toBe(computeImportDigest(payload));
  });

  it('normalizes service names when deduping', () => {
    const preview = buildPreview({
      entity: 'services',
      fileName: 'services.csv',
      sourceMode: 'arbitrary',
      aiUsed: false,
      headers: ['name'],
      rows: [['SEO Package'], ['seo-package']],
      mappings: [{ sourceHeader: 'name', targetField: 'name', confidence: 1, source: 'manual' }],
    });

    expect(preview.counts.duplicates).toBe(1);
    expect(preview.rows[1].issues.some((i) => i.code === 'DUPLICATE_IN_FILE')).toBe(true);
  });
});
