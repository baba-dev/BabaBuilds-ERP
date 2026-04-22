"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, CircleCheck, Clock3, Rocket, Sparkles } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PayrollOverviewResponseDto, PayrollRunStatusDto } from "@/lib/payroll/types";

const STATUS_LABEL: Record<PayrollRunStatusDto, string> = {
  DRAFT: "Draft",
  REVIEW: "Review",
  APPROVED: "Approved",
  POSTED: "Posted",
};

const STATUS_BADGE: Record<PayrollRunStatusDto, string> = {
  POSTED: "bg-emerald-500/10 text-emerald-700",
  APPROVED: "bg-indigo-500/10 text-indigo-700",
  REVIEW: "bg-amber-500/10 text-amber-700",
  DRAFT: "bg-zinc-500/10 text-zinc-700",
};

function formatPeriodLabel(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function formatPayDate(endIso: string) {
  const end = new Date(endIso);
  const pay = new Date(end);
  pay.setDate(pay.getDate() + 4);
  return new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(pay);
}

export default function PayrollOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PayrollOverviewResponseDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/payroll/overview", { cache: "no-store" });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as PayrollOverviewResponseDto;
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load payroll overview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currencyFmt = useMemo(
    () =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    [],
  );

  const queuedReviews = useMemo(() => {
    if (!data) return 0;
    return data.periods.filter((p) => p.latestRun?.status === "REVIEW").length;
  }, [data]);

  const firstReviewRunId = data?.periods.find((p) => p.latestRun?.status === "REVIEW")?.latestRun?.id;
  const firstPeriodId = data?.periods[0]?.latestRun?.id;

  const kpiCards = data
    ? [
        { label: "Gross payroll", value: currencyFmt.format(Number(data.kpis.grossPayroll)), sub: `${data.kpis.runCount} runs in window` },
        { label: "Deductions", value: currencyFmt.format(Number(data.kpis.deductions)), sub: "Sum of run totals" },
        { label: "Net payout", value: currencyFmt.format(Number(data.kpis.netPayout)), sub: "Across selected periods" },
        { label: "Employer cost", value: currencyFmt.format(Number(data.kpis.employerCost)), sub: "Taxes + benefits accrual" },
      ]
    : [];

  const periodStatuses = useMemo(() => {
    const count = (s: PayrollRunStatusDto) => data?.statusCounts.find((x) => x.status === s)?.count ?? 0;
    return [
      { label: "Draft", count: count("DRAFT"), tone: "text-zinc-600 dark:text-zinc-300 bg-zinc-500/10" },
      { label: "Review", count: count("REVIEW"), tone: "text-amber-700 dark:text-amber-300 bg-amber-500/10" },
      { label: "Approved", count: count("APPROVED"), tone: "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10" },
      { label: "Posted", count: count("POSTED"), tone: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10" },
    ] as const;
  }, [data]);

  return (
    <DashboardPageShell
      title="Payroll Command"
      description="Overview of periods, run readiness, and payout momentum."
      icon={<Rocket className="h-5 w-5 text-violet-500" />}
      kpiCard={{ label: "Queued reviews", value: queuedReviews, tone: queuedReviews > 0 ? "warning" : "positive" }}
      primaryAction={
        <Button asChild className="gap-2" disabled={!firstReviewRunId && !firstPeriodId}>
          <Link href={firstReviewRunId || firstPeriodId ? `/payroll/runs/${firstReviewRunId || firstPeriodId}` : "#"}>
            Open run <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      }
      secondaryActions={
        <Button variant="outline" asChild>
          <Link href="/payroll/settings">Payroll settings</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">{error}</div>
        ) : null}

        <section className="relative overflow-hidden rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-violet-500/[0.10] via-background to-cyan-500/[0.08] p-6 shadow-sm dark:border-zinc-800/70">
          <div className="pointer-events-none absolute -left-24 -top-20 h-52 w-52 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-52 w-52 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="relative space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Current period health</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {data?.periods[0] ? formatPeriodLabel(data.periods[0].startDate, data.periods[0].endDate) : "No periods yet"}
                </h2>
                {data?.adapterStatus ? (
                  <div className="mt-3">
                    <Badge
                      className={cn(
                        "rounded-full px-3 py-1 text-xs",
                        data.adapterStatus.source === "WORKFORCE"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
                      )}
                    >
                      {data.adapterStatus.badgeLabel}
                    </Badge>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {periodStatuses.map((status) => (
                  <Badge key={status.label} className={cn("rounded-full px-3 py-1.5 text-xs", status.tone)}>
                    {status.label} · {status.count}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {loading
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="rounded-2xl border border-white/50 bg-white/70 p-4 backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/40">
                      <div className="space-y-2 animate-pulse">
                        <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
                        <div className="h-7 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
                        <div className="h-3 w-20 rounded bg-zinc-200/70 dark:bg-zinc-800/60" />
                      </div>
                    </div>
                  ))
                : kpiCards.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/50 bg-white/70 p-4 backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-900/40">
                      <p className="text-xs uppercase tracking-wider text-zinc-500">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{item.value}</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.sub}</p>
                    </div>
                  ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-zinc-200/70 bg-white/70 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold tracking-tight">Payroll periods</h3>
              <Badge variant="secondary" className="gap-1 rounded-full">
                <CalendarClock className="h-3.5 w-3.5" />
                Recent periods
              </Badge>
            </div>
            <div className="space-y-3">
              {!loading && (!data?.periods.length || !data.periods.some((p) => p.latestRun)) ? (
                <p className="text-sm text-zinc-500">No payroll runs yet. Create a period and run from the back office or seed data.</p>
              ) : null}
              {data?.periods.map((period) => {
                const run = period.latestRun;
                if (!run) {
                  return (
                    <div
                      key={period.id}
                      className="rounded-xl border border-zinc-200/60 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/30"
                    >
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatPeriodLabel(period.startDate, period.endDate)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">No run generated for this period.</p>
                    </div>
                  );
                }
                const status = run.status;
                return (
                  <Link
                    key={period.id}
                    href={`/payroll/runs/${run.id}`}
                    className="group flex items-center justify-between rounded-xl border border-zinc-200/60 bg-white/80 p-4 transition hover:border-violet-300 hover:bg-violet-50/40 dark:border-zinc-800 dark:bg-zinc-950/30 dark:hover:border-violet-700/40"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatPeriodLabel(period.startDate, period.endDate)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Pay ~{formatPayDate(period.endDate)} · Net {currencyFmt.format(Number(run.totalNetPay))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={cn("rounded-full px-2.5 py-1 text-xs", STATUS_BADGE[status])}>{STATUS_LABEL[status]}</Badge>
                      <p className="text-sm font-semibold tabular-nums">{currencyFmt.format(Number(run.totalNetPay))}</p>
                      <ChevronRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-500" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <h3 className="text-base font-semibold tracking-tight">Run statuses</h3>
            <p className="mt-1 text-sm text-zinc-500">Counts across periods in the overview window.</p>
            <div className="mt-4 space-y-3">
              {data?.statusCounts.length ? (
                data.statusCounts.map((item) => (
                  <div key={item.status} className="rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/30">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 text-violet-500" />
                        <div>
                          <p className="text-sm font-medium">{STATUS_LABEL[item.status]}</p>
                          <p className="text-xs text-zinc-500">{item.count} runs</p>
                        </div>
                      </div>
                      <Badge className="rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">{item.count}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {[
                    { title: "Awaiting data", stage: "—", eta: "Create payroll periods", icon: Clock3 },
                    { title: "Runs", stage: "—", eta: "Generate runs to populate", icon: Sparkles },
                    { title: "Posted", stage: "—", eta: "Post from approved runs", icon: CircleCheck },
                  ].map((item) => (
                    <div key={item.title} className="rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <item.icon className="mt-0.5 h-4 w-4 text-violet-500" />
                          <div>
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-zinc-500">{item.eta}</p>
                          </div>
                        </div>
                        <Badge className="rounded-full bg-zinc-500/10 text-zinc-700 dark:text-zinc-300">{item.stage}</Badge>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </DashboardPageShell>
  );
}
