"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { cn } from "@/lib/utils";

type Report = {
  headcount: { active: number; joined: number; left: number; byDepartment: { name: string; count: number }[] };
  attendance: { present: number; late: number; remote: number; halfDay: number; absent: number; missing: number; lateRate: number; byEmployee: { name: string; late: number; absent: number; missing: number }[] };
  leave: { requests: number; days: number; byType: { name: string; days: number }[]; pending: number };
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

function Bars({ rows }: { rows: { name: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="text-xs">
          <div className="mb-0.5 flex justify-between"><span className="truncate">{r.name}</span><span className="tabular-nums text-zinc-500">{r.value}</span></div>
          <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-full rounded-full bg-teal-500" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function WorkforceReportsPage() {
  const t = useTranslations("WorkforceHub");
  const [range, setRange] = useState(() => ({ from: iso(new Date(Date.now() - 89 * 86_400_000)), to: iso(new Date()) }));
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    void (async () => {
      setError(null);
      const res = await fetch(`/api/workforce/reports?from=${range.from}&to=${range.to}`, { signal: ctl.signal }).catch(() => null);
      if (!res) return;
      const j = (await res.json().catch(() => ({}))) as Report & { error?: string };
      if (!res.ok) { setError(j.error ?? t("error")); return; }
      setData(j);
    })();
    return () => ctl.abort();
  }, [range, t]);

  const card = "rounded-2xl border border-zinc-200/60 bg-white/60 p-5 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-950/40";
  const input = "h-9 rounded-lg border border-zinc-300 bg-transparent px-2 text-sm dark:border-zinc-700";
  const stat = (label: string, value: number | string, tone = "") => (
    <div><p className="text-[11px] font-semibold text-zinc-500">{label}</p><p className={cn("text-xl font-black tabular-nums", tone)}>{value}</p></div>
  );

  return (
    <WorkforcePageShell title={t("nav.reports")} description={t("description")}
      actions={<a href={`/api/workforce/reports?from=${range.from}&to=${range.to}&format=csv`}><Button size="sm" variant="outline" className="h-8 text-xs"><Download className="me-1.5 h-3.5 w-3.5" />{t("reports.export")}</Button></a>}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold">{t("leave.from")}<input type="date" className={cn(input, "mt-1 block")} value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
          <label className="text-xs font-semibold">{t("leave.to")}<input type="date" className={cn(input, "mt-1 block")} value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {!data ? <div className="h-48 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" /> : (
          <div className="grid gap-6 lg:grid-cols-3">
            <section className={card} aria-labelledby="r-head">
              <h2 id="r-head" className="mb-3 text-sm font-black">{t("reports.headcount")}</h2>
              <div className="mb-4 grid grid-cols-3 gap-3">{stat(t("reports.active"), data.headcount.active)}{stat(t("reports.joined"), data.headcount.joined, "text-emerald-600")}{stat(t("reports.left"), data.headcount.left, "text-rose-600")}</div>
              <p className="mb-2 text-xs font-semibold text-zinc-500">{t("reports.byDepartment")}</p>
              <Bars rows={data.headcount.byDepartment.map((d) => ({ name: d.name, value: d.count }))} />
            </section>
            <section className={card} aria-labelledby="r-att">
              <h2 id="r-att" className="mb-3 text-sm font-black">{t("nav.attendance")}</h2>
              <div className="mb-4 grid grid-cols-2 gap-3">{stat(t("reports.presentDays"), data.attendance.present, "text-emerald-600")}{stat(t("reports.lateDays"), `${data.attendance.late} (${data.attendance.lateRate}%)`, "text-amber-600")}{stat(t("reports.absentDays"), data.attendance.absent, "text-rose-600")}{stat(t("kpi.notMarked"), data.attendance.missing)}</div>
              <p className="mb-2 text-xs font-semibold text-zinc-500">{t("reports.needsAttention")}</p>
              {data.attendance.byEmployee.length === 0 ? <p className="text-xs text-zinc-500">{t("reports.none")}</p> : (
                <ul className="space-y-1 text-xs">{data.attendance.byEmployee.map((e) => <li key={e.name} className="flex justify-between gap-2"><span className="truncate">{e.name}</span><span className="tabular-nums text-zinc-500">{e.late} {t("status.LATE")} · {e.absent} {t("status.ABSENT")} · {e.missing} {t("kpi.notMarked")}</span></li>)}</ul>
              )}
            </section>
            <section className={card} aria-labelledby="r-lv">
              <h2 id="r-lv" className="mb-3 text-sm font-black">{t("nav.leave")}</h2>
              <div className="mb-4 grid grid-cols-3 gap-3">{stat(t("reports.requests"), data.leave.requests)}{stat(t("reports.daysTaken"), data.leave.days)}{stat(t("kpi.pending"), data.leave.pending, "text-amber-600")}</div>
              <p className="mb-2 text-xs font-semibold text-zinc-500">{t("reports.byType")}</p>
              {data.leave.byType.length === 0 ? <p className="text-xs text-zinc-500">{t("reports.none")}</p> : <Bars rows={data.leave.byType.map((l) => ({ name: l.name, value: l.days }))} />}
            </section>
          </div>
        )}
      </div>
    </WorkforcePageShell>
  );
}
