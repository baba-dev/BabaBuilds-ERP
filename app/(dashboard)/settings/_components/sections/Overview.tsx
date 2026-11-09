"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CheckCircle2, Circle, CircleDot, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type OverviewCheck, useSettingsData } from "../settings-data";
import { Panel } from "../form-kit";
import type { SectionProps } from "./types";

const HREF: Record<string, string> = { team: "/settings/team" };
const hrefFor = (c: OverviewCheck) => HREF[c.section] ?? `/settings?section=${c.section}`;

/** Animated completion ring. The number is the same text a screen reader gets. */
function Ring({ percent }: { percent: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-28 shrink-0" role="img" aria-label={`${percent}%`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-indigo-100 dark:stroke-indigo-950" />
        <motion.circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-indigo-500" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - percent / 100) }} transition={{ duration: 0.9, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-bold tabular-nums">{percent}%</span></div>
    </div>
  );
}

export function OverviewSection({ data }: SectionProps) {
  const t = useTranslations("SettingsHub.overview");
  const { overview } = useSettingsData();
  if (!overview) return <div className="space-y-4"><Skeleton className="h-40 rounded-3xl" /><Skeleton className="h-64 rounded-2xl" /></div>;

  const todo = overview.checks.filter((c) => c.status === "todo");
  const optional = overview.checks.filter((c) => c.status === "optional");
  const done = overview.checks.filter((c) => c.status === "done");
  const next = todo[0] ?? optional[0];
  const name = data.companyName?.trim();

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-indigo-50 via-background to-emerald-50 p-5 shadow-sm dark:from-indigo-950/40 dark:via-background dark:to-emerald-950/30 sm:p-7">
        <Sparkles className="pointer-events-none absolute -end-4 -top-4 size-32 text-indigo-200/50 dark:text-indigo-500/10" aria-hidden />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Ring percent={overview.percent} />
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{overview.open === 0 ? t("allDone") : name ? t("headline", { name }) : t("headlineNoName")}</h2>
            <p className="max-w-lg text-sm text-muted-foreground">{overview.open === 0 ? t("allDoneBody") : t("progress", { done: done.length, total: done.length + todo.length + optional.length })}</p>
            {next ? <Link href={hrefFor(next)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("next", { item: t(`item.${next.key}.title`) })}<ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden /></Link> : null}
          </div>
        </div>
      </motion.div>

      {todo.length ? <List title={t("required")} hint={t("requiredHint")} items={todo} tone="todo" /> : null}
      {optional.length ? <List title={t("recommended")} hint={t("recommendedHint")} items={optional} tone="optional" /> : null}
      {done.length ? <List title={t("completed")} items={done} tone="done" /> : null}
    </div>
  );
}

function List({ title, hint, items, tone }: { title: string; hint?: string; items: OverviewCheck[]; tone: "todo" | "optional" | "done" }) {
  const t = useTranslations("SettingsHub.overview");
  const Icon = tone === "done" ? CheckCircle2 : tone === "todo" ? CircleDot : Circle;
  return (
    <Panel title={title} description={hint}>
      <ul className="-my-1 divide-y divide-border/60">
        {items.map((c, i) => (
          <motion.li key={c.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03, duration: 0.2 }} className="flex items-start gap-3 py-3">
            <Icon className={cn("mt-0.5 size-5 shrink-0", tone === "done" ? "text-emerald-500" : tone === "todo" ? "text-amber-500" : "text-muted-foreground")} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", tone === "done" && "text-muted-foreground")}>{t(`item.${c.key}.title`)}</p>
              {tone !== "done" ? <p className="text-xs text-muted-foreground">{t(`item.${c.key}.why`)}</p> : null}
            </div>
            <Link href={hrefFor(c)} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{tone === "done" ? t("review") : t("setUp")}<ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden /></Link>
          </motion.li>
        ))}
      </ul>
    </Panel>
  );
}
