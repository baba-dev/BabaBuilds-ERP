"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AreaChart, ArrowRight, Bell, TrendingDown, TrendingUp, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useFormat } from "@/hooks/use-format";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchCashFlowAlerts, fetchCashFlowSnapshotWithPeriods, refreshCashForecast } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotDetail } from "../_components/types";
import { buildCashFlowContextQuery, readCashFlowContextFromUrl, writeCashFlowContextToUrl } from "../_components/context";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowInsightCard } from "../_components/primitives/insight-card";
import { CashFlowMetricCard } from "../_components/primitives/metric-card";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";
import { clamp01, deriveCrunchSignal, getStaleStatus, toneForRiskLevel, topDrivers } from "../_components/primitives/utils";

export default function CashFlowOverviewPage() {
  const { fCurrency } = useFormat();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(() => readCashFlowContextFromUrl().horizonType);
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>(() => readCashFlowContextFromUrl().scenarioTag);
  const [snapshot, setSnapshot] = useState<SnapshotDetail | null>(null);
  const [alerts, setAlerts] = useState<Array<{ severity: "info" | "warning" | "critical"; title: string; body: string }>>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const next = readCashFlowContextFromUrl();
    setHorizonType(next.horizonType);
    setScenarioTag(next.scenarioTag);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [snap, a] = await Promise.all([
        fetchCashFlowSnapshotWithPeriods({ horizonType, scenarioTag }),
        fetchCashFlowAlerts({ horizonType, scenarioTag, limit: 25 }),
      ]);
      setSnapshot(snap);
      setAlerts(a.alerts ?? []);
    } catch (e) {
      console.error(e);
      setSnapshot(null);
      setAlerts([]);
      setError(e instanceof Error ? e.message : "Failed to load cash flow snapshot");
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
      confidence: snapshot.confidenceScore == null ? null : Math.round(snapshot.confidenceScore * 100),
    };
  }, [snapshot, fCurrency]);

  const stale = useMemo(() => getStaleStatus(snapshot?.generatedAt ?? null, 24), [snapshot?.generatedAt]);
  const crunch = useMemo(() => deriveCrunchSignal(snapshot), [snapshot]);

  const inflowDrivers = useMemo(() => {
    if (!snapshot) return [];
    return topDrivers(snapshot.lineItems.filter((i) => i.direction === "INFLOW"), 5);
  }, [snapshot]);

  const outflowDrivers = useMemo(() => {
    if (!snapshot) return [];
    return topDrivers(snapshot.lineItems.filter((i) => i.direction === "OUTFLOW"), 5);
  }, [snapshot]);

  const q = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag }), [horizonType, scenarioTag]);

  const criticalCount = useMemo(() => alerts.filter((a) => a.severity === "critical").length, [alerts]);
  const warningCount = useMemo(() => alerts.filter((a) => a.severity === "warning").length, [alerts]);

  const trajectory = useMemo(() => {
    if (!snapshot?.periods?.length) return null;
    const points = snapshot.periods.map((p) => ({
      id: p.id,
      bucketLabel: p.bucketLabel,
      closing: Number(p.closingCash ?? 0),
      riskLevel: p.riskLevel,
    }));
    const min = Math.min(...points.map((p) => p.closing));
    const max = Math.max(...points.map((p) => p.closing));
    const minPoint = points.reduce((acc, p) => (p.closing < acc.closing ? p : acc), points[0]!);
    const range = max - min || 1;
    return { points, min, max, range, minPoint };
  }, [snapshot?.periods]);

  return (
    <DashboardPageShell
      title="Cash Flow Command Center"
      description="Runway, crunch windows, drivers, and actions — backed by traceable snapshots."
      icon={<AreaChart className="h-5 w-5 text-indigo-500" />}
      secondaryActions={<CashFlowNav />}
      animated={false}
    >
      <div className="space-y-6">
        <CashFlowActionBar
          context={{ horizonType, scenarioTag }}
          onChange={(next) => {
            setHorizonType(next.horizonType);
            setScenarioTag(next.scenarioTag);
            writeCashFlowContextToUrl(next);
          }}
          generatedAtLabel={summary?.generatedAt ?? null}
          loading={loading}
          refreshing={refreshing}
          stale={stale.isStale}
          onRefresh={handleRefresh}
          extra={
            <Button variant="outline" size="sm" className="h-9 gap-2" asChild>
              <Link href={`/cash-flow/alerts?${q}`}>
                <Bell className="h-4 w-4" />
                Alerts
                {(criticalCount + warningCount) > 0 ? (
                  <span className="ml-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-700 dark:text-amber-300">
                    {criticalCount + warningCount}
                  </span>
                ) : null}
              </Link>
            </Button>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[112px] rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : !snapshot || !summary ? (
          <CashFlowNoSnapshotState onGenerate={handleRefresh} />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2 rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black tracking-tight">Trajectory</CardTitle>
                </CardHeader>
                <CardContent>
                  {!trajectory ? (
                    <p className="text-sm text-zinc-500">No periods available yet.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-zinc-500">
                            Min: {fCurrency(trajectory.minPoint.closing)} · {trajectory.minPoint.bucketLabel}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              trajectory.minPoint.riskLevel === "CRITICAL"
                                ? "border-rose-200 text-rose-700 dark:border-rose-900/50 dark:text-rose-300"
                                : trajectory.minPoint.riskLevel === "HIGH"
                                  ? "border-amber-200 text-amber-700 dark:border-amber-900/50 dark:text-amber-300"
                                  : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
                            }
                          >
                            {trajectory.minPoint.riskLevel}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Hover a period to read values. Click to open the period in Outflows.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {trajectory.points.slice(0, 10).map((p) => {
                          const pct = clamp01(((p.closing - trajectory.min) / trajectory.range) * 100);
                          const tone = toneForRiskLevel(p.riskLevel);
                          const barClass =
                            tone === "danger"
                              ? "bg-rose-500"
                              : tone === "warning"
                                ? "bg-amber-500"
                                : "bg-indigo-500";
                          return (
                            <Link
                              key={p.id}
                              href={`/cash-flow/outflows?${q}&periodId=${encodeURIComponent(p.id)}`}
                              className="group rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 px-3 py-2 hover:bg-white/60 dark:hover:bg-zinc-900/30 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 truncate">
                                    {p.bucketLabel}
                                  </div>
                                  <div className="mt-1 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                                    {fCurrency(p.closing)}
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-[11px] shrink-0">
                                  {p.riskLevel}
                                </Badge>
                              </div>
                              <div className="mt-2">
                                <Progress value={pct} className="h-1.5 bg-zinc-200/60 dark:bg-zinc-800/60" />
                                <div className={`-mt-1.5 h-1.5 rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black tracking-tight">Freshness</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Badge variant={stale.isStale ? "outline" : "secondary"} className={stale.isStale ? "border-amber-200 text-amber-700 dark:border-amber-900/50 dark:text-amber-300" : undefined}>
                    {stale.isStale ? "Stale snapshot" : "Fresh snapshot"}
                  </Badge>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Generated {summary.generatedAt}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Refresh after invoice, retainer, or PO changes to keep decisions reliable.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <CashFlowMetricCard
                label="Opening cash"
                value={summary.opening}
                subtext="Starting cash position"
              />
              <CashFlowMetricCard
                label="Projected inflows"
                value={summary.inflows}
                subtext="Invoices + retainers"
                indicator={<TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                tone="positive"
              />
              <CashFlowMetricCard
                label="Projected outflows"
                value={summary.outflows}
                subtext="Commitments + spend"
                indicator={<TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                tone="warning"
              />
              <CashFlowMetricCard
                label="Closing cash"
                value={summary.closing}
                subtext={crunch ? `Worst period: ${crunch.bucketLabel}` : "End of horizon estimate"}
                tone={crunch?.tone ?? "default"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <CashFlowInsightCard
                title="Runway & crunch windows"
                icon={<Wand2 className="h-4 w-4" />}
                tone={crunch?.tone ?? "default"}
                description={
                  crunch
                    ? `Lowest projected closing cash occurs in ${crunch.bucketLabel}. This is the best window to review collections risk and commitments timing.`
                    : "No crunch window detected yet for this snapshot."
                }
                ctas={[
                  { label: "Review commitments", href: `/cash-flow/outflows?${q}`, variant: "default" },
                  { label: "Review receivables", href: `/cash-flow/inflows?${q}`, variant: "outline" },
                ]}
              />

              <CashFlowInsightCard
                title="Forecast confidence"
                tone={summary.confidence != null && summary.confidence >= 80 ? "positive" : "warning"}
                description={
                  summary.confidence == null
                    ? "No confidence score available yet. Refresh to generate the latest snapshot."
                    : `${summary.confidence}% confidence. Use variance and drivers to validate assumptions over time.`
                }
                ctas={[
                  { label: "Open variance", href: `/cash-flow/variance?${q}`, variant: "outline" },
                  { label: "Tune assumptions", href: `/cash-flow/assumptions?${q}`, variant: "outline" },
                ]}
              />

              <CashFlowInsightCard
                title="Alerts preview"
                tone={criticalCount > 0 ? "danger" : warningCount > 0 ? "warning" : "default"}
                description={
                  alerts.length === 0
                    ? "No alerts for this snapshot selection."
                    : `${criticalCount} critical, ${warningCount} warning signals derived from period risk levels.`
                }
                ctas={[{ label: "View alerts", href: `/cash-flow/alerts?${q}`, variant: "outline" }]}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black tracking-tight flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Top inflow drivers
                    </span>
                    <Button size="sm" variant="ghost" className="h-8 text-zinc-500" asChild>
                      <Link href={`/cash-flow/inflows?${q}`}>View all</Link>
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {inflowDrivers.length === 0 ? (
                    <p className="text-sm text-zinc-500">No inflow drivers found for this snapshot.</p>
                  ) : (
                    inflowDrivers.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2">
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
                  <CardTitle className="text-sm font-black tracking-tight flex items-center justify-between">
                    <span className="inline-flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      Top outflow drivers
                    </span>
                    <Button size="sm" variant="ghost" className="h-8 text-zinc-500" asChild>
                      <Link href={`/cash-flow/outflows?${q}`}>View all</Link>
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {outflowDrivers.length === 0 ? (
                    <p className="text-sm text-zinc-500">No outflow drivers found for this snapshot.</p>
                  ) : (
                    outflowDrivers.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2">
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
            </div>

            <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black tracking-tight">Next actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Button size="sm" asChild className="gap-2">
                  <Link href={`/cash-flow/inflows?${q}`}>
                    Review receivables <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild className="gap-2">
                  <Link href={`/cash-flow/outflows?${q}`}>
                    Review commitments <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild className="gap-2">
                  <Link href={`/cash-flow/scenarios?${q}`}>
                    Compare scenarios <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" asChild className="gap-2 text-zinc-500">
                  <Link href={`/cash-flow/assumptions?${q}`}>Tune assumptions</Link>
                </Button>
                {stale.isStale ? (
                  <Badge variant="outline" className="border-amber-200 text-amber-700 dark:border-amber-900/50 dark:text-amber-300">
                    Snapshot may be stale — refresh recommended
                  </Badge>
                ) : null}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardPageShell>
  );
}

