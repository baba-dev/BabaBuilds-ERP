"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock, Users2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import type { WorkforceReport } from "@/lib/workforce/report-math";
import { cn } from "@/lib/utils";

const GLASS_CARD_CLASS =
  "rounded-2xl border border-zinc-200/60 bg-white/55 shadow-sm backdrop-blur-sm dark:border-zinc-700/50 dark:bg-zinc-950/40 dark:shadow-black/30";

const RANGE_OPTIONS = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
];

const ATTENDANCE_LABELS: Record<keyof WorkforceReport["attendance"]["totals"], string> = {
  PRESENT: "Present",
  LATE: "Late",
  REMOTE: "Remote",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
};

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

function rangeFor(months: number) {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (months - 1), 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return `from=${iso(from)}&to=${iso(to)}`;
}

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-zinc-200/70 dark:bg-zinc-800">
      <div className={cn("h-2 rounded-full bg-indigo-500", className)} style={{ width: `${width}%` }} />
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className={cn(GLASS_CARD_CLASS, "p-5")}>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <Icon className="h-4 w-4 text-zinc-500" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
    </div>
  );
}

type LoadResult = { months: string; report: WorkforceReport | null; error: string | null };

export default function WorkforceReportsPage() {
  const [months, setMonths] = useState("6");
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const requested = months;
    fetch(`/api/workforce/reports?${rangeFor(Number(requested))}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(res.status === 403 ? "You don't have access to workforce reports." : body.error ?? "Could not load reports.");
        }
        setResult({ months: requested, report: (await res.json()) as WorkforceReport, error: null });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ months: requested, report: null, error: e instanceof Error ? e.message : "Could not load reports." });
      });
    return () => controller.abort();
  }, [months]);

  // Loading is derived: the latest result does not yet match the selected period.
  const loading = result?.months !== months;
  const report = result?.report ?? null;
  const error = loading ? null : result?.error ?? null;

  const maxHeadcount = Math.max(0, ...(report?.headcount.series.map((s) => s.headcount) ?? []));
  const maxDept = Math.max(0, ...(report?.headcount.byDepartment.map((d) => d.count) ?? []));
  const maxLeave = Math.max(0, ...(report?.leave.byType.map((l) => l.approvedDays) ?? []));

  return (
    <WorkforcePageShell
      title="Workforce Reports"
      description="Headcount trends, attendance and leave utilization for your team."
      actions={
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="w-44" aria-label="Report period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {error ? (
        <div role="alert" className={cn(GLASS_CARD_CLASS, "p-6 text-sm text-rose-600 dark:text-rose-400")}>{error}</div>
      ) : loading && !report ? (
        <div className={cn(GLASS_CARD_CLASS, "p-6 text-sm text-zinc-500")} aria-busy="true">Loading reports…</div>
      ) : report ? (
        <div className={cn("grid gap-6 lg:grid-cols-2", loading && "opacity-60")} aria-busy={loading}>
          <Card title="Headcount trend" icon={Users2}>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <Stat label="Current team" value={report.headcount.current} />
              <Stat label="Joiners" value={report.headcount.series.reduce((n, s) => n + s.joiners, 0)} />
              <Stat label="Leavers" value={report.headcount.series.reduce((n, s) => n + s.leavers, 0)} />
            </div>
            <ul className="space-y-2">
              {report.headcount.series.map((s) => (
                <li key={s.month} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-xs">
                  <span className="text-zinc-500">{s.month}</span>
                  <Bar value={s.headcount} max={maxHeadcount} />
                  <span className="text-right tabular-nums font-medium">{s.headcount}</span>
                </li>
              ))}
            </ul>
            {report.headcount.byDepartment.length > 0 && (
              <div className="mt-5 border-t border-zinc-200/60 pt-4 dark:border-zinc-800">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">By department</h3>
                <ul className="space-y-2">
                  {report.headcount.byDepartment.map((d) => (
                    <li key={d.department} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-xs">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">{d.department}</span>
                      <Bar value={d.count} max={maxDept} className="bg-teal-500" />
                      <span className="text-right tabular-nums font-medium">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Attendance analytics" icon={Clock}>
            {report.attendance.recordsCounted === 0 ? (
              <p className="text-sm text-zinc-500">No attendance has been recorded in this period.</p>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-3 gap-4">
                  <Stat label="Attendance rate" value={pct(report.attendance.attendanceRate)} />
                  <Stat label="Late rate" value={pct(report.attendance.lateRate)} />
                  <Stat label="Records" value={report.attendance.recordsCounted} />
                </div>
                <ul className="space-y-2">
                  {report.attendance.series.map((s) => (
                    <li key={s.month} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 text-xs">
                      <span className="text-zinc-500">{s.month}</span>
                      <Bar value={(s.attendanceRate ?? 0) * 100} max={100} className="bg-emerald-500" />
                      <span className="text-right tabular-nums font-medium">{pct(s.attendanceRate)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-zinc-200/60 pt-4 text-xs dark:border-zinc-800">
                  {(Object.keys(ATTENDANCE_LABELS) as Array<keyof typeof ATTENDANCE_LABELS>).map((k) => (
                    <div key={k}>
                      <dt className="text-zinc-500">{ATTENDANCE_LABELS[k]}</dt>
                      <dd className="font-semibold tabular-nums">{report.attendance.totals[k]}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>

          <div className="lg:col-span-2">
            <Card title="Leave utilization" icon={CalendarDays}>
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Approved days taken" value={report.leave.totalApprovedDays} />
                <Stat label="Approved requests" value={report.leave.statusCounts.APPROVED} />
                <Stat label="Pending" value={report.leave.statusCounts.PENDING} />
                <Stat label="Rejected" value={report.leave.statusCounts.REJECTED} />
              </div>
              {report.leave.byType.length === 0 ? (
                <p className="text-sm text-zinc-500">No approved leave in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {report.leave.byType.map((l) => (
                    <li key={l.leaveTypeId} className="grid grid-cols-[10rem_1fr_6rem] items-center gap-3 text-xs">
                      <span className="truncate text-zinc-600 dark:text-zinc-300">{l.name}</span>
                      <Bar value={l.approvedDays} max={maxLeave} className="bg-amber-500" />
                      <span className="text-right tabular-nums font-medium">{l.approvedDays} days · {l.requests}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </WorkforcePageShell>
  );
}
