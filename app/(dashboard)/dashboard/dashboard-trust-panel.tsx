"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";

export function DashboardTrustPanel({ trust }: { trust: DashboardData["trust"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string) => { try { return t(key as any); } catch { return fallback; } };
  const healthy = trust.integrityStatus === "PASSED" || trust.integrityStatus === "COMPLETED";

  return (
    <Card className="p-4 border-zinc-200 dark:border-zinc-800">
      <p className="text-sm font-semibold inline-flex items-center gap-2">
        {healthy ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <ShieldAlert className="w-4 h-4 text-amber-500" />}
        {tr("trust_audit", "Trust & audit")}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
        <div><p className="text-zinc-500 text-xs">Integrity status <DashboardTooltip label="Result of latest accounting integrity run." /></p><p className="font-bold">{trust.integrityStatus}</p></div>
        <div><p className="text-zinc-500 text-xs">Violation reports <DashboardTooltip label="Detected accounting rule breaks requiring review." /></p><p className="font-bold">{trust.violationCount}</p></div>
        <div><p className="text-zinc-500 text-xs">Critical violations</p><p className="font-bold">{trust.criticalViolations}</p></div>
        <div><p className="text-zinc-500 text-xs">Active tax overrides</p><p className="font-bold">{trust.taxOverrideCount}</p></div>
      </div>
    </Card>
  );
}
