export type Horizon = "DAILY_30" | "WEEKLY_13" | "MONTHLY_12";
export type Scenario = "BASE" | "BEST_CASE" | "WORST_CASE";
export const HORIZONS: Horizon[] = ["DAILY_30", "WEEKLY_13", "MONTHLY_12"];
export const SCENARIOS: Scenario[] = ["BASE", "BEST_CASE", "WORST_CASE"];

export type Assumptions = {
  collectionsDelayDays: number; inflowHaircutPercent: number; outflowIncreasePercent: number; movePOEarlierLaterDays: number;
  minimumCashThreshold: number; defaultInvoicePaymentTermsDays: number; overdueCollectionDays?: number;
  recurringOutflows?: Array<{ title: string; amount: number; dayOfMonth: number; category?: string }>;
};
export type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PeriodRow = { label: string; start: string; end: string; opening: number; closing: number; lowest: number; actualIn: number; actualOut: number; projectedIn: number; projectedOut: number; risk: Risk };
export type ScenarioRow = { tag: Scenario; openingCash: number; closingCash: number; lowestCash: number; lowestCashDate: string | null; crunchDate: string | null; inflows: number; outflows: number; confidence: number | null; assumptions: Assumptions; periods: PeriodRow[] };
export type LineRow = {
  key: string; direction: "INFLOW" | "OUTFLOW"; sourceType: string; sourceId: string | null; title: string; amount: number; date: string; period: string;
  classification: "ACTUAL" | "COMMITTED" | "EXPECTED" | "PREDICTED" | "MANUAL"; confidence: number | null; explanation: string | null; href: string; overdueDays: number; planStatus: "open" | "deferred" | "resolved"; planNote: string | null;
};
export type ActionItem = { title: string; amount: number; date: string | null; sourceType: string; sourceId: string | null; note?: string };
export type Action = { kind: string; severity: "critical" | "warning" | "info"; amount?: number; date?: string | null; items: ActionItem[]; href: string; params?: Record<string, string | number> };
export type Kpis = {
  cashNow: number; lowestCash: number; lowestCashDate: string | null; closingCash: number; threshold: number; runwayDays: number | null; safeToSpend: number;
  expectedIn: number; expectedOut: number; net: number; overdueReceivables: number; overdueBills: number; coveredByInvoicesPct: number | null; confidence: number | null;
};
export type Forecast = {
  canManage: boolean;
  generatedAt: string; horizonType: Horizon; scenarioTag: Scenario; startDate: string; endDate: string;
  accounts: Array<{ id: string; name: string; balance: number; currency: string }>;
  kpis: Kpis; actions: Action[]; scenarios: ScenarioRow[]; lines: LineRow[];
  alerts: Array<{ severity: "critical" | "warning"; period: string; start: string; lowest: number; closing: number }>;
};
export type AdjustmentRow = { id: string; date: string; amount: number | string; direction: "INFLOW" | "OUTFLOW"; reason: string; category: string | null };
export type AccountRow = { id: string; name: string; bankName: string | null; currency: string; openingBalance: number | string; openingBalanceDate: string; balance: number; transactionCount: number; lastTransactionAt: string | null };
export type Accuracy = { snapshot: { id: string; generatedAt: string; weeksAgo: number } | null; periods: Array<{ label: string; start: string; end: string; forecastNet: number; actualNet: number; error: number; forecastClosing: number; actualClosing: number }>; score: number | null; bias: number | null; reason?: "NO_HISTORY" | "NOT_ELAPSED" | "NO_BANK_DATA" };

export class ApiError extends Error {
  fields: Array<{ field: string; code: string }>;
  constructor(message: string, fields: Array<{ field: string; code: string }> = []) { super(message); this.fields = fields; }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: string; fields?: Array<{ field: string; code: string }> } | null;
  if (!res.ok) throw new ApiError(json?.error ?? "Request failed", json?.fields);
  return (json?.data ?? (json as unknown as T)) as T;
}

export const dayLabel = (iso: string | null, locale: string) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const shortDay = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
export const periodLabel = (p: { start: string; end: string; label: string }, horizon: Horizon, locale: string) => {
  const s = new Date(p.start);
  if (horizon === "DAILY_30") return s.toLocaleDateString(locale, { day: "numeric", month: "short" });
  if (horizon === "MONTHLY_12") return s.toLocaleDateString(locale, { month: "short", year: "2-digit" });
  const e = new Date(new Date(p.end).getTime() - 86_400_000);
  return `${s.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${e.toLocaleDateString(locale, { day: "numeric", month: "short" })}`;
};
/** Compact money for chart axes and tight cards: 1.2L / 3.4Cr style follows the locale's own compact notation. */
export const compact = (n: number, locale: string, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
export const SOURCE_KEYS = ["INVOICE", "RETAINER", "EXPENSE", "PURCHASE_ORDER", "PAYROLL", "TAX", "MANUAL", "BANK_TRANSACTION"] as const;
