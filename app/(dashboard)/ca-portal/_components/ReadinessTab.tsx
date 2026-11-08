"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReadinessArea } from "@/lib/ca/readiness";
import { useKindName, useMoney, type Overview } from "./ca-utils";

const TONE: Record<ReadinessArea["status"], { chip: string; icon: typeof CheckCircle2 }> = {
  OK: { chip: "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-300 dark:bg-emerald-500/10", icon: CheckCircle2 },
  ATTENTION: { chip: "text-amber-800 bg-amber-50 ring-amber-600/20 dark:text-amber-300 dark:bg-amber-500/10", icon: AlertTriangle },
  BLOCKED: { chip: "text-rose-700 bg-rose-50 ring-rose-600/20 dark:text-rose-300 dark:bg-rose-500/10", icon: AlertTriangle },
  NOT_APPLICABLE: { chip: "text-zinc-500 bg-zinc-50 ring-zinc-500/20 dark:text-zinc-400 dark:bg-zinc-500/10", icon: MinusCircle },
};

export function ReadinessTab({ data }: { data: Overview }) {
  const t = useTranslations("CaCompliance.readiness");
  const { c } = useMoney();
  const kindName = useKindName();
  const r = data.readiness;
  return (
    <div className="space-y-4">
      <div className={cn("flex flex-wrap items-center gap-3 rounded-2xl border p-4", r.readyToClose ? "border-emerald-300/50 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-500/10" : "border-rose-300/50 bg-rose-50 dark:border-rose-400/20 dark:bg-rose-500/10")}>
        {r.readyToClose ? <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden /> : <AlertTriangle className="size-5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{r.readyToClose ? t("allClear") : t("summaryBlocked", { count: r.blockers })}</p>
          <p className="text-xs text-muted-foreground">{t("summaryHint", { warnings: r.warnings })}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {r.areas.map((a, idx) => {
          const tone = TONE[a.status];
          const Icon = tone.icon;
          return (
            <motion.section key={a.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: idx * 0.03 }} className={cn("rounded-2xl border border-border/70 bg-card shadow-sm", a.status === "NOT_APPLICABLE" && "opacity-60")}>
              <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{t(`areas.${a.key}`)}</h3>
                  {a.total > 0 ? <p className="text-xs text-muted-foreground">{t("checked", { count: a.total })}</p> : null}
                </div>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", tone.chip)}><Icon className="size-3.5" aria-hidden />{t(`status.${a.status}`)}</span>
              </header>
              {a.issues.length > 0 ? (
                <ul className="divide-y divide-border/60">
                  {a.issues.map((i) => (
                    <li key={i.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                      <span className={cn("mt-0.5 shrink-0", i.severity === "blocker" ? "text-rose-500" : i.severity === "warning" ? "text-amber-500" : "text-sky-500")}>{i.severity === "info" ? <Info className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}</span>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="text-sm">{t(`issues.${i.code}`, { count: i.count, amount: c(i.amount ?? 0) })}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className="font-medium">{t(`severity.${i.severity}`)}</span>
                          {i.blocks.length > 0 ? ` · ${t("blocks", { kinds: i.blocks.map((k) => kindName({ kind: k, label: k.startsWith("GST_") ? k.replace("GST_", "").replace("GSTR", "GSTR-") : null })).join(", ") })}` : ""}
                        </p>
                      </div>
                      <Link href={i.href} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("fix")}<ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden /></Link>
                    </li>
                  ))}
                </ul>
              ) : a.status !== "NOT_APPLICABLE" ? <p className="px-4 py-3 text-sm text-muted-foreground">{t("areaClear")}</p> : <p className="px-4 py-3 text-sm text-muted-foreground">{t(`na.${a.key}`)}</p>}
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
