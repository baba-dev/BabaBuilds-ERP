 "use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { refreshCashForecast } from "../_components/api";
import type { CashFlowScenarioTag } from "../_components/types";

export default function CashFlowOutflowsPage() {
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshCashForecast({ horizonType: "WEEKLY_13", scenarioTag });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh forecast");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioTag]);

  const totals = useMemo(() => ({ projected: 0, actual: 0 }), []);

  return (
    <DashboardPageShell
      title="Cash Flow · Outflows"
      description="Upcoming commitments and expected spend by week."
      animated={false}
      secondaryActions={<CashFlowNav />}
      pageActions={
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value={scenarioTag}
            onChange={(e) => setScenarioTag(e.target.value as CashFlowScenarioTag)}
          >
            <option value="BASE">BASE</option>
            <option value="BEST_CASE">BEST_CASE</option>
            <option value="WORST_CASE">WORST_CASE</option>
          </select>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 dark:text-zinc-400">Projected outflows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{totals.projected}</div>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 dark:text-zinc-400">Actual outflows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{totals.actual}</div>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 dark:text-zinc-400">Status</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <Badge variant="secondary">Loading</Badge> : error ? <Badge variant="destructive">Error</Badge> : <Badge variant="secondary">Ready</Badge>}
            </CardContent>
          </Card>
        </div>

        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : <p className="text-sm text-zinc-500">Outflow drilldowns will populate once period+line-item snapshot endpoints are added.</p>}
      </div>
    </DashboardPageShell>
  );
}
 
