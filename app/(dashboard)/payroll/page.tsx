"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, CircleCheck, Clock3, Rocket, Sparkles } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PayrollPeriod = {
  id: string;
  label: string;
  payDate: string;
  employees: number;
  net: string;
  status: "Draft" | "Review" | "Approved" | "Posted";
  variance: string;
};

const periodStatuses = [
  { label: "Draft", count: 1, tone: "text-zinc-600 dark:text-zinc-300 bg-zinc-500/10" },
  { label: "Review", count: 2, tone: "text-amber-700 dark:text-amber-300 bg-amber-500/10" },
  { label: "Approved", count: 1, tone: "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10" },
  { label: "Posted", count: 9, tone: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10" },
] as const;

const periods: PayrollPeriod[] = [
  { id: "run-2026-04-15", label: "Apr 1 - Apr 15, 2026", payDate: "Apr 19", employees: 46, net: "$96,340", status: "Review", variance: "+1.8%" },
  { id: "run-2026-03-31", label: "Mar 16 - Mar 31, 2026", payDate: "Apr 4", employees: 45, net: "$94,610", status: "Approved", variance: "+0.6%" },
  { id: "run-2026-03-15", label: "Mar 1 - Mar 15, 2026", payDate: "Mar 19", employees: 44, net: "$93,980", status: "Posted", variance: "-0.2%" },
  { id: "run-2026-02-28", label: "Feb 16 - Feb 28, 2026", payDate: "Mar 4", employees: 44, net: "$94,220", status: "Posted", variance: "+0.1%" },
];

const kpis = [
  { label: "Gross payroll", value: "$142,780", sub: "+2.4% vs last run" },
  { label: "Deductions", value: "$36,140", sub: "25.3% effective rate" },
  { label: "Net payout", value: "$106,640", sub: "46 active employees" },
  { label: "Employer cost", value: "$11,920", sub: "Taxes + benefits" },
];

export default function PayrollOverviewPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const queuedReviews = useMemo(() => periods.filter((p) => p.status === "Review").length, []);

  return (
    <DashboardPageShell
      title="Payroll Command"
      description="Overview of periods, run readiness, and payout momentum."
      icon={<Rocket className="h-5 w-5 text-violet-500" />}
      kpiCard={{ label: "Queued reviews", value: queuedReviews, tone: queuedReviews > 0 ? "warning" : "positive" }}
      primaryAction={
        <Button asChild className="gap-2">
          <Link href="/payroll/runs/run-2026-04-15">Open active run <ChevronRight className="h-4 w-4" /></Link>
        </Button>
      }
      secondaryActions={
        <Button variant="outline" asChild>
          <Link href="/payroll/settings">Payroll settings</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-violet-500/[0.10] via-background to-cyan-500/[0.08] p-6 shadow-sm dark:border-zinc-800/70">
          <div className="pointer-events-none absolute -left-24 -top-20 h-52 w-52 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-52 w-52 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="relative space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Current period health</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Apr 1 - Apr 15 run is on track</h2>
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
                : kpis.map((item) => (
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
              <Badge variant="secondary" className="gap-1 rounded-full"><CalendarClock className="h-3.5 w-3.5" />Bi-monthly cadence</Badge>
            </div>
            <div className="space-y-3">
              {periods.map((period) => (
                <Link
                  key={period.id}
                  href={`/payroll/runs/${period.id}`}
                  className="group flex items-center justify-between rounded-xl border border-zinc-200/60 bg-white/80 p-4 transition hover:border-violet-300 hover:bg-violet-50/40 dark:border-zinc-800 dark:bg-zinc-950/30 dark:hover:border-violet-700/40"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{period.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">Pay date {period.payDate} · {period.employees} employees · Variance {period.variance}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs",
                        period.status === "Posted" && "bg-emerald-500/10 text-emerald-700",
                        period.status === "Approved" && "bg-indigo-500/10 text-indigo-700",
                        period.status === "Review" && "bg-amber-500/10 text-amber-700",
                        period.status === "Draft" && "bg-zinc-500/10 text-zinc-700",
                      )}
                    >
                      {period.status}
                    </Badge>
                    <p className="text-sm font-semibold tabular-nums">{period.net}</p>
                    <ChevronRight className="h-4 w-4 text-zinc-400 transition group-hover:text-violet-500" />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-5 dark:border-zinc-800/70 dark:bg-zinc-900/30">
            <h3 className="text-base font-semibold tracking-tight">Run statuses</h3>
            <p className="mt-1 text-sm text-zinc-500">Actionable queue with timeline clarity.</p>
            <div className="mt-4 space-y-3">
              {[
                { title: "Tax preview published", stage: "Review", eta: "Due in 8h", icon: Clock3 },
                { title: "Finance sign-off pending", stage: "Approved", eta: "Tomorrow", icon: Sparkles },
                { title: "ACH file posted", stage: "Posted", eta: "Completed", icon: CircleCheck },
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
            </div>
          </div>
        </section>
      </div>
    </DashboardPageShell>
  );
}
