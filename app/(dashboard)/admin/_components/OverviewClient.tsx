"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, RefreshCcw, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Card, ErrorNote, Kpi, dateTime, inr, inrCompact, relative, useAdminJson } from "./admin-kit";

type Attention = { key: string; severity: "critical" | "warning" | "info"; count: number; href: string };
type Overview = {
  workspaces: { total: number; demo: number }; users: number;
  plans: { free: number; trialing: number; pro: number; team: number; suspended: number };
  revenue: { mrr: number; activePaid: number; expiredPaid: number };
  trials: { active: number; endingSoon: number; expired: number };
  growth: { new30: number; prev30: number; signups: Array<{ date: string; count: number }> };
  invoices: { total: number; last30: number; gmv30: number; gmvAll: number };
  backup: { at: string | null; count: number };
  attention: Attention[]; generatedAt: string;
};

const TEXT: Record<string, (n: number) => string> = {
  AUDIT_INTEGRITY: (n) => `${n} audit-log entries failed the integrity check`,
  CONFIG_MISSING: (n) => `${n} required server setting${n === 1 ? " is" : "s are"} missing`,
  NO_BACKUP: () => "No backup has been taken yet",
  BACKUP_STALE: (n) => `The newest backup is ${n} days old`,
  EXPIRED_PAID: (n) => `${n} workspace${n === 1 ? "" : "s"} still marked Pro or Team but past the end date, so they have no paid access`,
  TRIALS_ENDING: (n) => `${n} trial${n === 1 ? " ends" : "s end"} within 7 days`,
  EXPIRED_TRIALS: (n) => `${n} trial${n === 1 ? " has" : "s have"} ended and not converted`,
  SUSPENDED: (n) => `${n} suspended workspace${n === 1 ? "" : "s"}`,
  CONFIG_WARNINGS: (n) => `${n} optional setting${n === 1 ? "" : "s"} not configured`,
  AUTH_FAILURES: (n) => `${n} failed sign-ins since the server started`,
};

const SEV = {
  critical: { icon: ShieldAlert, cls: "text-rose-600 dark:text-rose-400", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "text-amber-600 dark:text-amber-400", label: "Warning" },
  info: { icon: Info, cls: "text-indigo-600 dark:text-indigo-400", label: "For your information" },
} as const;

const PLAN_BARS = [
  { key: "pro", label: "Pro", color: "bg-indigo-500" },
  { key: "team", label: "Team", color: "bg-violet-500" },
  { key: "trialing", label: "Trial", color: "bg-sky-400" },
  { key: "free", label: "Free", color: "bg-zinc-300 dark:bg-zinc-600" },
  { key: "suspended", label: "Suspended", color: "bg-rose-400" },
] as const;

export function OverviewClient() {
  const { data, error, loading, reload } = useAdminJson<Overview>("/api/admin/overview");
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-64 rounded-2xl" /></div>;

  const growth = data.growth.prev30 === 0 ? (data.growth.new30 > 0 ? "new this period" : "no signups yet") : `${data.growth.new30 >= data.growth.prev30 ? "+" : ""}${Math.round(((data.growth.new30 - data.growth.prev30) / data.growth.prev30) * 100)}% vs the 30 days before`;
  const planTotal = Math.max(1, PLAN_BARS.reduce((s, b) => s + data.plans[b.key], 0));
  const max = Math.max(1, ...data.growth.signups.map((s) => s.count));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Monthly recurring revenue" value={inr(data.revenue.mrr)} sub={`${data.revenue.activePaid} paying workspace${data.revenue.activePaid === 1 ? "" : "s"}`} />
        <Kpi label="Trials" value={data.trials.active} sub={data.trials.endingSoon ? `${data.trials.endingSoon} end within 7 days` : "none ending soon"} tone={data.trials.endingSoon ? "warn" : undefined} />
        <Kpi label="New workspaces, 30 days" value={data.growth.new30} sub={growth} tone={data.growth.new30 >= data.growth.prev30 ? "good" : "warn"} />
        <Kpi label="Invoiced, last 30 days" value={inrCompact(data.invoices.gmv30)} sub={`${data.invoices.last30} invoices (in rupees at the booked rate)`} />
        <Kpi label="Invoiced, all time" value={inrCompact(data.invoices.gmvAll)} sub={`${data.invoices.total} invoices, demo accounts excluded`} />
        <Kpi label="Customers" value={data.workspaces.total} sub={`${data.users} users · ${data.workspaces.demo} demo workspaces not counted`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Needs your attention" hint="Each line is a count with somewhere to go." right={<button type="button" onClick={reload} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" aria-label="Refresh"><RefreshCcw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />{relative(data.generatedAt)}</button>}>
          {data.attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden />All clear. Nothing needs you right now.</p>
          ) : (
            <ul className="-my-1 divide-y divide-border/60">
              {data.attention.map((a, i) => {
                const S = SEV[a.severity];
                const Icon = S.icon;
                return (
                  <motion.li key={a.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03, duration: 0.2 }} className="flex items-start gap-3 py-3">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", S.cls)} aria-label={S.label} />
                    <p className="min-w-0 flex-1 text-sm">{(TEXT[a.key] ?? (() => a.key))(a.count)}</p>
                    <Link href={a.href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">Open<ArrowUpRight className="size-3.5" aria-hidden /></Link>
                  </motion.li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">Last backup: {data.backup.at ? `${relative(data.backup.at)} (${dateTime(data.backup.at)})` : "none"} · {data.backup.count} kept</p>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card title="Plans" hint="Real customers only">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={PLAN_BARS.map((b) => `${b.label} ${data.plans[b.key]}`).join(", ")}>
              {PLAN_BARS.map((b) => <motion.div key={b.key} className={b.color} initial={{ width: 0 }} animate={{ width: `${(data.plans[b.key] / planTotal) * 100}%` }} transition={{ duration: 0.6 }} />)}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {PLAN_BARS.map((b) => <li key={b.key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", b.color)} aria-hidden />{b.label}</span><span className="font-semibold tabular-nums">{data.plans[b.key]}</span></li>)}
            </ul>
          </Card>
          <Card title="Sign-ups, last 14 days">
            <div className="flex h-24 items-end gap-1" role="img" aria-label={`New workspaces per day: ${data.growth.signups.map((s) => s.count).join(", ")}`}>
              {data.growth.signups.map((s) => <motion.div key={s.date} title={`${s.date}: ${s.count}`} className="flex-1 rounded-t bg-indigo-400/80" initial={{ height: 0 }} animate={{ height: `${Math.max(4, (s.count / max) * 100)}%` }} transition={{ duration: 0.5 }} />)}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>{data.growth.signups[0]?.date.slice(5)}</span><span>today</span></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
