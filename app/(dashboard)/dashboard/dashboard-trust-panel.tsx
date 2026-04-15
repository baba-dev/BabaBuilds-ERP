"use client";

import { motion } from "framer-motion";
import { 
  ShieldAlert, 
  ShieldCheck, 
  ScanSearch, 
  FileWarning, 
  AlertTriangle, 
  ReceiptText 
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";
import { cn } from "@/lib/utils";
import { dashboardTypography as ty } from "./dashboard-typography";

export function DashboardTrustPanel({ trust }: { trust: DashboardData["trust"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };

  const statusMap: Record<string, { label: string; icon: any; color: string; bg: string; border: string; glow: string }> = {
    PASSED: { 
      label: tr("status_passed", "Systems Healthy"), 
      icon: ShieldCheck, 
      color: "text-emerald-500", 
      bg: "bg-emerald-500/10", 
      border: "border-emerald-500/20",
      glow: "shadow-emerald-500/10"
    },
    COMPLETED: { 
      label: tr("status_completed", "Audit Complete"), 
      icon: ShieldCheck, 
      color: "text-emerald-500", 
      bg: "bg-emerald-500/10", 
      border: "border-emerald-500/20",
      glow: "shadow-emerald-500/10"
    },
    FAILED: { 
      label: tr("status_failed", "Action Required"), 
      icon: ShieldAlert, 
      color: "text-rose-500", 
      bg: "bg-rose-500/10", 
      border: "border-rose-500/20",
      glow: "shadow-rose-500/10"
    },
    NOT_RUN: { 
      label: tr("status_not_run", "Initial Scan Pending"), 
      icon: ScanSearch, 
      color: "text-amber-500", 
      bg: "bg-amber-500/10", 
      border: "border-amber-500/20",
      glow: "shadow-amber-500/10"
    },
  };

  const status = statusMap[trust.integrityStatus] || statusMap.NOT_RUN;

  const metrics = [
    { label: tr("violation_reports", "Violation reports"), value: trust.violationCount, icon: FileWarning, tone: trust.violationCount > 0 ? "warning" : "healthy", help: tr("violation_reports_help", "Detected accounting rule breaks requiring review.") },
    { label: tr("critical_violations", "Critical violations"), value: trust.criticalViolations, icon: AlertTriangle, tone: trust.criticalViolations > 0 ? "critical" : "healthy", help: tr("critical_violations_help", "Severe integrity issues that block automated reconciliation.") },
    { label: tr("active_tax_overrides", "Tax overrides"), value: trust.taxOverrideCount, icon: ReceiptText, tone: trust.taxOverrideCount > 0 ? "info" : "healthy", help: tr("tax_overrides_help", "Manual adjustments to calculated tax rates.") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
    >
      <Card className="p-5 border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden relative">
        <div className="flex flex-col md:flex-row md:items-center gap-6 relative z-10">
          
          {/* Hero Status Section */}
          <div className={cn(
            "flex items-center gap-4 p-4 rounded-2xl border flex-1 transition-all duration-500",
            status.bg, status.border, status.glow, "shadow-lg"
          )}>
            <div className={cn("p-2.5 rounded-xl bg-white dark:bg-zinc-900 shadow-sm transition-transform duration-500 hover:scale-110")}>
              <status.icon className={cn("w-6 h-6", status.color)} />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold tracking-wider uppercase text-zinc-500 leading-none">
                {tr("integrity_status", "Integrity status")}
              </p>
              <h4 className={cn(ty.sectionTitle, status.color)}>
                {status.label}
              </h4>
            </div>
          </div>

          {/* Metrics Grid (Signal Tiles) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-[1.5]">
            {metrics.map((metric, idx) => {
              const colors = {
                critical: "text-rose-500 bg-rose-500/10 border-rose-500/20",
                warning: "text-amber-500 bg-amber-500/10 border-amber-500/20",
                info: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
                healthy: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
              }[metric.tone];

              return (
                <div key={metric.label} className={cn(
                  "p-3 rounded-xl border bg-zinc-50/50 dark:bg-zinc-900/50 transition-all duration-300 group hover:bg-white dark:hover:bg-zinc-800",
                  metric.value > 0 ? colors : "border-zinc-100 dark:border-zinc-800 text-zinc-400"
                )}>
                  <div className="flex items-center justify-between mb-1.5">
                    <metric.icon className="w-3.5 h-3.5 opacity-70" />
                    <DashboardTooltip label={metric.help} />
                  </div>
                  <div className="space-y-0.5">
                    <p className={ty.value2xlLight}>{metric.value}</p>
                    <p className={`${ty.labelUpper} truncate opacity-80`}>{metric.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subtle Background Pattern */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-[60px] rounded-full -mr-16 -mt-16" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-500/5 blur-[40px] rounded-full -ml-12 -mb-12" />
      </Card>
    </motion.div>
  );
}
