import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) } }));

import { aggregate, validateSpec } from '@/lib/reporting/semantic';

const range = { key: 'this_fy' as const, from: new Date('2026-04-01T00:00:00Z'), to: new Date('2027-04-01T00:00:00Z') };

describe('custom report spec', () => {
  it('accepts a valid menu choice', () => {
    const v = validateSpec({ dataset: 'invoices', measures: ['revenue', 'count'], dimension: 'month', filters: { client: 'Acme', status: ['PAID'], minAmount: 100 }, limit: 50 });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.spec).toMatchObject({ dataset: 'invoices', measures: ['revenue', 'count'], dimension: 'month', limit: 50, filters: { client: 'Acme', status: ['PAID'], minAmount: 100 } });
  });
  it('rejects anything that is not on the menu', () => {
    expect(validateSpec({ dataset: 'users', measures: ['revenue'] })).toEqual({ ok: false, field: 'dataset' });
    expect(validateSpec({ dataset: 'invoices', measures: ['revenue; DROP TABLE Invoice'] })).toEqual({ ok: false, field: 'measures' });
    expect(validateSpec({ dataset: 'invoices', measures: ['spendNet'] })).toEqual({ ok: false, field: 'measures' });
    expect(validateSpec({ dataset: 'invoices', measures: ['revenue'], dimension: 'clientName; --' })).toEqual({ ok: false, field: 'dimension' });
    expect(validateSpec({ dataset: 'expenses', measures: [] })).toEqual({ ok: false, field: 'measures' });
    expect(validateSpec({ dataset: 'invoices', measures: ['revenue', 'billed', 'tax', 'outstanding', 'count'] })).toEqual({ ok: false, field: 'measures' });
  });
  it('drops filters that do not apply to the data set and unknown statuses, and caps the row count', () => {
    const v = validateSpec({ dataset: 'expenses', measures: ['spendNet'], dimension: null, filters: { client: 'x', vendor: 'Acme', status: ['BOGUS'] }, limit: 99999 });
    expect(v.ok && v.spec.filters).toEqual({ client: undefined, vendor: 'Acme', status: undefined, category: undefined, minAmount: undefined });
    expect(v.ok && v.spec.limit).toBe(500);
  });
});

describe('aggregate', () => {
  beforeEach(() => { queryRaw.mockReset(); });
  it('binds what a person typed as a parameter and never puts it in the query text', async () => {
    queryRaw.mockResolvedValue([{ dim: '2026-05', revenue: 1200.5 }]);
    const evil = "x' OR 1=1; DROP TABLE Invoice; --";
    const v = validateSpec({ dataset: 'invoices', measures: ['revenue'], dimension: 'month', filters: { client: evil } });
    if (!v.ok) throw new Error('spec');
    const out = await aggregate({ workspaceId: 'ws1', range }, v.spec);
    const q = queryRaw.mock.calls[0]![0] as { sql: string; values: unknown[] };
    expect(q.sql).not.toContain('DROP TABLE');
    expect(q.sql).not.toContain('OR 1=1');
    expect(q.values).toContain('ws1');
    expect(q.values.some((x) => typeof x === 'string' && x.includes('DROP TABLE'))).toBe(true);
    expect(q.sql).toContain('GROUP BY dim');
    expect(out.rows).toEqual([{ month: '2026-05', revenue: 1200.5 }]);
    expect(out.truncated).toBe(false);
  });
  it('reports truncation when more rows exist than the limit', async () => {
    queryRaw.mockResolvedValue(Array.from({ length: 4 }, (_, i) => ({ dim: `c${i}`, count: i })));
    const v = validateSpec({ dataset: 'invoices', measures: ['count'], dimension: 'client', limit: 3 });
    if (!v.ok) throw new Error('spec');
    const out = await aggregate({ workspaceId: 'ws1', range }, v.spec);
    expect(out.rows).toHaveLength(3);
    expect(out.truncated).toBe(true);
  });
});
