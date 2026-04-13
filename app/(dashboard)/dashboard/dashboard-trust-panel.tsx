"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";

export function DashboardTrustPanel({ trust }: { trust: DashboardData["trust"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };
  const healthy = trust.integrityStatus === "PASSED" || trust.integrityStatus === "COMPLETED";

  return (
    <Card className="p-4.5 border-zinc-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/95">
      <p className="text-sm font-semibold inline-flex items-center gap-2">
        {healthy ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <ShieldAlert className="w-4 h-4 text-amber-500" />}
        {tr("trust_audit", "Trust & audit")}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
        <div><p className="text-zinc-500 text-xs inline-flex items-center gap-1">{tr("integrity_status", "Integrity status")} <DashboardTooltip label={tr("integrity_status_help", "Result of latest accounting integrity run.")} /></p><p className="font-semibold text-base mt-1">{trust.integrityStatus}</p></div>
        <div><p className="text-zinc-500 text-xs inline-flex items-center gap-1">{tr("violation_reports", "Violation reports")} <DashboardTooltip label={tr("violation_reports_help", "Detected accounting rule breaks requiring review.")} /></p><p className="font-semibold text-base mt-1">{trust.violationCount}</p></div>
        <div><p className="text-zinc-500 text-xs">{tr("critical_violations", "Critical violations")}</p><p className="font-semibold text-base mt-1">{trust.criticalViolations}</p></div>
        <div><p className="text-zinc-500 text-xs">{tr("active_tax_overrides", "Active tax overrides")}</p><p className="font-semibold text-base mt-1">{trust.taxOverrideCount}</p></div>
      </div>
    </Card>
  );
}
