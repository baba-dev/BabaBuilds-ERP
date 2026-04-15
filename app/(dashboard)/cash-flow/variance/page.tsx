"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { BarChart3, ChevronRight, RefreshCw, Scale } from "lucide-react";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchLatestSnapshot, refreshCashForecast, fetchVariance } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotListItem, VarianceResponse } from "../_components/types";
import { buildCashFlowContextQuery, useCashFlowContextFromUrl, updateCashFlowContextInUrl } from "../_components/context";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowHelp } from "../_components/primitives/help";
import { CashFlowMetricCard } from "../_components/primitives/metric-card";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";
import { getStaleStatus, toneForVariance } from "../_components/primitives/utils";

export default function CashFlowVariancePage() {
  const { fCurrency } = useFormat();
  const urlContext = useCashFlowContextFromUrl();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(urlContext.horizonType);
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>(urlContext.scenarioTag);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotListItem | null>(null);
  const [variance, setVariance] = useState<VarianceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHorizonType(urlContext.horizonType);
    setScenarioTag(urlContext.scenarioTag);
  }, [urlContext.horizonType, urlContext.scenarioTag]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchLatestSnapshot({ horizonType, scenarioTag });
      setSnapshot(s);
      const v = await fetchVariance({ horizonType, scenarioTag });
      setVariance(v);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load variance data");
      setVariance(null);
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

  const stale = useMemo(() => getStaleStatus(snapshot?.generatedAt ?? null, 24), [snapshot?.generatedAt]);
  const q = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag }), [horizonType, scenarioTag]);

  return (
    <DashboardPageShell
      title="Variance"
      description="Build trust by measuring forecast vs actual, then tune assumptions with evidence."
      icon={<BarChart3 className="h-5 w-5 text-indigo-500" />}
      secondaryActions={<CashFlowNav />}
      animated={false}
    >
      <div className="space-y-6">
        <CashFlowActionBar
          context={{ horizonType, scenarioTag }}
          onChange={(next) => {
            updateCashFlowContextInUrl(next);
            setHorizonType(next.horizonType);
            setScenarioTag(next.scenarioTag);
          }}
          generatedAtLabel={summary?.generatedAt ?? null}
          loading={loading}
          refreshing={refreshing}
          stale={stale.isStale}
          onRefresh={handleRefresh}
          extra={
            <Button variant="outline" size="sm" className="h-9 gap-2" asChild>
              <Link href={`/cash-flow/assumptions?${q}`}>
                Tune assumptions <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {error ? (
          <CashFlowErrorState description={error} onRetry={() => void load()} />
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[112px] rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : !snapshot || !summary ? (
          <CashFlowNoSnapshotState onGenerate={handleRefresh} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <CashFlowMetricCard label="Opening" value={summary.opening} subtext="Start of horizon" />
              <CashFlowMetricCard label="Closing" value={summary.closing} subtext="End of horizon" />
              <CashFlowMetricCard label="Projected inflows" value={summary.inflows} subtext="Model output" tone="positive" />
              <CashFlowMetricCard label="Projected outflows" value={summary.outflows} subtext="Model output" tone="warning" />
            </div>

            <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black tracking-tight flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <Scale className="h-4 w-4 text-indigo-500" />
                    Forecast vs actual (by period)
                  </span>
                  <CashFlowHelp label="Variance">
                    Variance is actual net cash minus projected net cash for the same period. Positive variance means you performed better than forecast.
                  </CashFlowHelp>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!variance ? (
                  <p className="text-sm text-zinc-500">No variance data yet. Refresh to generate a snapshot.</p>
                ) : variance.periods.length === 0 ? (
                  <p className="text-sm text-zinc-500">No periods available for variance comparison.</p>
                ) : (
                  variance.periods.map((p) => {
                    const projectedNet = Number(p.projectedInflows) - Number(p.projectedOutflows);
                    const actualNet = Number(p.actualInflows) - Number(p.actualOutflows);
                    const varianceNet = Number(p.varianceNet);
                    const tone = toneForVariance(varianceNet);
                    const isOpen = Boolean(open[p.id]);
                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-900/30 px-4 py-3"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setOpen((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {p.bucketLabel}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={
                                    tone === "positive"
                                      ? "border-emerald-200 text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-300"
                                      : tone === "danger"
                                        ? "border-rose-200 text-rose-700 dark:border-rose-900/40 dark:text-rose-300"
                                        : "text-zinc-500"
                                  }
                                >
                                  {tone === "positive" ? "Favorable" : tone === "danger" ? "Unfavorable" : "Neutral"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                Projected net {fCurrency(projectedNet)} · Actual net {fCurrency(actualNet)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p
                                className={
                                  tone === "positive"
                                    ? "text-sm font-black text-emerald-700 dark:text-emerald-300 tabular-nums"
                                    : tone === "danger"
                                      ? "text-sm font-black text-rose-700 dark:text-rose-300 tabular-nums"
                                      : "text-sm font-black text-zinc-900 dark:text-zinc-100 tabular-nums"
                                }
                              >
                                {fCurrency(varianceNet)}
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">variance</p>
                            </div>
                          </div>
                        </button>

                        {isOpen ? (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-zinc-200/40 dark:border-zinc-800/50 pt-3">
                            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-3">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Projected</div>
                              <div className="mt-1 text-sm font-semibold tabular-nums">{fCurrency(projectedNet)}</div>
                            </div>
                            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-3">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Actual</div>
                              <div className="mt-1 text-sm font-semibold tabular-nums">{fCurrency(actualNet)}</div>
                            </div>
                            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-3">
                              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Net variance</div>
                              <div className="mt-1 text-sm font-semibold tabular-nums">{fCurrency(varianceNet)}</div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {stale.isStale ? (
              <div className="rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Snapshot may be stale</p>
                    <p className="mt-1 text-xs text-amber-800/70 dark:text-amber-200/70">
                      Refresh to recompute variance after your latest invoice, retainer, or PO changes.
                    </p>
                  </div>
                  <Button size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
                    <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                    Refresh
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </DashboardPageShell>
  );
}

