export type Tone = "friendly" | "firm" | "final";
export type Bucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
export const BUCKETS: Bucket[] = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"];
export const VIEWS = ["all", "actionable", "promises", "broken", "disputed", "paused"] as const;
export type View = (typeof VIEWS)[number];
export type Row = {
  id: string; invoiceNumber: string; clientId: string | null; clientName: string; currency: string; invoiceDate: string; dueDate: string; dueIsDerived: boolean; daysOverdue: number; bucket: Bucket;
  outstanding: number; outstandingOriginal: number; status: string; followUpStatus: string; promiseDate: string | null; nextFollowUpAt: string | null; disputeReason: string | null;
  lastReminderSentAt: string | null; reminders: number; risk: number; riskSource: "manual" | "auto"; priority: number; paused: boolean; action: { kind: string; tone?: Tone; date?: string };
};
export type ClientRow = { clientId: string | null; name: string; invoices: number; outstanding: number; overdue: number; oldestDays: number; risk: number; creditLimit: number | null };
export type Settings = { autoReminders: boolean; steps: Array<{ afterDays: number; tone: Tone }>; minGapDays: number; pauseOnPromise: boolean };
export type Snapshot = {
  canEdit: boolean; canSend: boolean;
  rows: Row[]; truncated: boolean; clients: ClientRow[]; settings: Settings; smtpReminderReady: boolean; workspace: { baseCurrency: string; countryCode: string };
  totals: { totalOutstanding: number; current: number; overdueInvoices: number; overdueAmount: number; remindersSentLast7Days: number; collectedLast30Days: number; dso: number | null; atRiskAmount: number; promisesDue: { count: number; amount: number }; brokenPromises: { count: number; amount: number }; disputed: { count: number; amount: number }; actionable: number };
  buckets: Array<{ key: Bucket; count: number; amount: number }>;
};
export type TimelineItem = { id: string; type: string; message: string | null; at: string };

export class ApiError extends Error { code: string; constructor(m: string, c = "") { super(m); this.code = c; } }
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => null)) as (T & { error?: string; code?: string; data?: T }) | null;
  if (!res.ok) throw new ApiError(json?.error ?? "Request failed", json?.code);
  return (json && "data" in json && json.data !== undefined ? json.data : json) as T;
}
export const shortDay = (iso: string | null, locale: string) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—");
