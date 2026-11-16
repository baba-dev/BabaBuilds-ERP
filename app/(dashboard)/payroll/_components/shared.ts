import type { RunDetailDto, RunLineDto } from "@/lib/payroll/service/detail";
import type { PayrollPerson } from "@/lib/payroll/service/people";
import type { PayrollIssue, VarianceFlag } from "@/lib/payroll/service/checks";

export type { RunDetailDto, RunLineDto, PayrollPerson, PayrollIssue, VarianceFlag };

export class ApiError extends Error {
  code: string;
  fields: Record<string, string[]>;
  constructor(message: string, code = "ERROR", fields: Record<string, string[]> = {}) { super(message); this.code = code; this.fields = fields; }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((body && (typeof body.error === "string" ? body.error : body.error?.message)) || `Request failed (${res.status})`, body?.code, body?.fields ?? {});
  return body as T;
}

export type RunStatus = "DRAFT" | "REVIEW" | "APPROVED" | "POSTED";

export type OverviewPeriod = {
  id: string; startDate: string; endDate: string; status: string;
  run: { id: string; version: number; status: RunStatus; gross: number; deductions: number; employerCost: number; netPay: number; headcount: number; generatedAt: string; disbursed: boolean; errors: number; warnings: number } | null;
};

export type Overview = {
  adapterStatus: { workforceModuleEnabled: boolean; source: "WORKFORCE" | "STANDALONE" };
  fy: string;
  perms: { prepare: boolean; approve: boolean; post: boolean; settings: boolean };
  next: { year: number; month: number; inProgress: boolean; runId: string | null; status: RunStatus | null };
  kpis: { gross: number; netPay: number; employerCost: number; deductions: number; runCount: number; headcount: number; avgCostPerHead: number };
  trend: { month: string; gross: number; netPay: number; employerCost: number; headcount: number }[];
  periods: OverviewPeriod[];
  readiness: { ready: number; attention: number; none: number; inactive: number };
  statutoryDue: { id: string; kind: string; label: string; amount: number; dueDate: string; overdue: boolean }[];
  statutorySummary: { dueAmount: number; overdue: number };
  departments: { name: string; amount: number }[];
};

export type PeopleResponse = { people: PayrollPerson[]; meta: { departments: { id: string; name: string }[]; designations: { id: string; title: string }[]; ptStates: { code: string; name: string }[] } };

export type Remittance = { id: string; kind: string; label: string; amount: number; dueDate: string; status: string; overdue: boolean; paidAt: string | null; reference: string | null; period: string; runId: string | null };
export type RemittancesResponse = { items: Remittance[]; summary: { dueCount: number; dueAmount: number; overdueCount: number } };

export function monthLabel(iso: string | Date, locale: string, style: "long" | "short" = "long"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { month: style, year: "numeric", timeZone: "UTC" }).format(d);
}
export function dayLabel(iso: string | null | undefined, locale: string): string {
  return iso ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "-";
}
export const MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

export const STATUS_STEPS: RunStatus[] = ["DRAFT", "REVIEW", "APPROVED", "POSTED"];
export const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  REVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  APPROVED: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  POSTED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};
export const SEVERITY_TONE: Record<string, string> = {
  error: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
  warning: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
  info: "border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-300",
};
