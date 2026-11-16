import { describe, expect, it } from 'vitest';
import { REPORTS, getReport, listReports, reportToCsv, type ReportResult } from '@/lib/reporting/engine';
import { nextRunAfter, parseRecipients, sanitizeParams } from '@/lib/reporting/views';

describe('report catalog', () => {
  it('has unique ids, a known category and no query text exposed', () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of listReports()) {
      expect(['Finance', 'Sales', 'Cash', 'Tax', 'Operations']).toContain(r.category);
      expect(r).not.toHaveProperty('build');
      expect(r).not.toHaveProperty('sql');
      expect(r.lineage.rules.length + r.lineage.sources.length).toBeGreaterThan(0);
    }
    expect(getReport('nope')).toBeNull();
  });
  it('only period reports can be compared', () => {
    for (const r of REPORTS) if (r.period === 'asof') expect(r.comparable).toBe(false);
  });
});

describe('saved report helpers', () => {
  it('keeps only valid recipients, lower-cased and unique', () => {
    expect(parseRecipients('A@x.com, a@x.com; b@y.org')).toEqual(['a@x.com', 'b@y.org']);
    expect(parseRecipients('nope')).toBeNull();
    expect(parseRecipients('')).toBeNull();
    expect(parseRecipients(Array.from({ length: 11 }, (_, i) => `u${i}@x.com`).join(','))).toBeNull();
  });
  it('cleans filter parameters', () => {
    expect(sanitizeParams({ period: 'bogus', from: '2026-01-02', to: 'x', compare: 'yes' })).toEqual({ period: 'this_fy', from: '2026-01-02', to: null, compare: false });
    expect(sanitizeParams({ compare: 'yoy' }).compare).toBe('yoy');
    expect(sanitizeParams({ compare: true }).compare).toBe('previous');
    expect(sanitizeParams(null).period).toBe('this_fy');
  });
  it('schedules weekly reports for the next Monday and monthly for the 1st', () => {
    const wed = new Date('2026-03-04T10:00:00Z');
    const w = nextRunAfter('WEEKLY', wed);
    expect(w.getUTCDay()).toBe(1);
    expect(w.getTime()).toBeGreaterThan(wed.getTime());
    expect(w.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(nextRunAfter('MONTHLY', wed).toISOString().slice(0, 10)).toBe('2026-04-01');
    // Run on a Monday itself: the next one is a week later, never the same day.
    expect(nextRunAfter('WEEKLY', new Date('2026-03-09T07:30:00Z')).toISOString().slice(0, 10)).toBe('2026-03-16');
  });
});

describe('csv export', () => {
  const base: ReportResult = { columns: [{ key: 'name', format: 'text' }, { key: 'amount', format: 'currency' }], rows: [{ name: '=HYPERLINK("x")', amount: 5 }, { name: 'a "quoted", name', amount: 7 }], totals: { name: null, amount: 12 }, kpis: [], chart: null, notes: [], truncated: false, currency: 'INR', generatedAt: '', range: null };
  it('neutralises formulas, escapes quotes and adds a total row', async () => {
    const csv = await reportToCsv({ id: 'x', title: 'x' }, base, { name: 'Name', amount: 'Amount', total: 'Total' });
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"a ""quoted"", name"');
    expect(csv.trim().endsWith('"Total","12"')).toBe(true);
  });
});
