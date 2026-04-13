"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CircleAlert, CheckCircle2, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { DashboardData } from "./types";

export function DashboardAttentionCenter({ attention }: { attention: DashboardData["attention"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };

  const isUrgent = attention.totalUrgent > 0;

  const getCardStyle = (tone: string, value: number) => {
    if (value === 0) {
      return "border-zinc-200/50 bg-zinc-50/50 dark:border-zinc-800/40 dark:bg-zinc-900/20";
    }
    if (tone === "critical") return "border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/20";
    if (tone === "warning") return "border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/20";
    return "border-indigo-200 bg-indigo-50 dark:bg-indigo-500/10 dark:border-indigo-500/20";
  };

  const getLabelStyle = (tone: string, value: number) => {
    if (value === 0) return "text-zinc-500 dark:text-zinc-500 text-[11px]";
    if (tone === "critical") return "text-rose-600 dark:text-rose-400 text-[11px]";
    if (tone === "warning") return "text-amber-600 dark:text-amber-400 text-[11px]";
    return "text-indigo-600 dark:text-indigo-400 text-[11px]";
  };

  return (
    <Card className={`p-5 md:p-6 transition-colors duration-500 ${isUrgent ? "border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-indigo-50/80 to-white dark:from-zinc-900 dark:to-zinc-950" : "border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-950/30 shadow-none"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.14em] uppercase font-semibold text-zinc-500 dark:text-zinc-400">
            {tr("attention_center", "Attention center")}
          </p>
          <h2 className={`text-2xl md:text-3xl font-bold mt-1 ${isUrgent ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-300"}`}>
            {isUrgent ? `${attention.totalUrgent} ${tr("items_need_action", "items need action")}` : tr("all_caught_up", "All caught up")}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isUrgent ? tr("attention_center_desc", "Prioritized by urgency across finance, compliance, and operations.") : tr("attention_center_zero_desc", "No urgent items requiring immediate action.")}
          </p>
        </div>
        <div className={`inline-flex h-10 w-10 shrink-0 rounded-full items-center justify-center transition-colors duration-500 ${isUrgent ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400" : "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500"}`}>
          {isUrgent ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-6">
        {attention.cards.map((card, i) => {
          const isZero = card.value === 0;
          return (
            <div 
              key={card.id} 
              className={`group flex flex-col rounded-xl border p-4 transition-all duration-300 overflow-hidden relative ${getCardStyle(card.tone, card.value)} hover:-translate-y-0.5 ${isZero ? "" : "hover:shadow-md dark:hover:shadow-zinc-950/50"} animate-in fade-in slide-in-from-bottom-2`}
              style={{ animationFillMode: "both", animationDelay: `${i * 75}ms` }}
            >
              <p className={`uppercase tracking-wider font-semibold ${getLabelStyle(card.tone, card.value)}`}>{card.title}</p>
              <p className={`text-3xl font-bold mt-2 ${isZero ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-900 dark:text-zinc-100"}`}>{card.value}</p>
              <p className={`text-xs mt-1 ${isZero ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-400"}`}>{card.helper}</p>
              
              <div className="mt-auto pt-4">
                {card.href ? (
                  <Link href={card.href} className={`inline-flex items-center text-xs font-medium transition-colors ${isZero ? "text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400" : "text-zinc-900 hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400"}`}>
                    Open <ArrowRight className="ml-1 w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <span className="inline-block h-4" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6 pt-4 border-t border-zinc-200/80 dark:border-zinc-800/80 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" /> 
          Outstanding receivables: <span className="font-medium text-zinc-700 dark:text-zinc-300">{attention.outstandingReceivables ?? attention.pendingInvoices}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" /> 
          Critical notifications: <span className="font-medium text-zinc-700 dark:text-zinc-300">{attention.criticalNotifications}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" /> 
          Retainers due soon: <span className="font-medium text-zinc-700 dark:text-zinc-300">{attention.retainersDueSoon}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleAlert className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" /> 
          Failed imports: <span className="font-medium text-zinc-700 dark:text-zinc-300">{attention.failedImports}</span>
        </span>
      </div>
    </Card>
  );
}
