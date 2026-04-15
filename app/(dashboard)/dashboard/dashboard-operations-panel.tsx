"use client";

import { Boxes, AlertOctagon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";
import { dashboardTypography as ty } from "./dashboard-typography";

export function DashboardOperationsPanel({ operations }: { operations: DashboardData["operations"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    if (!t.has(key as any)) return fallback;
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };
  if (!operations.hasOperationalData) return null;

  return (
    <Card className="p-4 border-zinc-200 dark:border-zinc-800">
      <p className={`${ty.sectionTitle} inline-flex items-center gap-2`}>
        <Boxes className="w-4 h-4 text-indigo-500" /> {tr("operations_inventory", "Operations & inventory")}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
        <div>
          <p className={`${ty.labelUpper} inline-flex items-center gap-1`}>
            Low stock SKUs <DashboardTooltip label="Products at or below safety stock threshold." />
          </p>
          <p className={ty.value2xlLight}>{operations.lowStockCount}</p>
        </div>
        <div>
          <p className={`${ty.labelUpper} inline-flex items-center gap-1`}>
            Open purchase orders <DashboardTooltip label="Draft or sent purchase orders pending completion." />
          </p>
          <p className={ty.value2xlLight}>{operations.openPurchaseOrders}</p>
        </div>
        <div>
          <p className={`${ty.labelUpper} inline-flex items-center gap-1`}>
            Open tasks <DashboardTooltip label="Tasks not yet completed." />
          </p>
          <p className={ty.value2xlLight}>{operations.openTasks}</p>
        </div>
        <div>
          <p className={`${ty.labelUpper} inline-flex items-center gap-1`}>
            Blocked tasks <DashboardTooltip label="Tasks currently stalled by dependencies." />
          </p>
          <p className={ty.value2xlLight}>{operations.blockedTasks}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {operations.recentInventoryMovements.slice(0, 3).map((movement) => (
          <p key={movement.id} className={`${ty.helperXs} inline-flex items-center gap-1`}>
            <AlertOctagon className="w-3 h-3" /> {movement.productName}: {movement.quantity > 0 ? "+" : ""}
            {movement.quantity} ({movement.type})
          </p>
        ))}
      </div>
    </Card>
  );
}
