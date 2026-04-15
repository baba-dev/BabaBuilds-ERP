"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { RefreshCcw, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { CashFlowNav } from "../_components/cash-flow-nav";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotDetail } from "../_components/types";
import { fetchCashFlowSnapshotWithPeriods, refreshCashForecast } from "../_components/api";
import { useFormat } from "@/hooks/use-format";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowMetricCard } from "../_components/primitives/metric-card";
import { CashFlowHelp } from "../_components/primitives/help";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";
import { deriveCrunchSignal, getSnapshotAssumptions, getStaleStatus, labelForScenarioTag, topDrivers } from "../_components/primitives/utils";
import {
  buildCashFlowContextQuery,
  CASH_FLOW_DEFAULT_HORIZON,
  CASH_FLOW_DEFAULT_SCENARIO,
  useCashFlowContextFromUrl,
  updateCashFlowContextInUrl,
} from "../_components/context";

type Knob = { key: string; label: string; unit?: string; description: string };

const knobs: Knob[] = [
  { key: "collectionsDelayDays", label: "Collections delay", unit: "days", description: "Shifts expected receipts earlier/later." },
  { key: "inflowHaircutPercent", label: "Inflow haircut", unit: "%", description: "Conservatism applied to non-actual inflows." },
  { key: "outflowIncreasePercent", label: "Outflow increase", unit: "%", description: "Stress multiplier on projected outflows." },
  { key: "movePOEarlierLaterDays", label: "PO timing shift", unit: "days", description: "Moves PO timing earlier/later." },
  { key: "minimumCashThreshold", label: "Minimum cash threshold", unit: "", description: "Runway/alerts buffer floor." },
  { key: "defaultInvoicePaymentTermsDays", label: "Default invoice terms", unit: "days", description: "Fallback when invoice terms are missing." },
];

function knobVal(s: SnapshotDetail | null, key: string) {
  const a = getSnapshotAssumptions(s);
  const n = Number((a as any)?.[key]);
  return Number.isFinite(n) ? n : null;
}

