"use client";

import Link from "next/link";
import { Boxes, AlertOctagon, Users2, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";
import { dashboardTypography as ty } from "./dashboard-typography";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardModulePromoCard } from "@/components/dashboard/DashboardModulePromoCard";
import { createTranslator } from "@/lib/i18n/translator";

export function DashboardOperationsPanel({
  operations,
  locked = false,
  lockedReason,
  enabledModules = new Set(["WORKFORCE", "PAYROLL"]),
  onModuleEnabled,
}: {
  operations: DashboardData["operations"];
  locked?: boolean;
  lockedReason?: string;
  enabledModules?: Set<string>;
  onModuleEnabled?: (moduleKey: string) => void;
}) {
  const t = useTranslations("Dashboard");
  const tr = createTranslator(t);

  // Adaptive Card mod: if both Workforce & Payroll are disabled, show premium promo
  const isWorkforceEnabled = enabledModules.has("WORKFORCE");
  const isPayrollEnabled = enabledModules.has("PAYROLL");

  if (!isWorkforceEnabled && !isPayrollEnabled) {
    return (
      <DashboardModulePromoCard
        moduleKey="WORKFORCE"
        label="Workforce & Payroll Suite"
        description="Integrate employee directories, leave requests, attendance clocks, and automated salary slip generation synced directly to your financial ledgers."
        icon={Users2}
        features={[
          "Employee directory & profile cards",
          "Leave approvals & daily attendance records",
          "Ledger-linked payroll liability posting",
          "Readiness checks & staged rollout safeguards"
        ]}
        onEnabled={() => {
          onModuleEnabled?.("WORKFORCE");
        }}
      />
    );
  }

  // Active state: either is enabled.
  const hasData = operations.hasOperationalData;

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={`p-5 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md ${locked ? "opacity-55" : ""}`}>
            {/* Subtle background glow */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/[0.03] dark:bg-orange-500/[0.06] rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between gap-4 mb-4">
              <p className={`${ty.sectionTitle} inline-flex items-center gap-2 text-foreground font-extrabold`}>
                <Boxes className="w-4 h-4 text-orange-500" /> 
                {tr("operations_inventory", "Operations & inventory")}
              </p>
              <DashboardTooltip label="Monitors tasks, low stock limits, and recent stock changes." />
            </div>

            {/* Grid Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm border-b border-zinc-100 dark:border-zinc-800/60 pb-4">
              <div className="p-3 rounded-xl bg-zinc-50/40 dark:bg-zinc-900/10 border border-zinc-100 dark:border-zinc-800/40">
                <p className={`${ty.labelUpper} inline-flex items-center gap-1 opacity-75`}>
                  Low stock SKUs
                </p>
                <p className={`${ty.value2xlLight} mt-1 tabular-nums`}>{operations.lowStockCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50/40 dark:bg-zinc-900/10 border border-zinc-100 dark:border-zinc-800/40">
                <p className={`${ty.labelUpper} inline-flex items-center gap-1 opacity-75`}>
                  Open POs
                </p>
                <p className={`${ty.value2xlLight} mt-1 tabular-nums`}>{operations.openPurchaseOrders}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50/40 dark:bg-zinc-900/10 border border-zinc-100 dark:border-zinc-800/40">
                <p className={`${ty.labelUpper} inline-flex items-center gap-1 opacity-75`}>
                  Open tasks
                </p>
                <p className={`${ty.value2xlLight} mt-1 tabular-nums`}>{operations.openTasks}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50/40 dark:bg-zinc-900/10 border border-zinc-100 dark:border-zinc-800/40">
                <p className={`${ty.labelUpper} inline-flex items-center gap-1 opacity-75`}>
                  Blocked tasks
                </p>
                <p className={`${ty.value2xlLight} mt-1 tabular-nums`}>{operations.blockedTasks}</p>
              </div>
            </div>

            {/* Activity/Nominal area */}
            <div className="mt-4">
              {!hasData ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-50">
                      Operations stable & nominal
                    </p>
                    <p className={`${ty.helperXs} text-muted-foreground`}>
                      No pending stock shortages, blocked tasks, or open purchase orders detected.
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="h-8 rounded-lg text-[11px] font-extrabold uppercase tracking-wider shrink-0 gap-1.5">
                    <Link href="/import-manager">
                      Universal Import
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    Recent Inventory Movements:
                  </p>
                  <div className="space-y-1.5">
                    {operations.recentInventoryMovements.slice(0, 3).map((movement) => (
                      <div key={movement.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-zinc-50/50 dark:bg-zinc-900/20 border border-zinc-100/50 dark:border-zinc-800/30">
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
                          {movement.productName}
                        </span>
                        <span className={`font-bold tabular-nums inline-flex items-center gap-1 ${
                          movement.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}>
                          <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                          {movement.quantity > 0 ? "+" : ""}{movement.quantity} ({movement.type})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </TooltipTrigger>
        {locked ? (
          <TooltipContent className="max-w-[280px] text-xs">
            {lockedReason ?? tr("permissions_locked", "You do not have permission to view this module.")}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </TooltipProvider>
  );
}
