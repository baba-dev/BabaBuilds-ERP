"use client";

import { useEffect, useState } from "react";
import { Landmark, ArrowUpRight, ArrowDownRight, ShieldCheck, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { typography as ty, tx } from "@/lib/ui/typography";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";
import { createTranslator } from "@/lib/i18n/translator";

// Optional subtle count animation for values to make it feel "alive"
function CountUpValue({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1200; // ms
    
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(easeProgress * value);
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };
    
    // Slight delay to allow layout to settle before animating
    const timer = setTimeout(() => {
      window.requestAnimationFrame(step);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [value]);

  return <>{formatter(displayValue)}</>;
}

export function DashboardFinancialPulse({
  financialPulse,
  fCurrency,
}: {
  financialPulse: DashboardData["financialPulse"];
  fCurrency: (value: number) => string;
}) {
  const t = useTranslations("Dashboard");
  const tr = createTranslator(t);

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

  const ReconIcon = isHealthy ? CheckCircle2 : isModerate ? Clock : AlertCircle;

  // Mount animation for the progress bar
  const [mountedWidth, setMountedWidth] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setMountedWidth(Math.max(5, reconciliationProgress));
    }, 250);
    return () => clearTimeout(timer);
  }, [reconciliationProgress]);

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 px-1">
        <Landmark className="w-5 h-5 text-orange-500" />
        <h3 className={ty.sectionTitle}>
          {tr("financial_pulse", "Financial pulse")}
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Revenue & Collections */}
        <Card className="group relative overflow-hidden p-6 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-500 animate-in fade-in slide-in-from-bottom-3">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-orange-500/5 dark:bg-orange-500/10 rounded-full blur-3xl group-hover:bg-orange-500/10 dark:group-hover:bg-orange-500/20 transition-all duration-700" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center border border-orange-100 dark:border-orange-500/20 shadow-sm">
                  <ArrowUpRight className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <p className={ty.cardTitle}>
                  {tr("revenue_collections", "Revenue & Collections")}
                </p>
              </div>
            </div>
            
            <div className="space-y-1 mb-8">
              <p className={tx(ty.labelUpper, "flex items-center gap-1.5")}>
                {tr("billed_revenue", "Billed revenue")} 
                <DashboardTooltip label={tr("billed_revenue_help", "Revenue invoiced in the selected financial year.")} />
              </p>
              <p className={ty.metricValueXl}>
                <CountUpValue value={billedRevenue} formatter={fCurrency} />
              </p>
            </div>
            
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800 flex items-center justify-between transition-colors group-hover:border-orange-100 dark:group-hover:border-orange-900/40">
              <p className={tx(ty.helperXs, "font-semibold flex items-center gap-1.5")}>
                {tr("receivables", "Receivables")} 
                <DashboardTooltip label={tr("receivables_help", "Money still expected from issued invoices.")} />
              </p>
              <p className={ty.metricValueSm}>
                {fCurrency(receivables)}
              </p>
            </div>
          </div>
        </Card>

        {/* 2. Outflow & Obligations */}
        <Card className="group relative overflow-hidden p-6 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-500 animate-in fade-in slide-in-from-bottom-3 delay-100 fill-mode-both">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-rose-500/5 dark:bg-rose-500/10 rounded-full blur-3xl group-hover:bg-rose-500/10 dark:group-hover:bg-rose-500/20 transition-all duration-700" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center border border-rose-100 dark:border-rose-500/20 shadow-sm">
                  <ArrowDownRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                </div>
                <p className={ty.cardTitle}>
                  {tr("outflow_obligations", "Outflow & Obligations")}
                </p>
              </div>
            </div>
            
            <div className="space-y-1 mb-8">
              <p className={tx(ty.labelUpper, "flex items-center gap-1.5")}>
                {tr("expenses", "Expenses")} 
                <DashboardTooltip label={tr("expenses_help", "Recorded outgoing spend for the selected period.")} />
              </p>
              <p className={ty.metricValueXl}>
                <CountUpValue value={expenses} formatter={fCurrency} />
              </p>
            </div>
            
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800 flex items-center justify-between transition-colors group-hover:border-rose-100 dark:group-hover:border-rose-900/40">
              <p className={tx(ty.helperXs, "font-semibold flex items-center gap-1.5")}>
                {tr("estimated_tax", "Estimated tax")} 
                <DashboardTooltip label={tr("estimated_tax_help", "Projected tax due based on current revenue profile.")} />
              </p>
              <p className={ty.metricValueSm}>
                {fCurrency(estimatedTax)}
              </p>
            </div>
          </div>
        </Card>

        {/* 3. Stability & MRR (Visual Anchor) */}
        <Card className="group relative overflow-hidden p-6 border-orange-200 dark:border-orange-500/30 bg-[#fff8f3] dark:bg-orange-950/20 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-500 animate-in fade-in slide-in-from-bottom-3 delay-200 fill-mode-both ring-1 ring-inset ring-orange-500/5 dark:ring-orange-500/10">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-amber-500/5 dark:from-orange-500/10 dark:to-amber-500/10 opacity-80 pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-600 dark:bg-orange-500 flex items-center justify-center shadow-md">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <p className={tx(ty.cardTitle, "text-orange-950 dark:text-orange-100")}>
                  {tr("capital_stability", "Capital & Stability")}
                </p>
              </div>
            </div>
            
            <div className="space-y-1 mb-8">
              <p className={tx(ty.labelUpperStrong, "text-orange-800/80 dark:text-orange-300 flex items-center gap-1.5")}>
                {tr("mrr", "Monthly Recurring (MRR)")} 
                <DashboardTooltip label={tr("mrr_help", "Monthly recurring revenue from active retainers.")} />
              </p>
              <p className={tx(ty.metricValueXl, "font-semibold text-orange-950 dark:text-white")}>
                <CountUpValue value={recurringRevenue} formatter={fCurrency} />
              </p>
            </div>
            
            <div className="p-3.5 rounded-xl bg-white/70 dark:bg-orange-950/40 border border-orange-100 dark:border-orange-500/20 flex items-center justify-between backdrop-blur-sm transition-colors group-hover:border-orange-200 dark:group-hover:border-orange-500/40">
              <p className={tx(ty.helperXs, "font-semibold text-orange-900/80 dark:text-orange-200 flex items-center gap-1.5")}>
                {tr("liquid_assets", "Liquid assets")} 
                <DashboardTooltip label={tr("liquid_assets_help", "Investments and liquid holdings currently tracked.")} />
              </p>
              <p className={tx(ty.metricValueSm, "text-orange-950 dark:text-white")}>
                {fCurrency(liquidAssets)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Reconciliation Progress */}
      <Card className={`group p-6 overflow-hidden relative animate-in fade-in slide-in-from-bottom-4 delay-300 fill-mode-both transition-all duration-500 border ${
        isHealthy 
          ? "border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/10 shadow-sm hover:shadow-md"
          : isModerate 
          ? "border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 shadow-sm hover:shadow-md"
          : "border-rose-200/60 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/10 shadow-sm hover:shadow-md"
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          
          <div className="flex items-start gap-4 flex-1">
            <div className={`p-3.5 rounded-2xl flex-shrink-0 shadow-sm border ${
              isHealthy ? "bg-emerald-100/80 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
              : isModerate ? "bg-amber-100/80 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30"
              : "bg-rose-100/80 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30"
            }`}>
              <ReconIcon className="w-6 h-6" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h4 className={tx(ty.cardTitle, "text-base")}>
                  {tr("reconciliation_progress", "Reconciliation Progress")}
                </h4>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isHealthy ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : isModerate ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
                }`}>
                  {reconStatus}
                </span>
                <DashboardTooltip label={tr("reconciliation_progress_help", "Percent of bank transactions matched against invoices/expenses.")} />
              </div>
              <p className={tx(ty.helper, "max-w-xl")}>
                {reconMessage}
              </p>
            </div>
          </div>

          <div className="flex-shrink-0 w-full lg:w-80 mt-2 lg:mt-0">
            <div className="flex justify-between items-end mb-3">
              <span className={ty.helper}>Match rate</span>
              <span className={`text-3xl font-bold tracking-tight ${
                  isHealthy ? 'text-emerald-600 dark:text-emerald-400' 
                  : isModerate ? 'text-amber-600 dark:text-amber-400' 
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {reconciliationProgress}%
              </span>
            </div>
            <div className="h-3.5 w-full bg-zinc-200/60 dark:bg-zinc-800/80 rounded-full overflow-hidden shadow-inner flex items-center">
              <div
                className={`h-full rounded-full transition-all duration-[1500ms] ease-out relative ${reconColorClass}`}
                style={{ width: `${mountedWidth}%` }}
              />
            </div>
          </div>
          
        </div>
      </Card>
    </section>
  );
}
