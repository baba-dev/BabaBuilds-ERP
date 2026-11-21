"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Health = { label: "NEW" | "EXCELLENT" | "GOOD" | "WATCH" | "AT_RISK"; score: number | null };
export type Metrics = { invoiceCount: number; billed: number; paid: number; outstanding: number; overdue: number; lastInvoiceAt: string | null };
export type Credit = { state: "NONE" | "OK" | "NEAR" | "OVER"; limit: number | null; used: number; after: number; headroom: number | null };

export type ClientRowData = {
  id: string; name: string; email: string | null; phone: string | null; website: string | null; industry: string | null; country: string; countryCode: string | null;
  address: string; taxId: string | null; logoUrl: string | null; status: string; isExport: boolean; currency: string | null; paymentTermsDays: number | null;
  creditLimit: number | null; tagList: string[]; archivedAt: string | null; contactCount: number; lastContactedAt: string | null; ownerUserId: string | null;
  invoiceAccentColor?: string | null; gstStateCode?: string | null; gstSupplyOverride?: string | null; gstReverseCharge?: boolean | null; source?: string;
  metrics: Metrics; payment: { avgDaysToPay: number | null; onTimeRate: number | null; termsDays: number };
  health: Health; credit: Credit;
  retainerSummary?: { activeCount?: number; monthlyValue?: number } | null;
};

export type ApiFail = { error?: string; code?: string; fields?: Array<{ field: string; code: string }>; suggestion?: { field: string; code: string; name: string }; existing?: Array<{ id: string; name: string }> };

export const HEALTH_STYLE: Record<Health["label"], string> = {
  NEW: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  EXCELLENT: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  GOOD: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30",
  WATCH: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  AT_RISK: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

export function HealthBadge({ health, label }: { health: Health; label: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", HEALTH_STYLE[health.label])}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}{health.score !== null ? <span className="tabular-nums opacity-70">{health.score}</span> : null}
    </Badge>
  );
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export function flag(code: string | null | undefined) {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

export function money(amount: number, currency: string, locale: string) {
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); } catch { return `${currency} ${Math.round(amount)}`; }
}

export function compactMoney(amount: number, currency: string, locale: string) {
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount); } catch { return `${currency} ${Math.round(amount)}`; }
}

export function shortDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & ApiFail }> {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as T & ApiFail;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error", code: "NETWORK" } as T & ApiFail };
  }
}
