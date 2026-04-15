"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CashFlowNav } from "../_components/cash-flow-nav";
import type { CashFlowHorizonType, CashFlowScenarioTag, CashFlowAlertDto } from "../_components/types";
import { fetchCashFlowAlerts } from "../_components/api";

export default function CashFlowAlertsPage() {
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [alerts, setAlerts] = useState<CashFlowAlertDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCashFlowAlerts({ horizonType, scenarioTag, limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setAlerts(res.alerts);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load alerts");
        setAlerts([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [horizonType, scenarioTag]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const a of alerts) counts[a.severity as "critical" | "warning" | "info"] += 1;
    return counts;
  }, [alerts]);

  return (
    <DashboardPageShell
      title="Cash Flow Alerts"
      description="Proactive warnings derived from your latest forecast snapshot."
      icon={<ShieldAlert className="h-5 w-5 text-indigo-500" />}
      secondaryActions={<CashFlowNav />}
      animated={false}
    >
      <div className="space-y-6">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-rose-200 text-rose-700 dark:border-rose-900/50 dark:text-rose-300">
              Critical: {severityCounts.critical}
            </Badge>
            <Badge variant="outline" className="border-amber-200 text-amber-700 dark:border-amber-900/50 dark:text-amber-300">
              Warning: {severityCounts.warning}
            </Badge>
            <Badge variant="outline" className="border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              Info: {severityCounts.info}
            </Badge>
            <div className="ml-auto text-xs text-zinc-500">
              Horizon: {horizonType} · Scenario: {scenarioTag}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Horizon</label>
          <select
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value={horizonType}
            onChange={(e) => setHorizonType(e.target.value as CashFlowHorizonType)}
          >
            <option value="DAILY_30">DAILY_30</option>
            <option value="WEEKLY_13">WEEKLY_13</option>
            <option value="MONTHLY_12">MONTHLY_12</option>
          </select>

          <label className="ml-4 text-xs font-bold uppercase tracking-wider text-zinc-500">Scenario</label>
          <select
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value={scenarioTag}
            onChange={(e) => setScenarioTag(e.target.value as CashFlowScenarioTag)}
          >
            <option value="BASE">BASE</option>
            <option value="BEST_CASE">BEST_CASE</option>
            <option value="WORST_CASE">WORST_CASE</option>
          </select>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : error ? (
              <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>
            ) : alerts.length === 0 ? (
              <div className="text-sm text-zinc-500">No alerts for this selection.</div>
            ) : (
              alerts.map((a, idx) => (
                <div
                  key={`${a.type}-${a.periodId ?? "na"}-${idx}`}
                  className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="mt-0.5">
                    <AlertTriangle
                      className={
                        a.severity === "critical"
                          ? "h-4 w-4 text-rose-600"
                          : a.severity === "warning"
                            ? "h-4 w-4 text-amber-600"
                            : "h-4 w-4 text-zinc-500"
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{a.title}</p>
                      <Badge variant="outline">{a.severity}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{a.body}</p>
                    {a.periodStart ? (
                      <p className="mt-2 text-xs text-zinc-500">Period start: {new Date(a.periodStart).toLocaleString()}</p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardPageShell>
  );
}

