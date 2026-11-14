import 'server-only';
import { aggregate, DATASETS, validateSpec } from '@/lib/reporting/semantic';
import { r2, num } from '@/lib/reporting/helpers';
import type { Ctx, ReportBody, ReportDef, Row } from '@/lib/reporting/types';

export const CUSTOM_REPORT_META: ReportDef = {
  id: 'custom', category: 'Finance', title: 'Custom report', description: 'Choose what to measure, how to group it and which records to include.', period: 'range', comparable: true,
  lineage: { sources: ['Invoice', 'Expense'], rules: ['voidExcluded', 'approvedOnly', 'baseCurrency'] },
  build: async () => { throw new Error('INVALID_INPUT'); },
};

export async function runCustomReport(ctx: Ctx, rawSpec: unknown): Promise<ReportBody> {
  const v = validateSpec(rawSpec);
  if (!v.ok) throw new Error('INVALID_INPUT');
  const { spec } = v;
  const ds = DATASETS[spec.dataset];
  const { rows, truncated } = await aggregate(ctx, spec);
  const dimKey = spec.dimension ?? 'all';
  const sums: Row = {};
  for (const m of spec.measures) sums[m] = r2(rows.reduce((s, r) => s + num(r[m]), 0));
  const isTime = ['month', 'quarter', 'year'].includes(spec.dimension ?? '');
  return {
    columns: [...(spec.dimension ? [{ key: dimKey, format: 'text' as const }] : []), ...spec.measures.map((m) => ({ key: m, format: ds.measures[m]!.format }))],
    rows: spec.dimension ? rows : rows.map(({ all: _a, ...r }) => r),
    totals: spec.dimension && rows.length > 1 ? { [dimKey]: null, ...sums } : null,
    kpis: spec.measures.map((m) => ({ key: m, value: num(sums[m]), format: ds.measures[m]!.format, upGood: m === 'revenue' || m === 'billed' || m === 'count' ? true : m === 'outstanding' || m.startsWith('spend') ? false : undefined })),
    chart: spec.dimension && rows.length ? { type: isTime ? 'bars' : 'bars', labelKey: dimKey, series: spec.measures.filter((m) => ds.measures[m]!.format === 'currency').slice(0, 3) } : null,
    notes: [], truncated,
  };
}
