"use client";

import { 
  ShoppingBag, 
  FileCheck2, 
  FileText, 
  Send, 
  Eye, 
  BadgeCheck, 
  ReceiptText, 
  CircleOff, 
  TrendingUp, 
  Store, 
  ArrowRight,
  Wallet,
  ShoppingBasket
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";

export function DashboardSalesAndShopPanel({
  salesAndShop,
  fCurrency,
}: {
  salesAndShop: DashboardData["salesAndShop"];
  fCurrency: (value: number) => string;
}) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    if (!t.has(key as any)) return fallback;
    return t(key as any, values);
  };

  const panelCardClass =
    "group relative overflow-hidden h-full flex flex-col p-6 border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-500";

  const funnelStages = [
    { key: "draft", label: tr("funnel_draft", "Draft"), value: salesAndShop.proposalFunnel.draft, icon: FileText, color: "text-slate-500", bg: "bg-slate-500/10", tooltip: tr("funnel_draft_help", "Drafts you're still working on.") },
    { key: "sent", label: tr("funnel_sent", "Sent"), value: salesAndShop.proposalFunnel.sent, icon: Send, color: "text-blue-500", bg: "bg-blue-500/10", tooltip: tr("funnel_sent_help", "Sent to clients but not yet opened.") },
    { key: "viewed", label: tr("funnel_viewed", "Viewed"), value: salesAndShop.proposalFunnel.viewed, icon: Eye, color: "text-violet-500", bg: "bg-violet-500/10", tooltip: tr("funnel_viewed_help", "Clients have opened and viewed these.") },
    { key: "accepted", label: tr("funnel_accepted", "Accepted"), value: salesAndShop.proposalFunnel.accepted, icon: BadgeCheck, color: "text-emerald-500", bg: "bg-emerald-500/10", tooltip: tr("funnel_accepted_help", "Clients have formally accepted the proposal.") },
    { key: "invoiced", label: tr("funnel_invoiced", "Invoiced"), value: salesAndShop.proposalFunnel.invoiced, icon: ReceiptText, color: "text-teal-600", bg: "bg-teal-600/15", tooltip: tr("funnel_invoiced_help", "The goal: proposals converted into active invoices.") },
    { key: "declined", label: tr("funnel_declined", "Declined"), value: salesAndShop.proposalFunnel.declined, icon: CircleOff, color: "text-rose-500", bg: "bg-rose-500/10", tooltip: tr("funnel_declined_help", "Proposals that did not move forward.") },
  ];
  const renderDeltaBadge = (deltaPct: number | null) => {
    if (deltaPct === null) {
      return (
        <Badge variant="secondary" className="text-[9px] font-semibold text-zinc-600 dark:text-zinc-300">
          {tr("no_baseline_yet", "No baseline yet")}
        </Badge>
      );
    }

    const isPositive = deltaPct >= 0;
    const tone = isPositive
      ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
      : "text-rose-500 bg-rose-50 dark:bg-rose-950/30";

    return (
      <motion.div
        animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className={cn("flex items-center text-[10px] font-bold px-1 rounded", tone)}
      >
        <TrendingUp className={cn("w-2.5 h-2.5 mr-0.5", !isPositive && "rotate-180")} />
        {isPositive ? "+" : ""}{deltaPct}%
      </motion.div>
    );
  };


  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* CARD 1: PROPOSAL FUNNEL */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card className={cn(panelCardClass, "animate-in fade-in slide-in-from-bottom-3")}>
          <div className="absolute -top-16 -right-16 w-40 h-40 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/10 dark:group-hover:bg-indigo-500/20 transition-all duration-700" />
          <div className="relative z-10 flex items-start justify-between gap-4 mb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
                  <FileCheck2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight">
                    {tr("proposal_funnel", "Proposal funnel")}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-tight">
                    {tr("proposal_funnel_subtitle", "Conversion lifecycle of your deals")}
                  </p>
                </div>
              </div>
            </div>
            <DashboardTooltip label={tr("proposal_funnel_help", "Shows movement from draft proposals to invoiced deals.")} />
          </div>

          {/* Pipeline Visualization */}
          <div className="relative flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {funnelStages.map((stage) => {
                const isDeclined = stage.key === "declined";
                const isInvoiced = stage.key === "invoiced";
                
                return (
                  <div key={stage.key} className="group relative">
                    <div className={cn(
                      "relative z-10 p-4 rounded-2xl border transition-all duration-500",
                      "border-zinc-200/70 dark:border-zinc-800/70",
                      "bg-white/80 dark:bg-zinc-950/30 backdrop-blur-sm shadow-sm group-hover:shadow-md",
                      isDeclined ? "opacity-70 group-hover:opacity-100" : "",
                      isInvoiced ? "ring-1 ring-emerald-500/30 dark:ring-emerald-400/20 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40" : ""
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <div className={cn("p-1.5 rounded-lg relative", stage.bg)}>
                          <stage.icon className={cn("w-3.5 h-3.5", stage.color)} />
                          {isInvoiced && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                          )}
                        </div>
                        <DashboardTooltip label={stage.tooltip} />
                      </div>
                      
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <p className={cn(
                            "text-[11px] font-semibold tracking-tight",
                            isDeclined ? "text-zinc-400" : "text-zinc-500"
                          )}>{stage.label}</p>
                          {isInvoiced && (
                            <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-900/50">
                              {tr("goal", "Goal")}
                            </span>
                          )}
                        </div>
                        <p className={cn(
                          "text-2xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-100",
                          isInvoiced ? "text-emerald-700 dark:text-emerald-400" : ""
                        )}>
                          {stage.value}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Connected Visual (Implicit connection by grid) */}
          </div>

          {/* Highlighted Insight Row */}
          {salesAndShop.acceptedAwaitingInvoicing > 0 ? (
            <div className="mt-6 p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between gap-4 group animate-pulse-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center border border-amber-200/70 dark:border-amber-800/60 shadow-sm">
                  <TrendingUp className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200 tracking-tight">
                    {tr("revenue_opportunity", "Revenue Opportunity")}
                  </p>
                  <p className="text-sm text-amber-800/90 dark:text-amber-200/80">
                    <strong>{salesAndShop.acceptedAwaitingInvoicing}</strong> {tr("proposals_ready_to_invoice", "proposals ready for invoicing")}
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-9 px-3 rounded-xl text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-900/40 border border-transparent hover:border-amber-200/70 dark:hover:border-amber-800/60"
              >
                <Link href="/proposals?status=accepted" className="flex items-center gap-2 text-xs font-semibold">
                  {tr("view_ready", "View")}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 pt-5 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
                {tr("funnel_operational", "Funnel is operational and healthy")}
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* CARD 2: PUBLIC SHOP & SERVICE ORDERS */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      >
        <Card className={cn(panelCardClass, "animate-in fade-in slide-in-from-bottom-3 delay-100 fill-mode-both")}>
          <div className="absolute -top-16 -right-16 w-40 h-40 bg-violet-500/5 dark:bg-violet-500/10 rounded-full blur-3xl group-hover:bg-violet-500/10 dark:group-hover:bg-violet-500/20 transition-all duration-700" />
          <div className="relative z-10 flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center border border-violet-100 dark:border-violet-500/20 shadow-sm shrink-0">
                <ShoppingBag className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight">
                  {tr("commerce_pulse", "Commerce pulse")}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-tight">
                  {tr("commerce_pulse_subtitle", "Public shop & service performance")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold tracking-tight",
                  salesAndShop.shopEnabled
                    ? "bg-emerald-50/70 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40"
                    : "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", salesAndShop.shopEnabled ? "bg-emerald-500 animate-pulse" : "bg-zinc-400")} />
                {salesAndShop.shopEnabled ? tr("shop_live", "Shop live") : tr("shop_disabled", "Shop disabled")}
              </div>
              <DashboardTooltip label={tr("shop_status_help", "Indicates if your public commerce shop is reachable by clients.")} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Conversion Hero */}
            <div className="lg:col-span-2 flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/20 dark:to-zinc-950/40 border border-violet-200/60 dark:border-violet-900/40">
              <div className="relative">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle
                    cx="48" cy="48" r="40"
                    stroke="currentColor" strokeWidth="6"
                    fill="transparent"
                    className="text-zinc-100 dark:text-zinc-800"
                  />
                  <motion.circle
                    cx="48" cy="48" r="40"
                    stroke="currentColor" strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={251.2}
                    initial={{ strokeDashoffset: 251.2 }}
                    animate={{ strokeDashoffset: 251.2 - (251.2 * salesAndShop.serviceOrderConversion) / 100 }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
                    className="text-violet-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="text-2xl font-semibold text-violet-700 dark:text-violet-300 tabular-nums">{salesAndShop.serviceOrderConversion}%</span>
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{tr("conversion", "Conversion")}</span>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-violet-900/90 dark:text-violet-200/90 flex items-center gap-2">
                {tr("healthy_funnel", "Healthy funnel")} <DashboardTooltip label={tr("shop_conversion_help", "Conversion measures paid orders against pending/failed orders.")} />
              </p>
            </div>

            {/* Metrics Breakdown */}
            <div className="lg:col-span-3 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShoppingBasket className="w-3 h-3 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{tr("total_orders", "Orders")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{salesAndShop.ordersLast30Days}</p>
                    {renderDeltaBadge(salesAndShop.orderChangeVsPrior30DaysPct)}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{tr("last_30_days", "Last 30 days")}</p>
                </div>
                <div className="p-4 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wallet className="w-3 h-3 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{tr("shop_revenue", "Revenue")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 truncate max-w-[180px]">
                      {fCurrency(salesAndShop.shopRevenueThisMonth)}
                    </p>
                    {renderDeltaBadge(salesAndShop.revenueChangeVsPriorMonthPct)}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{tr("this_month", "This month")}</p>
                </div>
              </div>

              {/* Order States */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    key: "paid",
                    label: tr("paid", "Paid"),
                    value: salesAndShop.publicShopOrders.paid,
                    tone: "text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/15",
                  },
                  {
                    key: "pending",
                    label: tr("pending", "Pending"),
                    value: salesAndShop.publicShopOrders.pending,
                    tone: "text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/15",
                  },
                  {
                    key: "failed",
                    label: tr("failed", "Failed"),
                    value: salesAndShop.publicShopOrders.failed,
                    tone: "text-rose-700 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/15",
                  },
                ].map((s) => (
                  <div key={s.key} className={cn("rounded-2xl border p-4", s.tone)}>
                    <p className="text-xs font-semibold">{s.label}</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1 text-zinc-900 dark:text-zinc-100">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="flex-1 h-10 rounded-2xl border-zinc-200/70 dark:border-zinc-800/70 hover:bg-zinc-50 dark:hover:bg-zinc-900 group transition-all"
            >
              <Link href="/proposals" className="flex items-center justify-center gap-2">
                <FileCheck2 className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm font-semibold">{tr("view_proposals", "Proposals")}</span>
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="flex-1 h-10 rounded-2xl border-zinc-200/70 dark:border-zinc-800/70 hover:bg-zinc-50 dark:hover:bg-zinc-900 group transition-all"
            >
              <Link href="/shop" className="flex items-center justify-center gap-2">
                <Store className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm font-semibold">{tr("view_shop_orders", "Shop orders")}</span>
              </Link>
            </Button>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}
