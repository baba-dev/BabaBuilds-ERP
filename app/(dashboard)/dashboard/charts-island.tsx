"use client";

import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Filter, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  ArrowUpRight,
  Sparkles
} from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { motion, type Variants } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/charts/ChartCard";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { withChartTokenColors } from "@/components/charts/chart-colors";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "./types";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.21, 0.47, 0.32, 0.98] as const
    }
  },
};


export function ChartsIsland({
  charts,
  fCurrency,
}: {
  charts: DashboardData["charts"];
  fCurrency: (value: number) => string;
}) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: Record<string, any>) =>
    t.has(key as any) ? t(key as any, values) : fallback;

  const isMobile = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      const media = window.matchMedia("(max-width: 768px)");
      const listener = () => onStoreChange();
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false),
    () => false,
  );

  // Proposal Pipeline Logic - Memoized
  const funnelData = useMemo(() => {
    const pipelineOrder = ["draft", "sent", "viewed", "accepted", "invoiced"];
    return pipelineOrder.map(stage => {
      const found = charts.proposalFunnel.find(f => f.stage.toLowerCase() === stage);
      return { 
        name: tr(`funnel_${stage}`, stage.charAt(0).toUpperCase() + stage.slice(1)), 
        value: found?.value ?? 0, 
        key: stage 
      };
    });
  }, [charts.proposalFunnel, tr]);

  const hasProposalData = useMemo(() => funnelData.some(d => d.value > 0), [funnelData]);

  // Order Health Logic - Memoized
  const serviceOrderHealth = useMemo(() => withChartTokenColors(
    charts.serviceOrderHealth.map((row) => ({ name: row.status, value: row.value })),
  ), [charts.serviceOrderHealth]);

  const totalOrders = useMemo(() => serviceOrderHealth.reduce((acc, curr) => acc + curr.value, 0), [serviceOrderHealth]);
  const hasOrderData = totalOrders > 0;

  // Aging Logic - Memoized
  const totalReceivables = useMemo(() => charts.receivablesAging.reduce((acc, curr) => acc + curr.value, 0), [charts.receivablesAging]);

  // SVG Properties - Memoized for Ring Chart
  type RingSegment = { name: string; value: number; color: string; dashArray: number; dashOffset: number; rotationDeg: number };
  const ringSegments = useMemo((): RingSegment[] => {
    if (!hasOrderData) return [];
    let cumulativePercentage = 0;
    const dashArray = 2 * Math.PI * 42;
    
    return serviceOrderHealth
      .map((segment): RingSegment | null => {
        const percentage = (segment.value / totalOrders) * 100;
        if (percentage === 0) return null;
        
        const dashOffset = dashArray - (dashArray * percentage) / 100;
        const rotation = (cumulativePercentage / 100) * dashArray;
        cumulativePercentage += percentage;

        return {
          name: segment.name,
          value: segment.value,
          color: (segment as any).color,
          dashArray,
          dashOffset,
          rotationDeg: (rotation / dashArray) * 360
        };
      })
      .filter((s): s is RingSegment => s !== null);
  }, [serviceOrderHealth, totalOrders, hasOrderData]);

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 xl:grid-cols-2 gap-6"
    >
      {/* Revenue vs Expenses */}
      <motion.div variants={itemVariants}>
        <ChartCard 
          title={tr("chart_revenue_vs_expenses", "Revenue vs expenses")} 
          description={tr("chart_revenue_vs_expenses_desc", "Track margin direction month-over-month.")} 
          hasData={charts.revenueVsExpense.length > 0} 
          noDataLabel={tr("chart_no_trend", "No trend yet")} 
          noDataHint={tr("chart_no_trend_hint", "Create invoices and expenses to unlock trend insights.")} 
          noDataIcon={TrendingUp}
          icon={TrendingUp}
          headerAction={
            charts.revenueVsExpense.length > 0 && (
              <Badge variant="outline" className="bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 py-0.5">
                <ArrowUpRight className="w-3 h-3" />
                {tr("chart_live_badge", "Live Tracking")}
              </Badge>
            )
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.revenueVsExpense} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-4)" stopOpacity={0.08} />
                  <stop offset="95%" stopColor="var(--chart-4)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" opacity={0.4} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10 }} 
                className="text-zinc-400 dark:text-zinc-500 font-medium" 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10 }} 
                className="text-zinc-400 dark:text-zinc-500 font-medium"
                tickFormatter={(v) => v === 0 ? "0" : `${Math.round(v / 1000)}k`}
                hide={charts.revenueVsExpense.every((d: { revenue: number; expenses: number }) => d.revenue === 0 && d.expenses === 0)}
              />
              <Tooltip content={<ChartTooltip formatterValue={fCurrency} />} cursor={{ stroke: 'var(--chart-1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="var(--chart-1)" 
                fill="url(#revenueGlow)" 
                strokeWidth={2} 
                activeDot={{ r: 4, fill: 'var(--chart-1)', strokeWidth: 2, stroke: '#fff' }}
                animationDuration={1500}
              />
              <Area 
                type="monotone" 
                dataKey="expenses" 
                stroke="var(--chart-4)" 
                fill="url(#expenseGlow)" 
                strokeWidth={2} 
                strokeDasharray="4 4" 
                animationDuration={1800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Receivables Aging */}
      <motion.div variants={itemVariants}>
        <ChartCard 
          title={tr("chart_receivables_aging", "Receivables aging")} 
          description={tr("chart_receivables_aging_desc", "Understand what cash is slowing down.")} 
          hasData={charts.receivablesAging.length > 0} 
          noDataLabel={tr("chart_no_receivables", "No receivables")} 
          noDataHint={tr("chart_no_receivables_hint", "Outstanding receivables will appear here.")} 
          noDataIcon={Clock}
          icon={Clock}
          headerAction={
            totalReceivables === 0 ? (
              <Badge variant="outline" className="bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 py-0.5">
                <CheckCircle2 className="w-3 h-3" />
                {tr("chart_healthy_badge", "All Settled")}
              </Badge>
            ) : (
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider tabular-nums">
                {tr("total_due", "Total Due")}: <span className="text-zinc-900 dark:text-zinc-100">{fCurrency(totalReceivables)}</span>
              </div>
            )
          }
        >
          {totalReceivables === 0 ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 px-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center relative">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: [0, 0.4, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-full border-2 border-emerald-500/30"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{tr("aging_healthy_title", "Cash Flow is Pristine")}</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{tr("aging_healthy_desc", "You have no outstanding aged receivables. All invoiced cash is current.")}</p>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col justify-center gap-4 py-2">
              {charts.receivablesAging.map((bucket, i) => {
                const percentage = totalReceivables > 0 ? (bucket.value / totalReceivables) * 100 : 0;
                return (
                  <div key={bucket.bucket} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-medium">
                      <span className="text-zinc-600 dark:text-zinc-400 uppercase tracking-tighter">{bucket.bucket}</span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">{fCurrency(bucket.value)}</span>
                    </div>
                    <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-full overflow-hidden relative">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1, delay: i * 0.1, ease: "circOut" }}
                        className={`absolute inset-y-0 left-0 rounded-full ${
                          i === 0 ? 'bg-indigo-500' : 
                          i === 1 ? 'bg-blue-500' : 
                          i === 2 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </motion.div>

      {/* Proposal Pipeline Funnel */}
      {!isMobile && (
        <motion.div variants={itemVariants}>
          <ChartCard 
            title={tr("chart_proposal_funnel", "Proposal funnel")} 
            description={tr("chart_proposal_funnel_desc", "See where deals stall before invoicing.")} 
            hasData={hasProposalData} 
            noDataLabel={tr("chart_no_proposals", "No proposals")} 
            noDataHint={tr("chart_no_proposals_hint", "Proposal pipeline metrics will render once activity starts.")} 
            noDataIcon={Filter}
            icon={Filter}
            headerAction={
              hasProposalData && (
                <Badge variant="outline" className="bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 gap-1 py-0.5">
                  <Sparkles className="w-3 h-3" />
                  {tr("pipeline_active", "Active Dealflow")}
                </Badge>
              )
            }
          >
            <div className="h-full flex flex-col justify-center gap-3 py-4">
              {funnelData.map((stage, i) => {
                const maxValue = Math.max(...funnelData.map((d: { value: number }) => d.value));
                const width = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
                const opacity = 1 - (i * 0.12);
                
                return (
                  <div key={stage.key} className="relative group">
                    <div className="flex items-center justify-between text-[11px] mb-1 px-1">
                      <span className="text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">{stage.name}</span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-bold tabular-nums">{stage.value}</span>
                    </div>
                    <div className="h-7 w-full bg-zinc-50 dark:bg-zinc-800/30 rounded-lg overflow-hidden flex items-center p-1 border border-zinc-100/50 dark:border-zinc-800/50">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, width)}%` }}
                        transition={{ duration: 1.2, delay: i * 0.1, ease: "anticipate" }}
                        style={{ opacity }}
                        className="h-full bg-indigo-500 rounded-md shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                      />
                    </div>
                    {i < funnelData.length - 1 && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-px h-1.5 bg-zinc-200 dark:bg-zinc-800 z-10" />
                    )}
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </motion.div>
      )}

      {/* Shop Order Health */}
      <motion.div variants={itemVariants}>
        <ChartCard 
          title={tr("chart_shop_order_health", "Shop order health")} 
          description={tr("chart_shop_order_health_desc", "Paid vs pending vs failed storefront orders.")} 
          hasData={hasOrderData} 
          noDataLabel={tr("chart_no_shop_orders", "No shop orders")} 
          noDataHint={tr("chart_no_shop_orders_hint", "Service order health appears after public shop activity.")} 
          noDataIcon={Activity}
          icon={Activity}
          headerAction={
            hasOrderData && (
              <Badge variant="outline" className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 font-bold tabular-nums py-0.5">
                {totalOrders} {tr("total_count", "Total")}
              </Badge>
            )
          }
        >
          <div className="h-full flex flex-col items-center justify-center">
            {/* Minimal Donut/Ring replacement */}
            <div className="relative w-40 h-40 flex items-center justify-center">
               <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-zinc-100 dark:text-zinc-800/60" />
                  
                  {/* Dynamic Segments */}
                  {ringSegments.map((segment, i: number) => {
                    return (
                      <motion.circle
                        key={i}
                        cx="50"
                        cy="50"
                        r="42"
                        stroke={segment.color}
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={segment.dashArray}
                        strokeDashoffset={segment.dashArray}
                        animate={{ strokeDashoffset: segment.dashOffset }}
                        transition={{ duration: 1.5, delay: 0.2, ease: "circOut" }}
                        style={{ 
                          transform: `rotate(${segment.rotationDeg}deg)`,
                          transformOrigin: '50px 50px'
                        } as React.CSSProperties}
                      />
                    );
                  })}
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-zinc-900 dark:text-white tracking-widest">{totalOrders}</span>
                  <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">{tr("orders", "Orders")}</span>
               </div>
            </div>

            <div className="mt-8 grid grid-cols-3 w-full gap-2">
              {serviceOrderHealth.map((segment, i: number) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: segment.color }} />
                    <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-tighter truncate max-w-[60px]">{segment.name}</span>
                  </div>
                  <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums">{segment.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </motion.div>
    </motion.div>
  );
}
