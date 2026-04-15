"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CircleAlert, CheckCircle2, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { DashboardData } from "./types";
import { dashboardTypography as ty } from "./dashboard-typography";

export function DashboardAttentionCenter({ attention }: { attention: DashboardData["attention"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: Record<string, unknown>) => {
    if (!(t as any).has?.(key)) return fallback;
    return t(key as never, values as never);
  };

  const isUrgent = attention.totalUrgent > 0;

  const getTone = (tone: string, value: number) => {
    if (value === 0) return "ok";
    if (tone === "critical") return "critical";
    if (tone === "warning") return "warning";
    return "info";
  };

  const getGlowClass = (computedTone: "ok" | "critical" | "warning" | "info") => {
    if (computedTone === "ok") return "bg-emerald-500/5 dark:bg-emerald-500/10 group-hover:bg-emerald-500/10 dark:group-hover:bg-emerald-500/20";
    if (computedTone === "critical") return "bg-rose-500/5 dark:bg-rose-500/10 group-hover:bg-rose-500/10 dark:group-hover:bg-rose-500/20";
    if (computedTone === "warning") return "bg-amber-500/5 dark:bg-amber-500/10 group-hover:bg-amber-500/10 dark:group-hover:bg-amber-500/20";
    return "bg-indigo-500/5 dark:bg-indigo-500/10 group-hover:bg-indigo-500/10 dark:group-hover:bg-indigo-500/20";
  };

  const getIndicatorClass = (computedTone: "ok" | "critical" | "warning" | "info") => {
    if (computedTone === "ok") return "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20";
    if (computedTone === "critical") return "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20";
    if (computedTone === "warning") return "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-500/20";
    return "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20";
  };

  const getAccentBorderClass = (computedTone: "ok" | "critical" | "warning" | "info") => {
    if (computedTone === "ok") return "hover:border-emerald-200/70 dark:hover:border-emerald-500/30";
    if (computedTone === "critical") return "hover:border-rose-200/70 dark:hover:border-rose-500/30";
    if (computedTone === "warning") return "hover:border-amber-200/70 dark:hover:border-amber-500/30";
    return "hover:border-indigo-200/70 dark:hover:border-indigo-500/30";
  };

  const getTopBarClass = (computedTone: "ok" | "critical" | "warning" | "info") => {
    if (computedTone === "ok") return "bg-emerald-500/60";
    if (computedTone === "critical") return "bg-rose-500/60";
    if (computedTone === "warning") return "bg-amber-500/60";
    return "bg-indigo-500/60";
  };

  const getTextAccentClass = (computedTone: "ok" | "critical" | "warning" | "info") => {
    if (computedTone === "ok") return "text-emerald-600 dark:text-emerald-400";
    if (computedTone === "critical") return "text-rose-600 dark:text-rose-400";
    if (computedTone === "warning") return "text-amber-600 dark:text-amber-400";
    return "text-indigo-600 dark:text-indigo-400";
  };
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        {isUrgent ? (
          <AlertTriangle className="w-5 h-5 text-rose-500" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        )}
        <h3 className={ty.sectionTitle}>{tr("attention_center", "Attention center")}</h3>
      </div>

      <Card
        className={`group relative overflow-hidden p-6 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm transition-all duration-500 ${
          isUrgent ? "hover:shadow-md hover:-translate-y-1" : "hover:shadow-md"
        } animate-in fade-in slide-in-from-top-1`}
      >
        <div
          className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl transition-all duration-700 ${
            isUrgent
              ? "bg-rose-500/5 dark:bg-rose-500/10 group-hover:bg-rose-500/10 dark:group-hover:bg-rose-500/20"
              : "bg-emerald-500/5 dark:bg-emerald-500/10 group-hover:bg-emerald-500/10 dark:group-hover:bg-emerald-500/20"
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-50/50 to-transparent dark:from-white/10 dark:via-white/5 dark:to-transparent pointer-events-none" />
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 ${
            isUrgent ? "bg-rose-500/70" : "bg-emerald-500/70"
          } ${isUrgent ? "motion-safe:animate-pulse" : ""}`}
        />

        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className={ty.labelUpper}>
              {isUrgent ? tr("items_need_action", "Items need action") : tr("all_caught_up", "All caught up")}
            </p>
            <p className={`mt-2 ${ty.value4xlLight} ${isUrgent ? "" : "text-zinc-800 dark:text-zinc-100"}`}>
              {isUrgent ? attention.totalUrgent : 0}
            </p>
            <p className={`mt-2 ${ty.helper}`}>
              {isUrgent ? tr("attention_center_desc", "Prioritized by urgency across finance, compliance, and operations.") : tr("attention_center_zero_desc", "No urgent items requiring immediate action.")}
            </p>
          </div>

          <div
            className={`shrink-0 w-10 h-10 rounded-2xl border shadow-sm flex items-center justify-center transition-colors ${
              isUrgent ? "motion-safe:animate-in motion-safe:zoom-in-95 duration-500" : ""
            } ${getIndicatorClass(
              isUrgent ? "critical" : "ok",
            )}`}
          >
            {isUrgent ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
          {attention.cards.map((card, i) => {
            const isZero = card.value === 0;
            const computedTone = getTone(card.tone, card.value);
            return (
              <Card
                key={card.id}
                className={`group relative overflow-hidden p-4 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/60 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-500 animate-in fade-in slide-in-from-bottom-2 ${getAccentBorderClass(
                  computedTone,
                )}`}
                style={{ animationFillMode: "both", animationDelay: `${i * 75}ms` } as CSSProperties}
              >
                <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl transition-all duration-700 ${getGlowClass(computedTone)}`} />
                <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent dark:from-white/5 dark:to-transparent pointer-events-none" />
                <div className={`absolute left-0 top-0 h-0.5 w-full ${getTopBarClass(computedTone)}`} />

                <div className="relative z-10 flex flex-col h-full">
                  <p className={`${ty.labelUpper} ${isZero ? "" : getTextAccentClass(computedTone)}`}>
                    {card.title}
                  </p>
                  <p
                    className={`mt-2 ${ty.value3xlLight} ${isZero ? "text-zinc-500 dark:text-zinc-400" : ""}`}
                  >
                    {card.value}
                  </p>
                  <p className={`mt-1 ${ty.helperXs} text-zinc-600 dark:text-zinc-300`}>{card.helper}</p>

                  <div className="mt-auto pt-4">
                    {card.href ? (
                      <Link
                        href={card.href}
                        className={`inline-flex items-center ${ty.helperXs} font-semibold transition-colors ${
                          isZero
                            ? "text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
                            : "text-zinc-900 hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"
                        }`}
                      >
                        Open <ArrowRight className="ml-1 w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                      </Link>
                    ) : (
                      <span className="inline-block h-4" />
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 pt-5 border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            {tr("receivables", "Receivables")}:{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{attention.pendingInvoices}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            {tr("critical_notifications", "Critical notifications")}:{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{attention.criticalNotifications}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            {tr("retainers_due_soon", "Retainers due soon")}:{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{attention.retainersDueSoon}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleAlert className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            {tr("failed_imports", "Failed imports")}:{" "}
            <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{attention.failedImports}</span>
          </span>
        </div>
      </Card>
    </section>
  );
}
