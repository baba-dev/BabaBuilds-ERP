"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ReceiptText, TrendingUp, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/hooks/use-format";
import { getCashFlowContextFromSearchParams, updateCashFlowContextInUrl } from "../_components/context";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchCashFlowSnapshotWithPeriods, refreshCashForecast } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotDetail } from "../_components/types";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowMetricCard } from "../_components/primitives/metric-card";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";
import { CashFlowLineItemsTable } from "../_components/primitives/line-items-table";
import { getStaleStatus, isConfidenceLow, isLatePayerRisk, rollupByConfidence, sumLineItems, topDrivers } from "../_components/primitives/utils";
import { buildCashFlowContextQuery } from "../_components/context";

export default function CashFlowInflowsPage() {
  const { fCurrency } = useFormat();
  const search = useSearchParams();
  const urlCtx = useMemo(() => getCashFlowContextFromSearchParams(search), [search]);
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(urlCtx.horizonType);
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>(urlCtx.scenarioTag);
  const [snapshot, setSnapshot] = useState<SnapshotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHorizonType(urlCtx.horizonType);
    setScenarioTag(urlCtx.scenarioTag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCtx.horizonType, urlCtx.scenarioTag]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await fetchCashFlowSnapshotWithPeriods({ horizonType, scenarioTag });
      setSnapshot(snap);
    } catch (e) {
      console.error(e);
      setSnapshot(null);
      setError(e instanceof Error ? e.message : "Failed to load inflows");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonType, scenarioTag]);

  const onRefresh = async () => {
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

  const generatedAtLabel = useMemo(() => {
    if (!snapshot?.generatedAt) return null;
    return format(new Date(snapshot.generatedAt), "dd MMM yyyy, HH:mm");
  }, [snapshot?.generatedAt]);

  const stale = useMemo(() => getStaleStatus(snapshot?.generatedAt ?? null, 24), [snapshot?.generatedAt]);

  const inflows = useMemo(() => (snapshot?.lineItems ?? []).filter((i) => i.direction === "INFLOW"), [snapshot]);

  const lowConfidence = useMemo(() => inflows.filter((i) => isConfidenceLow(i, 0.6)), [inflows]);
  const latePayer = useMemo(
    () => inflows.filter((i) => i.sourceType === "INVOICE" && isLatePayerRisk(i, 7)),
    [inflows],
  );
  const confidenceRollup = useMemo(() => rollupByConfidence(inflows), [inflows]);
  const nearTermRisk = useMemo(() => {
    const now = Date.now();
    const horizonMs = 21 * 24 * 60 * 60 * 1000;
    return lowConfidence
      .filter((i) => {
        const t = new Date(i.expectedDate).getTime();
        return Number.isFinite(t) && t >= now - 7 * 24 * 60 * 60 * 1000 && t <= now + horizonMs;
      })
      .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
      .slice(0, 6);
  }, [lowConfidence]);

  const topRiskDrivers = useMemo(() => topDrivers(lowConfidence, 5), [lowConfidence]);

  const q = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag }), [horizonType, scenarioTag]);

  const description = useMemo(() => {
    return "Receivables and retainer-driven inflows — with confidence, timing context, and drilldowns.";
  }, []);

  return (
    <DashboardPageShell
      title="Cash Flow · Inflows"
      description={description}
      icon={<ReceiptText className="h-5 w-5 text-indigo-500" />}
      animated={false}
      secondaryActions={<CashFlowNav />}
    >
      <div className="space-y-6">
        <CashFlowActionBar
          context={{ horizonType, scenarioTag }}
          onChange={(next) => {
            updateCashFlowContextInUrl(next);
            setHorizonType(next.horizonType);
            setScenarioTag(next.scenarioTag);
          }}
          generatedAtLabel={generatedAtLabel}
          loading={loading}
          refreshing={refreshing}
          stale={stale.isStale}
          onRefresh={onRefresh}
          extra={
            <Badge variant="outline" className="text-zinc-500">
              {inflows.length} inflows
            </Badge>
          }
        />

        {error ? (
          <CashFlowErrorState
            description={error}
            onRetry={() => {
              toast.dismiss();
              void load();
            }}
          />
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[112px] rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : !snapshot ? (
          <CashFlowNoSnapshotState onGenerate={onRefresh} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CashFlowMetricCard
                label="Projected inflows"
                value={fCurrency(sumLineItems(inflows))}
                subtext="Total of line items"
                tone="positive"
                indicator={<TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              />
              <CashFlowMetricCard
                label="Low-confidence inflows"
                value={fCurrency(sumLineItems(lowConfidence))}
                subtext={`${lowConfidence.length} drivers under 60%`}
                tone={lowConfidence.length > 0 ? "warning" : "default"}
                indicator={<TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              />
              <CashFlowMetricCard
                label="Late-payer exposure"
                value={fCurrency(sumLineItems(latePayer))}
                subtext={`${latePayer.length} invoices with ≥7d behavior delay`}
                tone={latePayer.length > 0 ? "warning" : "default"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black tracking-tight">Receivables drivers</CardTitle>
                </CardHeader>
                <CardContent>
                  <CashFlowLineItemsTable
                    items={inflows}
                    directionLabel="Inflows"
                    currencyFormatter={(n) => fCurrency(n)}
                  />
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black tracking-tight">Confidence rollup</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">High (≥80%)</div>
                      <div className="mt-1 font-black tabular-nums">{fCurrency(confidenceRollup.high.amount)}</div>
                      <div className="text-[11px] text-zinc-500 tabular-nums">{confidenceRollup.high.count} items</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Medium (60–79%)</div>
                      <div className="mt-1 font-black tabular-nums">{fCurrency(confidenceRollup.medium.amount)}</div>
                      <div className="text-[11px] text-zinc-500 tabular-nums">{confidenceRollup.medium.count} items</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Low (&lt;60%)</div>
                      <div className="mt-1 font-black tabular-nums text-amber-700 dark:text-amber-300">{fCurrency(confidenceRollup.low.amount)}</div>
                      <div className="text-[11px] text-zinc-500 tabular-nums">{confidenceRollup.low.count} items</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 p-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Unknown</div>
                      <div className="mt-1 font-black tabular-nums">{fCurrency(confidenceRollup.unknown.amount)}</div>
                      <div className="text-[11px] text-zinc-500 tabular-nums">{confidenceRollup.unknown.count} items</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black tracking-tight flex items-center justify-between">
                      <span className="inline-flex items-center gap-2">
                        <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        Top risk inflows
                      </span>
                      <Badge variant="outline" className="tabular-nums">
                        {lowConfidence.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {topRiskDrivers.length === 0 ? (
                      <p className="text-sm text-zinc-500">No low-confidence inflows detected.</p>
                    ) : (
                      topRiskDrivers.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {d.title}
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              {d.sourceType} · {d.classification}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-black tabular-nums">{fCurrency(Number(d.amount ?? 0))}</div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                              {d.confidence == null ? "—" : `${Math.round(d.confidence * 100)}%`}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black tracking-tight">Move from insight to action</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" asChild className="gap-2">
                        <a href={`/cash-flow/overview?${q}`}>
                          Open command center <TrendingUp className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild className="gap-2">
                        <a href={`/cash-flow/assumptions?${q}`}>Tune assumptions</a>
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Tip: use “Risk” filter in the table to focus on low-confidence receivables. Every row includes an explanation you can validate.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardPageShell>
  );
}

