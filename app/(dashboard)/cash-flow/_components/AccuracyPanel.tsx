"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, dayLabel, shortDay, type Accuracy } from "./shared";

export function AccuracyPanel({ locale, money }: { locale: string; money: (n: number) => string }) {
  const t = useTranslations("CashFlow");
  const [d, setD] = useState<Accuracy | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api<Accuracy>("/api/cash-flow/accuracy").then(setD).catch(() => setErr(true)); }, []);
  if (err) return <p className="rounded-2xl border border-rose-500/30 p-6 text-sm text-rose-600">{t("loadFailed")}</p>;
  if (!d) return <Skeleton className="h-64 rounded-2xl" />;
  if (d.score == null) return <div className="rounded-2xl border border-dashed p-10 text-center"><p className="font-medium">{t("accuracy.emptyTitle")}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t(`accuracy.reason.${d.reason ?? "NO_HISTORY"}`)}</p></div>;
  const max = Math.max(1, ...d.periods.flatMap((p) => [Math.abs(p.forecastNet), Math.abs(p.actualNet)]));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("accuracy.score")}</p><p className={cn("mt-1 text-3xl font-semibold tabular-nums", d.score >= 80 ? "text-emerald-600 dark:text-emerald-400" : d.score >= 60 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>{d.score}%</p><p className="text-xs text-muted-foreground">{t("accuracy.scoreHint", { weeks: d.snapshot?.weeksAgo ?? 0 })}</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("accuracy.bias")}</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(Math.abs(d.bias ?? 0))}</p><p className="text-xs text-muted-foreground">{(d.bias ?? 0) > 0 ? t("accuracy.optimistic") : t("accuracy.cautious")}</p></div>
        <div className="rounded-2xl border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("accuracy.forecastFrom")}</p><p className="mt-1 text-xl font-semibold">{dayLabel(d.snapshot?.generatedAt ?? null, locale)}</p><p className="text-xs text-muted-foreground">{t("accuracy.weeksCompared", { count: d.periods.length })}</p></div>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {d.periods.map((p) => (
          <li key={p.start} className="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_1fr_9rem] sm:items-center">
            <p className="text-sm font-medium">{shortDay(p.start, locale)} – {shortDay(new Date(new Date(p.end).getTime() - 86_400_000).toISOString(), locale)}</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2"><span className="w-16 text-[11px] text-muted-foreground">{t("accuracy.forecast")}</span><div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-primary/60" style={{ width: `${(Math.abs(p.forecastNet) / max) * 100}%` }} /></div><span className="w-24 text-right text-xs tabular-nums">{money(p.forecastNet)}</span></div>
              <div className="flex items-center gap-2"><span className="w-16 text-[11px] text-muted-foreground">{t("accuracy.actual")}</span><div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-emerald-500/70" style={{ width: `${(Math.abs(p.actualNet) / max) * 100}%` }} /></div><span className="w-24 text-right text-xs tabular-nums">{money(p.actualNet)}</span></div>
            </div>
            <p className={cn("text-right text-sm tabular-nums", Math.abs(p.error) < max * 0.15 ? "text-muted-foreground" : p.error > 0 ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400")}>{p.error > 0 ? "+" : "−"}{money(Math.abs(p.error))}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
