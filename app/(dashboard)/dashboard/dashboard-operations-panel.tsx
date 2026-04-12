import { Boxes, AlertOctagon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DashboardData } from "./types";

export function DashboardOperationsPanel({ operations }: { operations: DashboardData["operations"] }) {
  if (!operations.hasOperationalData) return null;

  return (
    <Card className="p-4 border-zinc-200 dark:border-zinc-800">
      <p className="text-sm font-semibold inline-flex items-center gap-2"><Boxes className="w-4 h-4 text-indigo-500" /> Operations & inventory</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
        <div><p className="text-zinc-500 text-xs">Low stock SKUs</p><p className="font-bold text-lg">{operations.lowStockCount}</p></div>
        <div><p className="text-zinc-500 text-xs">Open purchase orders</p><p className="font-bold text-lg">{operations.openPurchaseOrders}</p></div>
        <div><p className="text-zinc-500 text-xs">Open tasks</p><p className="font-bold text-lg">{operations.openTasks}</p></div>
        <div><p className="text-zinc-500 text-xs">Blocked tasks</p><p className="font-bold text-lg">{operations.blockedTasks}</p></div>
      </div>
      <div className="mt-3 space-y-1">
        {operations.recentInventoryMovements.slice(0, 3).map((movement) => (
          <p key={movement.id} className="text-xs text-zinc-600 inline-flex items-center gap-1"><AlertOctagon className="w-3 h-3" /> {movement.productName}: {movement.quantity > 0 ? "+" : ""}{movement.quantity} ({movement.type})</p>
        ))}
      </div>
    </Card>
  );
}
