"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, CalendarDays, Clock, Coffee, UserCheck, Users2 } from "lucide-react";
import { CheckInCard } from "@/components/workforce/hub/CheckInCard";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { cn } from "@/lib/utils";

type Summary = {
  enabled?: boolean; totalEmployees: number; activeEmployees: number; presentToday: number; lateToday: number; absentToday: number;
  onLeaveToday: number; pendingApprovals: number; notMarkedToday: number; isWorkingDay: boolean;
  upcomingHolidays: { name: string; date: string }[]; birthdaysAndJoiners: { newThisMonth: number; leftThisMonth: number };
};
type Pending = { id: string; days: number; startDate: string; endDate: string; employee: { firstName: string; lastName: string }; leaveType: { name: string } };

export default function WorkforceOverviewPage() {
  const t = useTranslations("WorkforceHub");
  const locale = useLocale();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [canApprove, setCanApprove] = useState(false);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([fetch("/api/workforce/summary"), fetch("/api/workforce/leave/requests?status=PENDING&limit=5")]);
    if (s.ok) setSummary((await s.json()) as Summary);
    if (l.ok) { const j = (await l.json()) as { requests: Pending[]; canApprove: boolean }; setPending(j.requests); setCanApprove(j.canApprove); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const d = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const kpis = [
    { key: "kpi.total", value: summary?.activeEmployees, icon: Users2, tone: "text-teal-600" },
    { key: "kpi.present", value: summary?.presentToday, icon: UserCheck, tone: "text-emerald-600" },
    { key: "kpi.late", value: summary?.lateToday, icon: Clock, tone: "text-amber-600" },
    { key: "kpi.onLeave", value: summary?.onLeaveToday, icon: CalendarDays, tone: "text-violet-600" },
    { key: "kpi.notMarked", value: summary?.notMarkedToday, icon: AlertCircle, tone: "text-rose-600" },
  ] as const;
  const card = "rounded-2xl border border-zinc-200/60 bg-white/60 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-950/40";

  return (
    <WorkforcePageShell title={t("title")} description={t("description")}>
      <div className="space-y-6">
        {summary && !summary.isWorkingDay && <p className={cn(card, "flex items-center gap-2 px-4 py-3 text-sm")}><Coffee className="h-4 w-4 text-amber-500" />{t("overview.offDay")}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {kpis.map(({ key, value, icon: Icon, tone }) => (
            <div key={key} className={cn(card, "p-4")}>
              <div className="flex items-start justify-between"><p className="text-xs font-semibold text-zinc-500">{t(key)}</p><Icon className={cn("h-4 w-4", tone)} /></div>
              <p className={cn("mt-2 text-2xl font-black tabular-nums", tone)}>{value ?? "—"}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1"><CheckInCard onChanged={() => void load()} /></div>
          <section className={cn(card, "lg:col-span-2")} aria-labelledby="wf-appr">
            <header className="flex items-center justify-between border-b border-zinc-200/60 px-5 py-3 dark:border-zinc-800/60">
              <h2 id="wf-appr" className="text-sm font-black">{t("overview.approvals")}{summary ? ` (${summary.pendingApprovals})` : ""}</h2>
              <Link href="/workforce/leave" className="text-xs font-semibold text-teal-600">{t("overview.viewAll")}</Link>
            </header>
            {!canApprove || pending.length === 0 ? <p className="p-5 text-sm text-zinc-500">{t("overview.approvalsEmpty")}</p> : (
              <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                {pending.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-5 py-3 text-sm">
                    <span className="font-semibold">{r.employee.firstName} {r.employee.lastName}</span>
                    <span className="text-xs text-zinc-500">{r.leaveType.name} · {d(r.startDate)}{r.startDate !== r.endDate ? ` – ${d(r.endDate)}` : ""} · {t("leave.dayCount", { count: r.days })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className={cn(card, "p-5")} aria-labelledby="wf-hol">
            <h2 id="wf-hol" className="mb-3 text-sm font-black">{t("overview.holidays")}</h2>
            {!summary || summary.upcomingHolidays.length === 0 ? <p className="text-sm text-zinc-500">{t("overview.noHolidays")}</p> : (
              <ul className="space-y-2 text-sm">{summary.upcomingHolidays.map((h) => <li key={h.date} className="flex justify-between"><span>{h.name}</span><span className="text-zinc-500">{d(h.date)}</span></li>)}</ul>
            )}
          </section>
          <section className={cn(card, "flex flex-col justify-between p-5")}>
            <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <p>{t("overview.joined", { count: summary?.birthdaysAndJoiners.newThisMonth ?? 0 })}</p>
              <p>{t("overview.left", { count: summary?.birthdaysAndJoiners.leftThisMonth ?? 0 })}</p>
            </div>
            <Link href="/workforce/people" className="mt-4 text-xs font-semibold text-teal-600">{t("overview.people")} →</Link>
          </section>
        </div>
      </div>
    </WorkforcePageShell>
  );
}
