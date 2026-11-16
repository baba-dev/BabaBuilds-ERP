"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { useFormat } from "@/hooks/use-format";
import { DASHBOARD_ROUTES } from "./dashboard-routes";

type Card = { id: string; name: string; reportId: string; currency: string; kpis: Array<{ key: string; value: number; format: "currency" | "number" | "percent" | "date" | "text" }>; insights: Array<{ code: string; params: Record<string, string | number> }> };

/** Key figures of the saved reports someone pinned to the dashboard. Shows nothing at all when none are pinned, or when reporting is off or not allowed. */
export function DashboardReportCards() {
  const t = useTranslations("ReportingCenter");
  const { fCurrency, locale } = useFormat();
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    let off = false;
    fetch("/api/reporting/dashboard-cards", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { cards: [] })).then((j: { cards?: Card[] }) => { if (!off) setCards(j.cards ?? []); }).catch(() => undefined);
    return () => { off = true; };
  }, []);

  if (!cards.length) return null;
  const label = (k: string) => (t.has(`label.${k}`) ? t(`label.${k}`) : k);
  return (
    <section className="space-y-3" aria-label={t("pinnedReports")}>
      <h2 className="flex items-center gap-2 px-1 text-sm font-semibold tracking-tight"><BarChart3 className="h-4 w-4 text-muted-foreground" />{t("pinnedReports")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.id} href={`${DASHBOARD_ROUTES.reporting}/${encodeURIComponent(c.reportId)}?view=${encodeURIComponent(c.id)}`} className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-orange-500/60">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              {c.kpis.map((k) => <div key={k.key} className="min-w-0"><dt className="truncate text-[11px] text-muted-foreground">{label(k.key)}</dt><dd className="truncate text-sm font-semibold tabular-nums">{k.format === "currency" ? fCurrency(k.value) : k.format === "percent" ? `${k.value}%` : k.value.toLocaleString(locale)}</dd></div>)}
            </dl>
            {c.insights[0] ? <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{t(`insight.${c.insights[0].code}`, { ...c.insights[0].params, kpi: c.insights[0].params.kpi ? label(String(c.insights[0].params.kpi)) : "" })}</p> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
