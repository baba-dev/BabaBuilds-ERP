import { beforeEach, describe, expect, it, vi } from 'vitest';

const { aggregate } = vi.hoisted(() => ({ aggregate: vi.fn() }));
vi.mock('@/lib/reporting/semantic', async (orig) => ({ ...(await orig<typeof import('@/lib/reporting/semantic')>()), aggregate }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { CORE_REPORTS } from '@/lib/reporting/core-reports';
import type { Ctx } from '@/lib/reporting/types';

const ctx = { workspaceId: 'w', userId: 'u', range: { key: 'this_fy', from: new Date('2026-04-01'), to: new Date('2027-04-01') }, now: new Date('2026-11-14'), currency: 'INR', countryCode: 'IN' } as Ctx;
const report = (id: string) => CORE_REPORTS.find((r) => r.id === id)!;
/** Return one answer for the invoice query and another for the expense query. */
const byDataset = (inv: unknown, exp: unknown) => async (_ctx: unknown, spec: { dataset: string }) => (spec.dataset === 'invoices' ? inv : exp);

describe('report shaping from aggregated data', () => {
  // Braces matter: a beforeEach that returns a function is run again as a cleanup after the test.
  beforeEach(() => { aggregate.mockReset(); });

  it('profit and loss joins revenue and expenses by month and totals them', async () => {
    aggregate.mockImplementation(byDataset(
      { rows: [{ month: '2026-05', revenue: 1000 }, { month: '2026-06', revenue: 2000 }], truncated: false },
      { rows: [{ month: '2026-05', spendNet: 400 }, { month: '2026-07', spendNet: 100 }], truncated: false },
    ));
    const r = await report('pnl').build(ctx);
    expect(r.rows.map((x) => x.period)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(r.rows[0]).toMatchObject({ revenue: 1000, expenses: 400, net: 600, margin: 60 });
    expect(r.rows[2]).toMatchObject({ revenue: 0, expenses: 100, net: -100, margin: null });
    expect(r.totals).toMatchObject({ revenue: 3000, expenses: 500, net: 2500 });
    expect(r.kpis.find((k) => k.key === 'margin')!.value).toBeCloseTo(83.33, 1);
  });

  it('expenses by category computes each share of the total and links to the filtered ledger', async () => {
    aggregate.mockResolvedValue({ rows: [{ category: 'Software & Tools', spendNet: 750, count: 3 }, { category: 'Travel', spendNet: 250, count: 1 }], truncated: false });
    const r = await report('expense_by_category').build(ctx);
    expect(r.rows[0]).toMatchObject({ category: 'Software & Tools', share: 75, bills: 3, _href: '/expenses?category=Software%20%26%20Tools' });
    expect(r.totals).toMatchObject({ amount: 1000, share: 100, bills: 4 });
  });

  it('expenses by vendor keeps what is still unpaid per vendor', async () => {
    aggregate.mockResolvedValue({ rows: [{ vendor: 'Acme', spendNet: 500, count: 2, unpaid: 200 }], truncated: false });
    const r = await report('expense_by_vendor').build(ctx);
    expect(r.rows[0]).toMatchObject({ vendor: 'Acme', unpaid: 200, share: 100 });
  });

  it('tax position nets output tax against claimable input credit by month', async () => {
    aggregate.mockImplementation(byDataset(
      { rows: [{ month: '2026-05', tax: 180 }], truncated: false },
      { rows: [{ month: '2026-05', itcClaimable: 45 }, { month: '2026-06', itcClaimable: 0 }], truncated: false },
    ));
    const r = await report('tax_position').build(ctx);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ output: 180, input: 45, net: 135 });
    expect(r.kpis.find((k) => k.key === 'netTax')!.value).toBe(135);
  });
});
