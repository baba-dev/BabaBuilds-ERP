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
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };

  const funnelStages = [
    { key: "draft", label: tr("funnel_draft", "Draft"), value: salesAndShop.proposalFunnel.draft, icon: FileText, color: "text-slate-500", bg: "bg-slate-500/10", tooltip: tr("funnel_draft_help", "Drafts you're still working on.") },
    { key: "sent", label: tr("funnel_sent", "Sent"), value: salesAndShop.proposalFunnel.sent, icon: Send, color: "text-blue-500", bg: "bg-blue-500/10", tooltip: tr("funnel_sent_help", "Sent to clients but not yet opened.") },
    { key: "viewed", label: tr("funnel_viewed", "Viewed"), value: salesAndShop.proposalFunnel.viewed, icon: Eye, color: "text-violet-500", bg: "bg-violet-500/10", tooltip: tr("funnel_viewed_help", "Clients have opened and viewed these.") },
    { key: "accepted", label: tr("funnel_accepted", "Accepted"), value: salesAndShop.proposalFunnel.accepted, icon: BadgeCheck, color: "text-emerald-500", bg: "bg-emerald-500/10", tooltip: tr("funnel_accepted_help", "Clients have formally accepted the proposal.") },
    { key: "invoiced", label: tr("funnel_invoiced", "Invoiced"), value: salesAndShop.proposalFunnel.invoiced, icon: ReceiptText, color: "text-teal-600", bg: "bg-teal-600/15", tooltip: tr("funnel_invoiced_help", "The goal: proposals converted into active invoices.") },
    { key: "declined", label: tr("funnel_declined", "Declined"), value: salesAndShop.proposalFunnel.declined, icon: CircleOff, color: "text-rose-500", bg: "bg-rose-500/10", tooltip: tr("funnel_declined_help", "Proposals that did not move forward.") },
  ];

  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* CARD 1: PROPOSAL FUNNEL */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card className="p-5 h-full flex flex-col border-zinc-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <h3 className="text-sm font-bold flex items-center gap-2 text-zinc-800 dark:text-zinc-100 uppercase tracking-tight">
                <FileCheck2 className="w-4 h-4 text-indigo-500" /> 
                {tr("proposal_funnel", "Proposal funnel")}
              </h3>
              <p className="text-[11px] text-zinc-500 leading-none">{tr("proposal_funnel_subtitle", "Conversion lifecycle of your deals")}</p>
            </div>
            <DashboardTooltip label={tr("proposal_funnel_help", "Shows movement from draft proposals to invoiced deals.")} />
          </div>

          {/* Pipeline Visualization */}
          <div className="relative flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {funnelStages.map((stage, idx) => {
                const isDeclined = stage.key === "declined";
                const isInvoiced = stage.key === "invoiced";
                
                return (
                  <div key={stage.key} className="group relative">
                    <div className={cn(
                      "relative z-10 p-3 rounded-xl border transition-all duration-300",
                      "border-zinc-100 dark:border-zinc-800",
                      "bg-white dark:bg-zinc-900 shadow-sm group-hover:shadow-md",
                      isDeclined ? "opacity-70 group-hover:opacity-100" : "",
                      isInvoiced ? "ring-2 ring-emerald-500/40 dark:ring-emerald-400/30 bg-emerald-50/10 dark:bg-emerald-950/20" : ""
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
                            "uppercase text-[9px] font-bold tracking-widest",
                            isDeclined ? "text-zinc-400" : "text-zinc-500"
                          )}>{stage.label}</p>
                          {isInvoiced && (
                            <span className="text-[7px] font-black bg-emerald-500 text-white px-1 rounded-sm tracking-tighter shadow-sm">GOAL</span>
                          )}
                        </div>
                        <p className={cn(
                          "text-xl font-extrabold tracking-tight tabular-nums",
                          isInvoiced ? "text-emerald-600 dark:text-emerald-400" : ""
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
            <div className="mt-6 p-3 rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-100/50 dark:border-orange-900/30 flex items-center justify-between group animate-pulse-subtle">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-orange-800 dark:text-orange-300 uppercase tracking-wider">
                    {tr("revenue_opportunity", "Revenue Opportunity")}
                  </p>
                  <p className="text-xs text-orange-600 dark:text-orange-400/80">
                    <strong>{salesAndShop.acceptedAwaitingInvoicing}</strong> {tr("proposals_ready_to_invoice", "proposals ready for invoicing")}
                  </p>
                </div>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-8 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/50">
                <Link href="/proposals?status=accepted" className="flex items-center gap-1.5 text-[10px] font-bold">
                  {tr("view_ready", "VIEW")} <ArrowRight className="w-3 h-3" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
              <p className="text-[11px] text-zinc-400 italic text-center">
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
        <Card className="p-5 h-full flex flex-col border-zinc-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex justify-between items-start mb-6">
            <div className="space-y-1">
              <h3 className="text-sm font-bold flex items-center gap-2 text-zinc-800 dark:text-zinc-100 uppercase tracking-tight">
                <ShoppingBag className="w-4 h-4 text-indigo-500" /> 
                {tr("commerce_pulse", "Commerce pulse")}
              </h3>
              <p className="text-[11px] text-zinc-500 leading-none">{tr("commerce_pulse_subtitle", "Public shop & service performance")}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider",
                salesAndShop.shopEnabled 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50" 
                  : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800"
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full", salesAndShop.shopEnabled ? "bg-emerald-500 animate-pulse" : "bg-zinc-400")} />
                {salesAndShop.shopEnabled ? tr("shop_live", "Shop live") : tr("shop_disabled", "Shop disabled")}
              </div>
              <DashboardTooltip label={tr("shop_status_help", "Indicates if your public commerce shop is reachable by clients.")} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {/* Conversion Hero */}
            <div className="md:col-span-2 flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-900 border border-indigo-100/50 dark:border-indigo-900/30">
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
                    className="text-indigo-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{salesAndShop.serviceOrderConversion}%</span>
                  <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter mt-0.5">{tr("conversion", "Conversion")}</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] font-medium text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                {tr("healthy_funnel", "Healthy funnel")} <DashboardTooltip label={tr("shop_conversion_help", "Conversion measures paid orders against pending/failed orders.")} />
              </p>
            </div>

            {/* Metrics Breakdown */}
            <div className="md:col-span-3 space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 shadow-tiny">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShoppingBasket className="w-3 h-3 text-zinc-400" />
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{tr("total_orders", "Orders")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold tabular-nums">{salesAndShop.ordersLast30Days}</p>
                    <motion.div 
                      animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="flex items-center text-[10px] text-emerald-500 font-bold bg-emerald-50 dark:bg-emerald-950/30 px-1 rounded"
                    >
                      <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> 12%
                    </motion.div>
                  </div>
                  <p className="text-[9px] text-zinc-400 mt-1">{tr("last_30_days", "Last 30 days")}</p>
                </div>
                <div className="flex-1 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 shadow-tiny">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wallet className="w-3 h-3 text-zinc-400" />
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{tr("shop_revenue", "Revenue")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold tabular-nums truncate max-w-[80px]">{fCurrency(salesAndShop.shopRevenueThisMonth)}</p>
                    <motion.div 
                      animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                      className="flex items-center text-[10px] text-emerald-500 font-bold bg-emerald-50 dark:bg-emerald-950/30 px-1 rounded"
                    >
                      <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> 8%
                    </motion.div>
                  </div>
                  <p className="text-[9px] text-zinc-400 mt-1">{tr("this_month", "This month")}</p>
                </div>
              </div>

              {/* Order States */}
              <div className="flex items-center gap-4 px-1">
                <div className="flex-1 flex flex-col border-r border-zinc-100 dark:border-zinc-800 last:border-0">
                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-500 uppercase">{tr("paid", "Paid")}</span>
                  <span className="text-sm font-bold tabular-nums">{salesAndShop.publicShopOrders.paid}</span>
                </div>
                <div className="flex-1 flex flex-col border-r border-zinc-100 dark:border-zinc-800 last:border-0">
                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-500 uppercase">{tr("pending", "Pending")}</span>
                  <span className="text-sm font-bold tabular-nums">{salesAndShop.publicShopOrders.pending}</span>
                </div>
                <div className="flex-1 flex flex-col">
                  <span className="text-[9px] font-bold text-rose-600 dark:text-rose-500 uppercase">{tr("failed", "Failed")}</span>
                  <span className="text-sm font-bold tabular-nums">{salesAndShop.publicShopOrders.failed}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 flex gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1 h-9 rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 group">
              <Link href="/proposals" className="flex items-center justify-center gap-2">
                <FileCheck2 className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-500 transition-colors" />
                <span className="text-xs font-semibold">{tr("view_proposals", "Proposals")}</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1 h-9 rounded-xl border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 group">
              <Link href="/shop" className="flex items-center justify-center gap-2">
                <Store className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-500 transition-colors" />
                <span className="text-xs font-semibold">{tr("view_shop_orders", "Shop orders")}</span>
              </Link>
            </Button>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}
