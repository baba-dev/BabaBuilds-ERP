import type { PeriodKey, PeriodRange } from '@/lib/expenses/period';
import type { Permission } from '@/lib/permissions';

export type Format = 'currency' | 'number' | 'percent' | 'date' | 'text';
export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Col = { key: string; format?: Format };
export type Kpi = { key: string; value: number; format: Format; /** true when a higher value is the good direction */ upGood?: boolean; /** The last few values, for a sparkline. */ spark?: number[] };
export type ChartSpec = { type: 'bars' | 'line' | 'donut'; labelKey: string; series: string[]; lineSeries?: string[] };
/** Something in the data that makes the report less complete than it looks, with where to fix it. */
export type QualityIssue = { code: string; count: number; amount?: number; href: string };
/** A plain-language finding computed from the numbers; params fill the translated sentence. */
export type Insight = { code: string; tone: 'good' | 'warn' | 'bad' | 'info'; params: Record<string, string | number> };
export type Lineage = { sources: string[]; rules: string[] };

export type ReportBody = {
  columns: Col[]; rows: Row[]; totals: Row | null; kpis: Kpi[]; chart: ChartSpec | null; notes: string[]; truncated: boolean;
  quality?: QualityIssue[];
};
export type ReportResult = ReportBody & {
  quality: QualityIssue[]; insights: Insight[]; currency: string; generatedAt: string;
  range: { key: PeriodKey; from: string | null; to: string | null } | null;
  /** Same key figures for the comparison period, when comparison was asked for. */
  previous?: Kpi[]; compareMode?: 'previous' | 'yoy';
};

export type Ctx = { workspaceId: string; userId: string; range: PeriodRange; now: Date; currency: string; countryCode: string };
export type ReportDef = {
  id: string; category: 'Finance' | 'Sales' | 'Cash' | 'Tax' | 'Operations'; title: string; description: string;
  /** "range" reports follow the period filter; "asof" reports describe today. */
  period: 'range' | 'asof'; comparable: boolean;
  /** Where the numbers come from and the rules applied, shown to the reader as "how this is calculated". */
  lineage: Lineage;
  /** Permission needed on top of reporting access, for reports with sensitive content (payroll). */
  requires?: Permission;
  /** Cheap to compute, so safe to cache briefly. */
  cacheSeconds?: number;
  build: (ctx: Ctx) => Promise<ReportBody>;
};
