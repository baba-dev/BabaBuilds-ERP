"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BarChart3, Banknote, CalendarClock, FileSpreadsheet, Landmark, Pin, Search, Wallet } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, CATEGORIES, paramsToQuery, type ReportMeta, type ViewRow } from "./_components/shared";

const ICON = { Finance: Wallet, Sales: BarChart3, Cash: Banknote, Tax: Landmark, Operations: FileSpreadsheet } as const;

export default function ReportingHome() {
  const t = useTranslations("ReportingCenter");
  const [reports, setReports] = useState<ReportMeta[] | null>(null);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    let off = false;
    Promise.all([api<{ reports: ReportMeta[] }>("/api/reporting/catalog"), api<{ views: ViewRow[] }>("/api/reporting/views")])
      .then(([c, v]) => { if (!off) { setReports(c.reports); setViews(v.views); } })
      .catch(() => { if (!off) setError(true); });
    return () => { off = true; };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (reports ?? []).filter((r) => !s || `${t(`reports.${r.id}.title`)} ${t(`reports.${r.id}.desc`)}`.toLowerCase().includes(s));
  }, [reports, q, t]);

  return (
    <DashboardPageShell title={t("title")} description={t("subtitle")} icon={<BarChart3 className="h-6 w-6 text-primary" />}>
      <div className="space-y-8">
        {error ? <div className="rounded-2xl border border-rose-500/30 p-8 text-center text-sm">{t("loadFailed")}</div> : !reports ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div> : (
          <>
            <div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="pl-9" aria-label={t("search")} /></div>

            {views.length ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">{t("saved")}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {views.filter((v) => !q.trim() || v.name.toLowerCase().includes(q.trim().toLowerCase())).map((v) => (
                    <Link key={v.id} href={`/reporting/${v.reportId}?${paramsToQuery(v.paramsJson ?? {})}&view=${v.id}`} className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/40">
                      <div className="flex items-start justify-between gap-2"><p className="truncate font-medium">{v.name}</p>{v.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}</div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{reports.some((r) => r.id === v.reportId) ? t(`reports.${v.reportId}.title`) : v.reportId}</p>
                      {v.scheduleFrequency ? <Badge variant="secondary" className="mt-2 gap-1 text-[10px] font-normal"><CalendarClock className="h-3 w-3" />{t(`freq.${v.scheduleFrequency}`)}{v.scheduleLastError ? ` · ${t("scheduleFailed")}` : ""}</Badge> : null}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {CATEGORIES.map((cat) => {
              const list = filtered.filter((r) => r.category === cat);
              if (!list.length) return null;
              const Icon = ICON[cat];
              return (
                <section key={cat} className="space-y-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-muted-foreground" />{t(`category.${cat}`)}</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((r) => (
                      <Link key={r.id} href={`/reporting/${r.id}`} className={cn("group rounded-2xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md")}>
                        <p className="font-medium group-hover:text-primary">{t(`reports.${r.id}.title`)}</p>
                        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{t(`reports.${r.id}.desc`)}</p>
                        <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">{r.period === "asof" ? t("asOfToday") : t("forPeriod")}</p>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
            {filtered.length === 0 ? <p className="text-sm text-muted-foreground">{t("noMatch")}</p> : null}
          </>
        )}
      </div>
    </DashboardPageShell>
  );
}
