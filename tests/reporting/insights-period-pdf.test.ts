import { describe, expect, it } from 'vitest';
import { buildInsights, sparkFor } from '@/lib/reporting/insights';
import { resolvePeriod, yearAgoRange, previousRange } from '@/lib/expenses/period';
import { nextRunAfter } from '@/lib/reporting/views';
import { hashShareToken, newShareSecret } from '@/lib/reporting/shares';
import { buildReportPdf } from '@/lib/reporting/pdf';
import type { ReportBody, ReportResult } from '@/lib/reporting/types';

const body = (over: Partial<ReportBody> = {}): ReportBody => ({ columns: [{ key: 'client', format: 'text' }, { key: 'revenue', format: 'currency' }, { key: 'share', format: 'percent' }], rows: [{ client: 'A', revenue: 800, share: 80 }, { client: 'B', revenue: 200, share: 20 }], totals: null, kpis: [{ key: 'revenue', value: 1000, format: 'currency', upGood: true }, { key: 'expenses', value: 600, format: 'currency', upGood: false }], chart: null, notes: [], truncated: false, ...over });

describe('insights', () => {
  it('flags a customer carrying most of the total', () => {
    expect(buildInsights(body()).find((i) => i.code === 'concentration')).toMatchObject({ tone: 'warn', params: { name: 'A', pct: 80 } });
  });
  it('reports big moves against the comparison period, good or bad by direction', () => {
    const ins = buildInsights(body(), [{ key: 'revenue', value: 500, format: 'currency' }, { key: 'expenses', value: 300, format: 'currency' }]);
    expect(ins.find((i) => i.code === 'kpiUp' && i.params.kpi === 'revenue')?.tone).toBe('good');
    expect(ins.find((i) => i.code === 'kpiUp' && i.params.kpi === 'expenses')?.tone).toBe('bad');
    expect(buildInsights(body(), [{ key: 'revenue', value: 990, format: 'currency' }]).some((i) => i.code.startsWith('kpi'))).toBe(false);
  });
  it('speaks up about negative profit, low margin, heavy overdue and a cash shortfall, worst first, at most four', () => {
    const b = body({ kpis: [{ key: 'revenue', value: 1000, format: 'currency' }, { key: 'net', value: -50, format: 'currency' }, { key: 'margin', value: 4, format: 'percent' }, { key: 'outstanding', value: 100, format: 'currency' }, { key: 'overdue', value: 60, format: 'currency' }, { key: 'lowest', value: -5, format: 'currency' }] });
    const ins = buildInsights(b);
    expect(ins.length).toBeLessThanOrEqual(4);
    expect(ins[0]!.tone).toBe('bad');
  });
  it('builds a sparkline only from a column that shares the figure name', () => {
    const b = body({ rows: [{ client: 'a', revenue: 1 }, { client: 'b', revenue: 2 }, { client: 'c', revenue: 3 }] });
    expect(sparkFor('revenue', b)).toEqual([1, 2, 3]);
    expect(sparkFor('expenses', b)).toBeUndefined();
  });
});

describe('period presets', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  it('uses April to March quarters for India and calendar quarters elsewhere', () => {
    const q = resolvePeriod('this_quarter', 'IN', now);
    expect([q.from!.toISOString().slice(0, 10), q.to!.toISOString().slice(0, 10)]).toEqual(['2026-10-01', '2027-01-01']);
    const l = resolvePeriod('last_quarter', 'IN', now);
    expect([l.from!.toISOString().slice(0, 10), l.to!.toISOString().slice(0, 10)]).toEqual(['2026-07-01', '2026-10-01']);
    const us = resolvePeriod('this_quarter', 'US', now);
    expect(us.from!.toISOString().slice(0, 10)).toBe('2026-10-01');
    const early = resolvePeriod('this_quarter', 'IN', new Date('2026-02-10T00:00:00Z'));
    expect([early.from!.toISOString().slice(0, 10), early.to!.toISOString().slice(0, 10)]).toEqual(['2026-01-01', '2026-04-01']);
  });
  it('shifts a range back a year or by its own length', () => {
    const r = resolvePeriod('this_month', 'IN', now);
    expect(yearAgoRange(r)!.from!.toISOString().slice(0, 10)).toBe('2025-11-01');
    expect(previousRange(r)!.to!.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(yearAgoRange(resolvePeriod('all', 'IN', now))).toBeNull();
  });
});

describe('schedule time', () => {
  it('sends at the chosen local hour: 9:00 in Kolkata is 03:30 UTC, on a Monday', () => {
    const next = nextRunAfter('WEEKLY', new Date('2026-03-04T10:00:00Z'), { hour: 9, tz: 'Asia/Kolkata' });
    expect(next.toISOString()).toBe('2026-03-09T03:30:00.000Z');
  });
  it('is always in the future and falls back to UTC for an unknown zone', () => {
    const from = new Date('2026-03-09T03:30:00Z');
    expect(nextRunAfter('WEEKLY', from, { hour: 9, tz: 'Asia/Kolkata' }).getTime()).toBeGreaterThan(from.getTime());
    expect(nextRunAfter('MONTHLY', new Date('2026-03-04T10:00:00Z'), { hour: 7, tz: 'Not/AZone' }).toISOString()).toBe('2026-04-01T07:00:00.000Z');
  });
});

describe('share links', () => {
  it('hashes deterministically and makes long unique secrets', () => {
    const a = newShareSecret(), b = newShareSecret();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashShareToken(a)).toBe(hashShareToken(a));
    expect(hashShareToken(a)).not.toBe(hashShareToken(b));
    expect(hashShareToken(a)).not.toContain(a);
  });
});

describe('pdf export', () => {
  const result = (n: number): ReportResult => ({ ...body({ rows: Array.from({ length: n }, (_, i) => ({ client: `Customer ${i} हिंदी`, revenue: 1000 + i, share: 1 })), totals: { client: null, revenue: 9999, share: 100 }, notes: ['revenueExTax'] }), quality: [], insights: [], currency: 'INR', generatedAt: '2026-03-04T10:00:00Z', range: null });
  it('produces a PDF even when names are not Latin, and paginates long tables', async () => {
    const small = await buildReportPdf({ title: 'T', company: { name: 'Acme' }, periodLabel: 'This year', result: result(5), labels: { client: 'Customer', revenue: 'Revenue', share: 'Share', total: 'Total' } });
    expect(Buffer.from(small.slice(0, 5)).toString()).toBe('%PDF-');
    const big = await buildReportPdf({ title: 'T', company: { name: 'Acme' }, periodLabel: 'This year', result: result(120), labels: {} });
    expect(big.length).toBeGreaterThan(small.length);
  });
});
