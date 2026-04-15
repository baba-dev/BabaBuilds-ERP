"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ReceiptText, TrendingDown, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/hooks/use-format";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchCashFlowSnapshotWithPeriods, refreshCashForecast } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotDetail } from "../_components/types";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowMetricCard } from "../_components/primitives/metric-card";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";
import { CashFlowLineItemsTable } from "../_components/primitives/line-items-table";
import { CashFlowPeriodBreakdown } from "../_components/primitives/period-breakdown";
import { getStaleStatus, isConfidenceLow, sumLineItems, topDrivers } from "../_components/primitives/utils";
import { buildCashFlowContextQuery } from "../_components/context";

export default function CashFlowOutflowsPage() {
  const { fCurrency } = useFormat();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [snapshot, setSnapshot] = useState<SnapshotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await fetchCashFlowSnapshotWithPeriods({ horizonType, scenarioTag });
      setSnapshot(snap);
    } catch (e) {
      console.error(e);
      setSnapshot(null);
      setError(e instanceof Error ? e.message : "Failed to load outflows");
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
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to refresh forecast");
    } finally {
      setRefreshing(false);
    }
  };

  const stale = useMemo(() => getStaleStatus(snapshot?.generatedAt ?? null, 24), [snapshot?.generatedAt]);
  const q = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag }), [horizonType, scenarioTag]);

  const outflows = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.lineItems.filter((i) => i.direction === "OUTFLOW");
  }, [snapshot]);

  const committed = useMemo(() => outflows.filter((i) => i.classification === "COMMITTED"), [outflows]);
  const expected = useMemo(() => outflows.filter((i) => i.classification === "EXPECTED" || i.classification === "PREDICTED"), [outflows]);
  const actual = useMemo(() => outflows.filter((i) => i.classification === "ACTUAL"), [outflows]);

  const nearTermRisk = useMemo(() => {
    const now = Date.now();
    const soon = now + 1000 * 60 * 60 * 24 * 21;
    const risk = outflows
      .filter((i) => isConfidenceLow(i, 0.6) && new Date(i.expectedDate).getTime() <= soon)
      .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0));
    return risk.slice(0, 5);
  }, [outflows]);

  const largestCommitments = useMemo(() => topDrivers(committed, 5), [committed]);

  return (
    <DashboardPageShell
      title="Cash Flow · Outflows"
      description="Committed, expected, and actual outflows — with timing and risk context."
      icon={<ReceiptText className="h-5 w-5 text-indigo-500" />}
      animated={false}
      secondaryActions={<CashFlowNav />}
    >
      <div className="space-y-6">
        <CashFlowActionBar
          context={{ horizonType, scenarioTag }}
          onChange={(next) => {
            setHorizonType(next.horizonType);
            setScenarioTag(next.scenarioTag);
          }}
          generatedAtLabel={
            snapshot?.generatedAt ? format(new Date(snapshot.generatedAt), "dd MMM yyyy, HH:mm") : null
          }
          loading={loading}
          refreshing={refreshing}
          stale={stale.isStale}
          onRefresh={onRefresh}
        />

        {error ? (
          <CashFlowErrorState description={error} onRetry={() => void load()} />
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <CashFlowMetricCard
                label="Committed"
                value={fCurrency(sumLineItems(committed))}
                subtext="Approved/contractual spend"
                tone="warning"
                indicator={<TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              />
              <CashFlowMetricCard
                label="Expected"
                value={fCurrency(sumLineItems(expected))}
                subtext="Planned and predicted spend"
              />
              <CashFlowMetricCard
                label="Actual"
                value={fCurrency(sumLineItems(actual))}
                subtext="Observed cash movement"
              />
              <CashFlowMetricCard
                label="Near-term risk"
                value={nearTermRisk.length}
                subtext="Low-confidence items (next 3 weeks)"
                tone={nearTermRisk.length ? "warning" : "default"}
                indicator={<TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <CashFlowLineItemsTable
                  items={outflows}
                  directionLabel="Outflow drivers"
                  currencyFormatter={(n) => fCurrency(n)}
                />
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-4 shadow-sm backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                      Largest commitments
                    </p>
                    <Button size="sm" variant="ghost" className="h-8 text-zinc-500" asChild>
                      <Link href={`/cash-flow/outflows?${q}`}>All</Link>
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {largestCommitments.length === 0 ? (
                      <p className="text-sm text-zinc-500">No committed outflows yet.</p>
                    ) : (
                      largestCommitments.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                              {d.title}
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              {d.sourceType} · {new Date(d.expectedDate).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-black tabular-nums">{fCurrency(Number(d.amount ?? 0))}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-4 shadow-sm backdrop-blur-sm">
                  <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                    Timing guidance
                  </p>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                    If a crunch window appears on Overview, use this view to identify which commitments can be reviewed,
                    delayed, or converted into phased spend.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" asChild className="gap-2">
                      <Link href={`/cash-flow/overview?${q}`}>Open command center</Link>
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-zinc-500" asChild>
                      <Link href={`/cash-flow/assumptions?${q}`}>Tune assumptions</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <CashFlowPeriodBreakdown snapshot={snapshot} direction="OUTFLOW" currencyFormatter={(n) => fCurrency(n)} />
          </>
        )}
      </div>
    </DashboardPageShell>
  );
}
 
