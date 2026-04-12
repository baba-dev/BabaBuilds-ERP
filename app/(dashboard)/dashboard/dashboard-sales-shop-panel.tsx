import { ShoppingBag, FileCheck2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";

export function DashboardSalesAndShopPanel({
  salesAndShop,
  fCurrency,
}: {
  salesAndShop: DashboardData["salesAndShop"];
  fCurrency: (value: number) => string;
}) {
  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card className="p-4 border-zinc-200 dark:border-zinc-800">
        <p className="text-sm font-semibold inline-flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-indigo-500" /> Proposal funnel <DashboardTooltip label="Shows movement from draft proposals to invoiced deals." /></p>
        <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
          {Object.entries(salesAndShop.proposalFunnel).map(([stage, value]) => (
            <div key={stage} className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-2">
              <p className="uppercase text-[10px] tracking-wider text-zinc-500">{stage}</p>
              <p className="font-bold text-lg">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-3">Accepted awaiting invoice: <strong>{salesAndShop.acceptedAwaitingInvoicing}</strong></p>
      </Card>

      <Card className="p-4 border-zinc-200 dark:border-zinc-800">
        <p className="text-sm font-semibold inline-flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-indigo-500" /> Public shop & service orders <DashboardTooltip label="Conversion measures paid orders against pending/failed orders." /></p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant={salesAndShop.shopEnabled ? "default" : "secondary"}>{salesAndShop.shopEnabled ? "Shop live" : "Shop disabled"}</Badge>
          <Badge variant="secondary">Paid {salesAndShop.publicShopOrders.paid}</Badge>
          <Badge variant="secondary">Pending {salesAndShop.publicShopOrders.pending}</Badge>
          <Badge variant="secondary">Failed {salesAndShop.publicShopOrders.failed}</Badge>
        </div>
        <p className="text-sm mt-3">Conversion health: <strong>{salesAndShop.serviceOrderConversion}%</strong></p>
        <div className="mt-3 space-y-2">
          {salesAndShop.topServices.slice(0, 3).map((service) => (
            <div key={service.serviceName} className="flex justify-between text-sm">
              <span>{service.serviceName} · {service.orderCount} orders</span>
              <span className="font-semibold">{fCurrency(service.revenue)}</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
