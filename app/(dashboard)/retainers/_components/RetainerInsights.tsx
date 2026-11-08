"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MrrMovementMonth } from "@/lib/retainers/movement-types";
import type { RetainerRiskDto } from "@/lib/retainers/types";
import { formatDate, formatMoney, formatMoneyCompact } from "./retainer-utils";
import { useJson } from "./use-retainers-data";

const REASON_STYLE: Record<string, string> = {
  FAILED: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  OVERDUE: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  PAUSED: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  ENDING: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  RENEWS: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export function RiskPanel({ risk, currency, locale, reloadToken }: { risk: RetainerRiskDto | null; currency: string; locale: string; reloadToken: number }) {
  const t = useTranslations("RetainersHub.insights");
  void reloadToken;
  if (!risk) return <Skeleton className="h-48 rounded-2xl" />;
  const total = risk.counts.paused + risk.counts.failed + risk.counts.overdue + risk.counts.ending;
  return (
    <section aria-labelledby="risk-title" className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="risk-title" className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-amber-500" aria-hidden />{t("riskTitle")}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{t("atRisk", { amount: formatMoneyCompact(risk.atRiskMrr, currency, locale) })}</span>
      </div>
      {total === 0 && risk.items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("riskEmpty")}</p> : (
        <ul className="divide-y divide-border/60">
          {risk.items.map((item, idx) => (
            <li key={`${item.id}-${item.reason}-${idx}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <Link href={`/retainers?retainer=${item.id}`} className="block truncate font-medium hover:underline">{item.name}</Link>
                <span className="block truncate text-xs text-muted-foreground">{item.clientName}{item.date ? ` · ${formatDate(item.date, locale)}` : ""}{item.amount ? ` · ${formatMoney(item.amount, currency, locale)}` : ""}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", REASON_STYLE[item.reason])}>{t(`reason.${item.reason}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MovementPanel({ currency, locale, reloadToken }: { currency: string; locale: string; reloadToken: number }) {
  const t = useTranslations("RetainersHub.insights");
  const { data, loading } = useJson<{ data: MrrMovementMonth[] }>(`/api/retainers/movement?months=6&v=${reloadToken}`);
  const months = data?.data ?? null;
  const max = months ? Math.max(1, ...months.map((m) => Math.max(m.new + m.expansion, m.contraction + m.churn))) : 1;
  return (
    <section aria-labelledby="mov-title" className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="mov-title" className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="size-4 text-indigo-500" aria-hidden />{t("movementTitle")}</h2>
        <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" aria-hidden />{t("new")}</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sky-500" aria-hidden />{t("expansion")}</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" aria-hidden />{t("contraction")}</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-rose-500" aria-hidden />{t("churn")}</span>
        </span>
      </div>
      {!months && loading ? <Skeleton className="h-36 w-full" /> : (
        <ol className="space-y-2" aria-label={t("movementTitle")}>
          {(months ?? []).map((m) => {
            const gain = m.new + m.expansion;
            const loss = m.contraction + m.churn;
            return (
              <li key={m.month} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-xs">
                <span className="text-muted-foreground tabular-nums">{new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m.month}-01T00:00:00Z`))}</span>
                <span className="flex h-3 items-center gap-0.5" role="img" aria-label={t("monthLabel", { gain: formatMoney(gain, currency, locale), loss: formatMoney(loss, currency, locale) })}>
                  {m.new > 0 && <span className="h-3 rounded-sm bg-emerald-500" style={{ width: `${(m.new / max) * 45}%` }} />}
                  {m.expansion > 0 && <span className="h-3 rounded-sm bg-sky-500" style={{ width: `${(m.expansion / max) * 45}%` }} />}
                  {m.contraction > 0 && <span className="h-3 rounded-sm bg-amber-500" style={{ width: `${(m.contraction / max) * 45}%` }} />}
                  {m.churn > 0 && <span className="h-3 rounded-sm bg-rose-500" style={{ width: `${(m.churn / max) * 45}%` }} />}
                  {gain === 0 && loss === 0 && <span className="h-px w-full bg-border" />}
                </span>
                <span className="text-end tabular-nums">
                  <span className={cn("font-semibold", m.net > 0 && "text-emerald-600 dark:text-emerald-400", m.net < 0 && "text-rose-600 dark:text-rose-400")}>{m.net > 0 ? "+" : ""}{formatMoneyCompact(m.net, currency, locale)}</span>
                  <span className="ms-2 text-muted-foreground">{formatMoneyCompact(m.endingMrr, currency, locale)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">{t("movementNote")}</p>
    </section>
  );
}
