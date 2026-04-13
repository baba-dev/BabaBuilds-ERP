"use client";

import { Landmark, TrendingUp } from "lucide-react";
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
  const tr = (key: string, fallback: string) => {
    try { return t(key as any); } catch { return fallback; }
  };
  const cards = [
    { label: tr("billed_revenue", "Billed revenue"), value: financialPulse.billedRevenue, help: tr("billed_revenue_help", "Revenue invoiced in the selected financial year.") },
    { label: tr("receivables", "Receivables"), value: financialPulse.receivables, help: tr("receivables_help", "Money still expected from issued invoices.") },
    { label: tr("expenses", "Expenses"), value: financialPulse.expenses, help: tr("expenses_help", "Recorded outgoing spend for the selected period.") },
    { label: tr("estimated_tax", "Estimated tax"), value: financialPulse.estimatedTax, help: tr("estimated_tax_help", "Projected tax due based on current revenue profile.") },
    { label: tr("liquid_assets", "Liquid assets"), value: financialPulse.liquidAssets, help: tr("liquid_assets_help", "Investments and liquid holdings currently tracked.") },
    { label: "MRR", value: financialPulse.recurringRevenue, help: tr("mrr_help", "Monthly recurring revenue from active retainers.") },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2"><Landmark className="w-4 h-4 text-indigo-500" /><h3 className="font-semibold">{tr("financial_pulse", "Financial pulse")}</h3></div>
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        {cards.map((item) => (
          <Card key={item.label} className="p-3.5 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/95 shadow-sm">
            <p className="text-xs text-zinc-500 flex items-center gap-1 font-medium">{item.label} <DashboardTooltip label={item.help} /></p>
            <p className="text-xl font-semibold mt-1.5 tracking-tight">{fCurrency(item.value)}</p>
          </Card>
        ))}
      </div>
      <Card className="p-3.5 border-zinc-200 dark:border-zinc-800 shadow-sm">
        <p className="text-xs text-zinc-500 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> {tr("reconciliation_progress", "Reconciliation progress")} <DashboardTooltip label={tr("reconciliation_progress_help", "Percent of bank transactions matched against invoices/expenses.")} /></p>
        <p className="text-xl font-semibold mt-1.5">{financialPulse.reconciliationProgress}%</p>
      </Card>
    </section>
  );
}
