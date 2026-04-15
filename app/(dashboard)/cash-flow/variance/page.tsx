"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AreaChart, BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchLatestSnapshot, refreshCashForecast } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotListItem } from "../_components/types";

export default function CashFlowVariancePage() {
  const { fCurrency } = useFormat();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotListItem | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchLatestSnapshot({ horizonType, scenarioTag });
      setSnapshot(s);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load variance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonType, scenarioTag]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCashForecast({ horizonType, scenarioTag });
      await load();
      toast.success("Forecast refreshed");
    } catch (e) {
      console.error(e);
      toast.error("Failed to refresh forecast");
    } finally {
      setRefreshing(false);
    }
  };

  const summary = useMemo(() => {
    if (!snapshot) return null;
    return {
      generatedAt: format(new Date(snapshot.generatedAt), "dd MMM yyyy, HH:mm"),
      opening: fCurrency(Number(snapshot.openingCash)),
      closing: fCurrency(Number(snapshot.closingCash)),
      inflows: fCurrency(Number(snapshot.totalProjectedInflows)),
      outflows: fCurrency(Number(snapshot.totalProjectedOutflows)),
    };
  }, [snapshot, fCurrency]);

  return (
    <DashboardPageShell
      title="Variance"
      description="Compare forecast vs actual to build trust and improve accuracy over time."
      icon={<BarChart3 className="h-5 w-5 text-indigo-500" />}
      secondaryActions={<CashFlowNav />}
      primaryAction={
        <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      }
      animated={false}
    >
      <div className="space-y-6">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Latest snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : !snapshot || !summary ? (
              <div className="text-sm text-zinc-500">No snapshot found yet. Click Refresh to generate one.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">Generated</div>
                  <div className="font-semibold">{summary.generatedAt}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">Opening</div>
                  <div className="font-semibold">{summary.opening}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">Closing</div>
                  <div className="font-semibold">{summary.closing}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">Projected inflows</div>
                  <div className="font-semibold">{summary.inflows}</div>
                </div>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">Projected outflows</div>
                  <div className="font-semibold">{summary.outflows}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="coming_soon">
          <TabsList variant="line" className="gap-2">
            <TabsTrigger value="coming_soon" className="gap-2">
              <AreaChart className="h-4 w-4" />
              Forecast vs Actual (coming soon)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="coming_soon">
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="py-6 text-sm text-zinc-600 dark:text-zinc-400">
                v1 stores snapshots; v2 will add period-level backtesting to compute variance and highlight forecast misses by source.\n              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardPageShell>
  );
}

