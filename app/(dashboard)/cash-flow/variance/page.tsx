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
import { fetchLatestSnapshot, refreshCashForecast, fetchVariance } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotListItem, VarianceResponse } from "../_components/types";

export default function CashFlowVariancePage() {
  const { fCurrency } = useFormat();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotListItem | null>(null);
  const [variance, setVariance] = useState<VarianceResponse | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const s = await fetchLatestSnapshot({ horizonType, scenarioTag });
      setSnapshot(s);
      const v = await fetchVariance({ horizonType, scenarioTag });
      setVariance(v);
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

        <Tabs defaultValue="variance">
          <TabsList variant="line" className="gap-2">
            <TabsTrigger value="variance" className="gap-2">
              <AreaChart className="h-4 w-4" />
              Forecast vs Actual
            </TabsTrigger>
          </TabsList>
          <TabsContent value="variance">
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardContent className="py-6">
                {!variance ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">No variance data yet. Refresh to generate a snapshot.</p>
                ) : variance.periods.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">No periods available for variance comparison.</p>
                ) : (
                  <div className="space-y-2">
                    {variance.periods.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{p.bucketLabel}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Projected net {fCurrency(Number(p.projectedInflows) - Number(p.projectedOutflows))} · Actual net{" "}
                            {fCurrency(Number(p.actualInflows) - Number(p.actualOutflows))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black">{fCurrency(Number(p.varianceNet))}</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">variance</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardPageShell>
  );
}

