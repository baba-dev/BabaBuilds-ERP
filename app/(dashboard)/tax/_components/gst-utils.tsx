"use client";

import { useCallback, useMemo } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import type { GstOverview, ObligationView } from "@/lib/gst/service";
import { formatMoney, formatMoneyCompact } from "../../income/_components/income-utils";

export type { GstOverview, ObligationView };
export { useJson } from "../../income/_components/use-income-data";

export const CURRENCY = "INR";

export function useMoney() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      m: (n: number | string | null | undefined) => formatMoney(n, CURRENCY, locale),
      c: (n: number | string) => formatMoneyCompact(n, CURRENCY, locale),
      n: (n: number | string | null | undefined) => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0)),
    }),
    [locale],
  );
}

/** "Apr 2026", "Apr–Jun 2026" or "FY 2025-26" depending on the period key shape. */
export function periodLabel(key: string, locale: string): string {
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  const fmt = (y: number, m0: number, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m0, 1)));
  if (month) return fmt(Number(month[1]), Number(month[2]) - 1, { month: "short", year: "numeric" });
  const q = /^(\d{4})-Q([1-4])$/.exec(key);
  if (q) {
    const start0 = (3 + (Number(q[2]) - 1) * 3) % 12;
    const y = Number(q[1]) + (q[2] === "4" ? 1 : 0);
    const end0 = start0 + 2;
    return `${fmt(y, start0, { month: "short" })}–${fmt(y + Math.floor(end0 / 12), end0 % 12, { month: "short", year: "numeric" })}`;
  }
  return `FY ${key}`;
}

export function formatDay(iso: string | Date | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

export function daysUntil(iso: string, now = new Date()): number {
  const due = new Date(iso);
  const end = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), 23, 59, 59);
  return Math.ceil((end - now.getTime()) / 86400000);
}

export const STATUS_STYLE: Record<string, { chip: string; dot: string; tone: "ok" | "soon" | "late" | "done" }> = {
  FILED: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20", dot: "bg-emerald-500", tone: "done" },
  OVERDUE: { chip: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20", dot: "bg-rose-500", tone: "late" },
  DUE_SOON: { chip: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20", dot: "bg-amber-500", tone: "soon" },
  PENDING: { chip: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20", dot: "bg-indigo-500", tone: "ok" },
  OPEN_PERIOD: { chip: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-400/20", dot: "bg-zinc-400", tone: "ok" },
};

export function StatusChip({ status, label }: { status: string; label: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.OPEN_PERIOD;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", s.chip)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {label}
    </span>
  );
}

export function Section({ title, hint, right, children, className }: { title: React.ReactNode; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card shadow-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {right}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className={cn("pointer-events-none absolute -end-8 -top-8 size-24 rounded-full opacity-[0.12]", accent ?? "bg-indigo-500")} aria-hidden />
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export const th = "whitespace-nowrap px-3 py-2 text-start text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
export const thr = cn(th, "text-end");
export const td = "px-3 py-2 align-middle text-sm";
export const tdr = cn(td, "text-end tabular-nums");

export function TableShell({ children, minWidth = 640 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-1 overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>{children}</table>
    </div>
  );
}

/** Reads `res.json()` errors of the app's `{ error }` shape. */
export async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body && typeof body.error === "string" && body.error) || fallback;
}

export function useUrlState() {
  // Thin wrapper kept here so tabs share one definition of "replace the query without scrolling".
  const set = useCallback((router: { replace: (url: string, opts?: { scroll?: boolean }) => void }, pathname: string, params: URLSearchParams, patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, []);
  return set;
}


/** Calls a GST API and returns the parsed body or the server's message, so callers only handle toast + reload. */
export async function callApi<T = unknown>(method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) return { ok: false, error: await readError(res, `Request failed (${res.status})`) };
    return { ok: true, data: (await res.json().catch(() => ({}))) as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Access flags from the overview, so actions the user cannot perform are hidden instead of failing. */
export type GstAccessFlags = { manage: boolean; file: boolean; approve: boolean };
