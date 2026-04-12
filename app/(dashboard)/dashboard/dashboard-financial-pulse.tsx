import { Landmark, TrendingUp } from "lucide-react";
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
  const cards = [
    { label: "Billed revenue", value: financialPulse.billedRevenue, help: "Revenue invoiced in the selected financial year." },
    { label: "Receivables", value: financialPulse.receivables, help: "Money still expected from issued invoices." },
    { label: "Expenses", value: financialPulse.expenses, help: "Recorded outgoing spend for the selected period." },
    { label: "Estimated tax", value: financialPulse.estimatedTax, help: "Projected tax due based on current revenue profile." },
    { label: "Liquid assets", value: financialPulse.liquidAssets, help: "Investments and liquid holdings currently tracked." },
    { label: "MRR", value: financialPulse.recurringRevenue, help: "Monthly recurring revenue from active retainers." },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2"><Landmark className="w-4 h-4 text-indigo-500" /><h3 className="font-semibold">Financial pulse</h3></div>
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        {cards.map((item) => (
          <Card key={item.label} className="p-3 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <p className="text-xs text-zinc-500 flex items-center gap-1">{item.label} <DashboardTooltip label={item.help} /></p>
            <p className="text-lg font-bold mt-1">{fCurrency(item.value)}</p>
          </Card>
        ))}
      </div>
      <Card className="p-3 border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-500 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Reconciliation progress <DashboardTooltip label="Percent of bank transactions matched against invoices/expenses." /></p>
        <p className="text-lg font-bold mt-1">{financialPulse.reconciliationProgress}%</p>
      </Card>
    </section>
  );
}
