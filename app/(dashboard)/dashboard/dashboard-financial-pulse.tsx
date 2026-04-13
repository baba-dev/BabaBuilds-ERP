"use client";

import { Landmark, TrendingUp, ArrowUpRight, ArrowDownRight, ShieldCheck, Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";

export function DashboardFinancialPulse({
  financialPulse,
  fCurrency,
}: {
  financialPulse: DashboardData["financialPulse"];
  fCurrency: (value: number) => string;
}) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };

  const {
    billedRevenue,
    receivables,
    expenses,
    estimatedTax,
    liquidAssets,
    recurringRevenue,
    reconciliationProgress,
  } = financialPulse;

  // Compute status colors and messaging for reconciliation
  const isHealthy = reconciliationProgress >= 80;
  const isModerate = reconciliationProgress >= 50 && reconciliationProgress < 80;
  
  const reconMessage = isHealthy
    ? tr("recon_healthy", "Your books are well synchronized with your bank accounts. Excellent operational health.")
    : isModerate
    ? tr("recon_moderate", "You have pending transactions to categorize. Consider reviewing soon to keep books accurate.")
    : tr("recon_needs_attention", "A significant portion of your transactions are unreconciled. Immediate attention recommended.");

  const reconStatus = isHealthy
    ? tr("status_healthy", "Healthy")
    : isModerate
    ? tr("status_pending", "Pending")
    : tr("status_attention", "Needs Attention");

  const reconColorClass = isHealthy
    ? "bg-emerald-500"
    : isModerate
    ? "bg-amber-500"
    : "bg-rose-500";

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-indigo-500" />
        <h3 className="font-semibold">{tr("financial_pulse", "Financial pulse")}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Revenue & Collections */}
        <Card className="group relative overflow-hidden p-5 border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shadow-sm hover:-translate-y-0.5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-indigo-500 to-indigo-400/20" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {tr("revenue_collections", "Revenue & Collections")}
            </p>
            <ArrowUpRight className="w-4 h-4 text-indigo-500/70" />
          </div>
          <div className="mt-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-500 flex items-center gap-1 font-medium tracking-wide uppercase">
              {tr("billed_revenue", "Billed revenue")} <DashboardTooltip label={tr("billed_revenue_help", "Revenue invoiced in the selected financial year.")} />
            </p>
            <p className="text-3xl font-semibold mt-1 tracking-tight text-zinc-900 dark:text-zinc-50">
              {fCurrency(billedRevenue)}
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
            <p className="text-sm text-zinc-500 flex items-center gap-1">
              {tr("receivables", "Receivables")} <DashboardTooltip label={tr("receivables_help", "Money still expected from issued invoices.")} />
            </p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{fCurrency(receivables)}</p>
          </div>
        </Card>

        {/* 2. Outflow & Obligations */}
        <Card className="group relative overflow-hidden p-5 border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shadow-sm hover:-translate-y-0.5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 delay-100 fill-mode-both">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-rose-500 to-rose-400/20" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {tr("outflow_obligations", "Outflow & Obligations")}
            </p>
            <ArrowDownRight className="w-4 h-4 text-rose-500/70" />
          </div>
          <div className="mt-4">
            <p className="text-xs text-zinc-500 dark:text-zinc-500 flex items-center gap-1 font-medium tracking-wide uppercase">
              {tr("expenses", "Expenses")} <DashboardTooltip label={tr("expenses_help", "Recorded outgoing spend for the selected period.")} />
            </p>
            <p className="text-3xl font-semibold mt-1 tracking-tight text-zinc-900 dark:text-zinc-50">
              {fCurrency(expenses)}
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
            <p className="text-sm text-zinc-500 flex items-center gap-1">
              {tr("estimated_tax", "Estimated tax")} <DashboardTooltip label={tr("estimated_tax_help", "Projected tax due based on current revenue profile.")} />
            </p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{fCurrency(estimatedTax)}</p>
          </div>
        </Card>

        {/* 3. Stability & MRR */}
        <Card className="group relative overflow-hidden p-5 border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shadow-sm hover:-translate-y-0.5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 delay-200 fill-mode-both">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 to-emerald-400/20" />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {tr("capital_stability", "Capital & Stability")}
            </p>
            <ShieldCheck className="w-4 h-4 text-emerald-500/70" />
          </div>
          <div className="mt-4">
            <p className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-bold tracking-wide uppercase">
              {tr("mrr", "Monthly Recurring (MRR)")} <DashboardTooltip label={tr("mrr_help", "Monthly recurring revenue from active retainers.")} />
            </p>
            <p className="text-3xl font-semibold mt-1 tracking-tight text-zinc-900 dark:text-zinc-50">
              {fCurrency(recurringRevenue)}
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
            <p className="text-sm text-zinc-500 flex items-center gap-1">
              {tr("liquid_assets", "Liquid assets")} <DashboardTooltip label={tr("liquid_assets_help", "Investments and liquid holdings currently tracked.")} />
            </p>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{fCurrency(liquidAssets)}</p>
          </div>
        </Card>
      </div>

      {/* Reconciliation Progress */}
      <Card className="p-5 border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shadow-sm overflow-hidden relative animate-in fade-in slide-in-from-bottom-2 delay-300 fill-mode-both hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors duration-300">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <Activity className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                {tr("reconciliation_progress", "Reconciliation progress")} <DashboardTooltip label={tr("reconciliation_progress_help", "Percent of bank transactions matched against invoices/expenses.")} />
              </p>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-lg leading-relaxed">
              {reconMessage}
            </p>
          </div>

          <div className="flex-1 md:max-w-sm w-full">
            <div className="flex justify-between items-end mb-2">
              <span className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{reconciliationProgress}%</span>
              <span className={`text-xs font-bold uppercase tracking-wide ${isHealthy ? 'text-emerald-600 dark:text-emerald-500' : isModerate ? 'text-amber-600 dark:text-amber-500' : 'text-rose-600 dark:text-rose-500'}`}>
                {reconStatus}
              </span>
            </div>
            <div className="h-2.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${reconColorClass}`}
                style={{ width: `${reconciliationProgress}%` }}
              />
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
