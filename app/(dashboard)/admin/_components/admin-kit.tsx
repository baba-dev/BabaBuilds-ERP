"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Fetch JSON from an admin API with loading, error and reload. A 403/404 reads as "no access", not a blank page. */
export function useAdminJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!url) { setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? "Your session no longer has admin access. Reload the page." : (body as { error?: string }).error ?? `Request failed (${r.status})`);
        return body as T;
      })
      .then((d) => { if (mine === seq.current) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (mine === seq.current) setError(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

export async function adminRequest<T = unknown>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }> {
  try {
    const res = await fetch(url, init);
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `Request failed (${res.status})`, code: body.code };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Network problem. Check the connection and try again." };
  }
}

export function Card({ title, hint, right, children, className }: { title?: React.ReactNode; hint?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card shadow-sm", className)}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div className="min-w-0"><h2 className="text-sm font-semibold tracking-tight">{title}</h2>{hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}</div>
          {right}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {sub ? <p className={cn("mt-1 text-xs", tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{sub}</p> : null}
    </div>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20",
  red: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
  grey: "bg-muted text-muted-foreground ring-border",
} as const;
export type Tone = keyof typeof TONES;

export function Chip({ tone = "grey", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", TONES[tone])}>{children}</span>;
}

export const ACCESS_LABEL: Record<string, { label: string; tone: Tone }> = {
  PAID: { label: "Paid", tone: "green" },
  TRIAL: { label: "Trial", tone: "indigo" },
  EXPIRED_PAID: { label: "Paid, expired", tone: "red" },
  EXPIRED_TRIAL: { label: "Trial ended", tone: "amber" },
  FREE: { label: "Free", tone: "grey" },
  SUSPENDED: { label: "Suspended", tone: "red" },
};

export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
export const inrCompact = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 }).format(n);
export const day = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(iso)) : "–");
export const dateTime = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "–");

export function relative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(s);
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return f.format(-s, "second");
  if (abs < 3600) return f.format(-Math.round(s / 60), "minute");
  if (abs < 86400) return f.format(-Math.round(s / 3600), "hour");
  return f.format(-Math.round(s / 86400), "day");
}

export const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
      {message}{onRetry ? <> <button type="button" onClick={onRetry} className="font-semibold underline">Try again</button></> : null}
    </p>
  );
}
