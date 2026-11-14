export type Format = "currency" | "number" | "percent" | "date" | "text";
export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type Col = { key: string; format?: Format };
export type Kpi = { key: string; value: number; format: Format; upGood?: boolean; spark?: number[] };
export type QualityIssue = { code: string; count: number; amount?: number; href: string };
export type Insight = { code: string; tone: "good" | "warn" | "bad" | "info"; params: Record<string, string | number> };
export type Lineage = { sources: string[]; rules: string[] };
export type ChartSpec = { type: "bars" | "line" | "donut"; labelKey: string; series: string[]; lineSeries?: string[] };
export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_fy" | "last_fy" | "all" | "custom";
export const PERIODS: PeriodKey[] = ["this_month", "last_month", "this_quarter", "last_quarter", "this_fy", "last_fy", "all", "custom"];
export type CompareMode = "off" | "previous" | "yoy";
export type ReportResult = { columns: Col[]; rows: Row[]; totals: Row | null; kpis: Kpi[]; chart: ChartSpec | null; notes: string[]; truncated: boolean; quality: QualityIssue[]; insights: Insight[]; currency: string; generatedAt: string; range: { key: PeriodKey; from: string | null; to: string | null } | null; previous?: Kpi[]; compareMode?: "previous" | "yoy" };
export type ReportMeta = { id: string; category: "Finance" | "Sales" | "Cash" | "Tax" | "Operations"; title: string; description: string; period: "range" | "asof"; comparable: boolean; lineage?: Lineage };
export type ViewParams = { period?: PeriodKey; from?: string | null; to?: string | null; compare?: boolean | "previous" | "yoy"; spec?: Spec };
export type ViewRow = { id: string; name: string; reportId: string; paramsJson: ViewParams | null; pinned: boolean; pinnedToDashboard: boolean; visibility: "PRIVATE" | "WORKSPACE"; scheduleFrequency: "WEEKLY" | "MONTHLY" | null; scheduleRecipients: string | null; scheduleFormat: "CSV" | "PDF" | "BOTH"; scheduleEnabled: boolean; scheduleHour: number; scheduleTz: string; scheduleNextAt: string | null; scheduleLastAt: string | null; scheduleLastError: string | null; createdByUserId: string | null };
export type Spec = { dataset: "invoices" | "expenses"; measures: string[]; dimension: string | null; filters: { client?: string; vendor?: string; status?: string[]; category?: string[]; minAmount?: number }; sort?: { key: string; dir: "asc" | "desc" }; limit?: number };
export type ShareRow = { id: string; name: string | null; reportKey: string; expiresAt: string | null; viewCount: number; lastViewedAt: string | null; createdAt: string };
export const CATEGORIES = ["Finance", "Sales", "Cash", "Tax", "Operations"] as const;

export class ApiError extends Error { code: string; constructor(m: string, c = "") { super(m); this.code = c; } }
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) throw new ApiError(json?.error ?? "Request failed", json?.code);
  return json as T;
}

export function paramsToQuery(p: { period?: string; from?: string | null; to?: string | null; compare?: boolean | string; spec?: unknown }): string {
  const qs = new URLSearchParams();
  if (p.period) qs.set("period", p.period);
  if (p.period === "custom") { if (p.from) qs.set("from", p.from); if (p.to) qs.set("to", p.to); }
  if (p.compare) qs.set("compare", p.compare === "yoy" ? "yoy" : "1");
  if (p.spec) qs.set("spec", JSON.stringify(p.spec));
  return qs.toString();
}

/** Cell values that are codes in the data and need translating for display. */
export const TRANSLATED_KEYS = new Set(["status", "paymentStatus", "kind", "section", "item", "stage", "side"]);
export const shortDate = (iso: string) => iso.slice(0, 10);