export default function CashFlowScenariosPage() {
  const { fCurrency } = useFormat();
  const urlCtx = useCashFlowContextFromUrl({
    horizonType: CASH_FLOW_DEFAULT_HORIZON,
    scenarioTag: CASH_FLOW_DEFAULT_SCENARIO,
  });
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(urlCtx.horizonType);
  const [selected, setSelected] = useState<CashFlowScenarioTag>(urlCtx.scenarioTag);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotsByScenario, setSnapshotsByScenario] = useState<Record<CashFlowScenarioTag, SnapshotDetail | null>>({
    BASE: null,
    BEST_CASE: null,
    WORST_CASE: null,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [best, base, worst] = await Promise.all([
        fetchCashFlowSnapshotWithPeriods({ horizonType, scenarioTag: "BEST_CASE" }),
        fetchCashFlowSnapshotWithPeriods({ horizonType, scenarioTag: "BASE" }),
        fetchCashFlowSnapshotWithPeriods({ horizonType, scenarioTag: "WORST_CASE" }),
      ]);
      setSnapshotsByScenario({ BEST_CASE: best, BASE: base, WORST_CASE: worst });
    } catch (e: unknown) {
      setSnapshotsByScenario({ BEST_CASE: null, BASE: null, WORST_CASE: null });
      setError(e instanceof Error ? e.message : "Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (urlCtx.horizonType !== horizonType) setHorizonType(urlCtx.horizonType);
    if (urlCtx.scenarioTag !== selected) setSelected(urlCtx.scenarioTag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCtx.horizonType, urlCtx.scenarioTag]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonType, selected]);

  const base = snapshotsByScenario.BASE;
  const best = snapshotsByScenario.BEST_CASE;
  const worst = snapshotsByScenario.WORST_CASE;

  const stale = useMemo(() => getStaleStatus(base?.generatedAt ?? null, 24), [base?.generatedAt]);

  const deltaVsBase = useMemo(() => {
    const baseClosing = Number(base?.closingCash ?? 0);
    const mk = (s: SnapshotDetail | null) => {
      if (!s) return null;
      const closing = Number(s.closingCash ?? 0);
      return closing - baseClosing;
    };
    return {
      BEST_CASE: mk(best),
      BASE: 0,
      WORST_CASE: mk(worst),
    };
  }, [base, best, worst]);

  const trajectory = useMemo(() => {
    const mk = (s: SnapshotDetail | null) => {
      if (!s?.periods?.length) return null;
      return s.periods.map((p) => ({ id: p.id, label: p.bucketLabel, closing: Number(p.closingCash ?? 0) }));
    };
    const series = { BEST_CASE: mk(best), BASE: mk(base), WORST_CASE: mk(worst) } as const;
    const all = [series.BEST_CASE, series.BASE, series.WORST_CASE].flatMap((x) => x ?? []);
    if (!all.length) return { series, min: 0, max: 0, range: 1 };
    const min = Math.min(...all.map((p) => p.closing));
    const max = Math.max(...all.map((p) => p.closing));
    return { series, min, max, range: max - min || 1 };
  }, [best, base, worst]);

  const percent = (n: number) => {
    const v = ((n - trajectory.min) / trajectory.range) * 100;
    return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
  };

  const card = (tag: CashFlowScenarioTag, tone: "default" | "positive" | "warning") => {
    const s = snapshotsByScenario[tag];
    const isActive = selected === tag;
    const delta = deltaVsBase[tag];
    const crunch = deriveCrunchSignal(s);
    return (
      <button
        type="button"
        onClick={() => setSelected(tag)}
        className={`text-left rounded-2xl border p-4 transition-all ${
          isActive ? "border-indigo-400/60 bg-indigo-50/50 dark:bg-indigo-950/20" : "border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{labelForScenarioTag(tag)}</p>
            <p className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              {s ? fCurrency(Number(s.closingCash)) : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {s ? `Worst period: ${crunch?.bucketLabel ?? "—"}` : "No snapshot yet"}
            </p>
            {tag !== "BASE" ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold tabular-nums">
                {delta == null ? (
                  <span className="text-zinc-500 dark:text-zinc-400">Delta vs Base —</span>
                ) : (
                  <span className={delta >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                    {delta >= 0 ? "+" : ""}
                    {fCurrency(delta)}
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              tone === "positive" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-zinc-400"
            }`}
          />
        </div>
      </button>
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCashForecast({ horizonType, scenarioTag: selected });
      toast.success("Scenario refreshed");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh scenario");
    } finally {
      setRefreshing(false);
    }
  };

  const onRefreshAll = async () => {
    setRefreshing(true);
    try {
      await refreshCashForecast({ horizonType, scenarioTag: "BEST_CASE" });
      await refreshCashForecast({ horizonType, scenarioTag: "BASE" });
      await refreshCashForecast({ horizonType, scenarioTag: "WORST_CASE" });
      toast.success("Scenarios refreshed");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh scenarios");
    } finally {
      setRefreshing(false);
    }
  };

  const selectedSnapshot = snapshotsByScenario[selected];
  const q = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag: selected }), [horizonType, selected]);

  const selectedDrivers = useMemo(() => {
    if (!selectedSnapshot) return { inflows: [], outflows: [] };
    return {
      inflows: topDrivers(selectedSnapshot.lineItems.filter((i) => i.direction === "INFLOW"), 4),
      outflows: topDrivers(selectedSnapshot.lineItems.filter((i) => i.direction === "OUTFLOW"), 4),
    };
  }, [selectedSnapshot]);

  return (
    <DashboardPageShell
      title="Cash Flow · Scenarios"
      description="Compare best/base/worst outcomes and their deltas — then drill in without leaving cash-flow."
      icon={<SlidersHorizontal className="h-5 w-5 text-indigo-500" />}
      secondaryActions={<CashFlowNav />}
      animated={false}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {card("BEST_CASE", "positive")}
        {card("BASE", "default")}
        {card("WORST_CASE", "warning")}
      </div>

      <div className="space-y-6">
        <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black tracking-tight">Trajectory overlay</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["BEST_CASE", "BASE", "WORST_CASE"] as const).map((tag) => {
                const s = trajectory.series[tag];
                const label = labelForScenarioTag(tag);
                const tint =
                  tag === "BEST_CASE"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : tag === "WORST_CASE"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-indigo-700 dark:text-indigo-300";
                return (
                  <div key={tag} className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-950/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`text-xs font-bold uppercase tracking-wider ${tint}`}>{label}</div>
                        <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {snapshotsByScenario[tag] ? fCurrency(Number(snapshotsByScenario[tag]?.closingCash ?? 0)) : "—"}
                        </div>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">closing</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(s ?? []).slice(0, 10).map((p) => (
                        <div key={p.id} className="flex items-center gap-3">
                          <div className="w-[96px] truncate text-[11px] text-zinc-500 dark:text-zinc-400">{p.label}</div>
                          <div className="flex-1">
                            <Progress value={percent(p.closing)} className="h-1.5 bg-zinc-200/60 dark:bg-zinc-800/60" />
                          </div>
                          <div className="w-[92px] text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
                            {fCurrency(p.closing)}
                          </div>
                        </div>
                      ))}
                      {(s ?? []).length === 0 ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">No periods yet.</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <CashFlowActionBar
          context={{ horizonType, scenarioTag: selected }}
          onChange={(next) => {
            setHorizonType(next.horizonType);
            setSelected(next.scenarioTag);
            updateCashFlowContextInUrl({ horizonType: next.horizonType, scenarioTag: next.scenarioTag });
          }}
          generatedAtLabel={selectedSnapshot ? format(new Date(selectedSnapshot.generatedAt), "dd MMM yyyy, HH:mm") : null}
          loading={loading}
          refreshing={refreshing}
          stale={stale.isStale}
          onRefresh={onRefresh}
          extra={
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={onRefreshAll} disabled={refreshing}>
              <RefreshCcw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh all
            </Button>
          }
        />

        {error ? (
          <CashFlowErrorState description={error} onRetry={() => void load()} />
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[118px] rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : !base ? (
          <CashFlowNoSnapshotState onGenerate={onRefreshAll} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CashFlowMetricCard
                label="Delta vs Base"
                value={
                  selected === "BASE"
                    ? "Baseline"
                    : deltaVsBase[selected] == null
                      ? "—"
                      : `${deltaVsBase[selected]! >= 0 ? "+" : ""}${fCurrency(deltaVsBase[selected]!)}` }
                subtext="Closing cash delta"
                tone={selected === "WORST_CASE" ? "warning" : selected === "BEST_CASE" ? "positive" : "default"}
              />
              <CashFlowMetricCard
                label="Worst period"
                value={deriveCrunchSignal(selectedSnapshot)?.bucketLabel ?? "—"}
                subtext="Lowest projected closing cash"
                tone={deriveCrunchSignal(selectedSnapshot)?.tone ?? "default"}
              />
              <CashFlowMetricCard
                label="Confidence"
                value={
                  selectedSnapshot?.confidenceScore == null ? "—" : `${Math.round(selectedSnapshot.confidenceScore * 100)}%`
                }
                subtext="Scenario snapshot score"
              />
            </div>

            <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black tracking-tight flex items-center gap-2">
                  What changes between scenarios
                  <CashFlowHelp label="Scenario knobs">
                    Scenarios apply a small set of assumptions that stress inflows/outflows and shift timing. Tune these on Assumptions.
                  </CashFlowHelp>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-zinc-600 dark:text-zinc-300 space-y-3">
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <li className="inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Inflow haircut (%)
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Outflow increase (%)
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-zinc-500" /> Collections delay (days)
                  </li>
                  <li className="inline-flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-zinc-500" /> PO timing shift (days)
                  </li>
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" asChild className="gap-2">
                    <Link href={`/cash-flow/assumptions?horizonType=${horizonType}&scenarioTag=${selected}`}>
                      Tune assumptions
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black tracking-tight">Top inflow drivers (selected)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selectedDrivers.inflows.length === 0 ? (
                    <p className="text-sm text-zinc-500">No inflow drivers for this selection.</p>
                  ) : (
                    selectedDrivers.inflows.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{d.title}</div>
                          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{d.sourceType}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-black tabular-nums">{fCurrency(Number(d.amount ?? 0))}</div>
                        </div>
                      </div>
                    ))
                  )}
                  <Button size="sm" variant="ghost" className="h-8 text-zinc-500" asChild>
                    <Link href={`/cash-flow/inflows?${q}`}>Open inflows</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black tracking-tight">Top outflow drivers (selected)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selectedDrivers.outflows.length === 0 ? (
                    <p className="text-sm text-zinc-500">No outflow drivers for this selection.</p>
                  ) : (
                    selectedDrivers.outflows.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{d.title}</div>
                          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{d.sourceType}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-black tabular-nums">{fCurrency(Number(d.amount ?? 0))}</div>
                        </div>
                      </div>
                    ))
                  )}
                  <Button size="sm" variant="ghost" className="h-8 text-zinc-500" asChild>
                    <Link href={`/cash-flow/outflows?${q}`}>Open outflows</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardPageShell>
  );
}

