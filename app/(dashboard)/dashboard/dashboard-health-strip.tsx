"use client";

import { ShieldCheck, Sparkles, ShieldAlert, Link as LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { DashboardData } from "./types";
import { DashboardTooltip } from "./dashboard-tooltip";

export function DashboardHealthStrip({ health }: { health: DashboardData["health"] }) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };
  return (
    <Card className="p-4 md:p-5 border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">{tr("workspace_setup", "Workspace setup")}</p>
          <p className="text-xl font-bold mt-1">{health.setupCompletion}%</p>
          <Progress value={health.setupCompletion} className="h-2 mt-2" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1">{tr("subscription", "Subscription")} <DashboardTooltip label={tr("subscription_help", "Shows current billing state and plan tier.")} /></p>
          <p className="text-xl font-bold mt-1">{health.subscriptionState}</p>
          <p className="text-xs text-zinc-500">{health.planTier} plan</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1"><LinkIcon className="w-3.5 h-3.5" /> {tr("integration_readiness", "Integration readiness")} <DashboardTooltip label={tr("integration_readiness_help", "Healthy means connected and ready for automation.")} /></p>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="secondary">{tr("healthy", "Healthy")} {health.integrationReadiness.summary.healthy}</Badge>
            <Badge variant="secondary">{tr("partial", "Partial")} {health.integrationReadiness.summary.partial}</Badge>
            <Badge variant="secondary">{tr("missing", "Missing")} {health.integrationReadiness.summary.missing}</Badge>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">{tr("compliance_signals", "Compliance signals")}</p>
          <div className="mt-2 space-y-1.5">
            {health.complianceWarnings.length === 0 ? (
              <p className="text-sm text-emerald-600 flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> No active warnings</p>
            ) : (
              health.complianceWarnings.slice(0, 2).map((warning) => (
                <p key={warning.label} className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1"><ShieldAlert className="w-4 h-4" /> {warning.label}</p>
              ))
            )}
            {health.setupComplete && <p className="text-xs text-zinc-500 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Setup complete</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}
