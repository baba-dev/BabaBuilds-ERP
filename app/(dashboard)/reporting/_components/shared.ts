export type Format = "currency" | "number" | "percent" | "date" | "text";
export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Col = { key: string; format?: Format };
export type Kpi = { key: string; value: number; format: Format; upGood?: boolean };
export type ChartSpec = { type: "bars" | "line" | "donut"; labelKey: string; series: string[]; lineSeries?: string[] };
export type PeriodKey = "this_month" | "last_month" | "this_fy" | "last_fy" | "all" | "custom";
export const PERIODS: PeriodKey[] = ["this_month", "last_month", "this_fy", "last_fy", "all", "custom"];
export type ReportResult = { columns: Col[]; rows: Row[]; totals: Row | null; kpis: Kpi[]; chart: ChartSpec | null; notes: string[]; truncated: boolean; currency: string; generatedAt: string; range: { key: PeriodKey; from: string | null; to: string | null } | null; previous?: Kpi[] };
export type ReportMeta = { id: string; category: "Finance" | "Sales" | "Cash" | "Tax" | "Operations"; title: string; description: string; period: "range" | "asof"; comparable: boolean };
export type ViewRow = { id: string; name: string; reportId: string; paramsJson: { period?: PeriodKey; from?: string | null; to?: string | null; compare?: boolean } | null; pinned: boolean; scheduleFrequency: "WEEKLY" | "MONTHLY" | null; scheduleRecipients: string | null; scheduleNextAt: string | null; scheduleLastAt: string | null; scheduleLastError: string | null; createdByUserId: string | null };
export const CATEGORIES = ["Finance", "Sales", "Cash", "Tax", "Operations"] as const;

export class ApiError extends Error { code: string; constructor(m: string, c = "") { super(m); this.code = c; } }
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) throw new ApiError(json?.error ?? "Request failed", json?.code);
  return json as T;
}

export function paramsToQuery(p: { period?: string; from?: string | null; to?: string | null; compare?: boolean }): string {
  const qs = new URLSearchParams();
  if (p.period) qs.set("period", p.period);
  if (p.period === "custom") { if (p.from) qs.set("from", p.from); if (p.to) qs.set("to", p.to); }
  if (p.compare) qs.set("compare", "1");
  return qs.toString();
}
