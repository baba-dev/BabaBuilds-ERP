"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ReceiptText, TrendingDown, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { useCashFlowContextFromUrl, updateCashFlowContextInUrl } from "../_components/context";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/hooks/use-format";
import { Textarea } from "@/components/ui/textarea";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchCashFlowSnapshotWithPeriods, fetchPlanner, refreshCashForecast, upsertPlannerRow } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotDetail } from "../_components/types";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowMetricCard } from "../_components/primitives/metric-card";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";
import { CashFlowLineItemsTable } from "../_components/primitives/line-items-table";
import { CashFlowPeriodBreakdown } from "../_components/primitives/period-breakdown";
import { getStaleStatus, isConfidenceLow, sumLineItems, topDrivers } from "../_components/primitives/utils";
import { buildCashFlowContextQuery, useCashFlowUrlContext } from "../_components/context";

export default function CashFlowOutflowsPage() {
  const { fCurrency } = useFormat();
  const ctx = useCashFlowContextFromUrl();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(ctx.horizonType);
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>(ctx.scenarioTag);
  const search = useSearchParams();
  const focusPeriodId = useMemo(() => search.get("periodId"), [search]);
  const [openPeriod, setOpenPeriod] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHorizonType(ctx.horizonType);
    setScenarioTag(ctx.scenarioTag);
  }, [ctx.horizonType, ctx.scenarioTag]);
  const [snapshot, setSnapshot] = useState<SnapshotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setPlannerLoading(true);
    fetchPlanner({ horizonType, scenarioTag })
      .then((rows) => {
        if (cancelled) return;
        setPlan((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            next[r.planKey] = { status: r.status, note: r.note ?? undefined };
          }
          return next;
        });
      })
      .catch((e: unknown) => {
        console.error(e);
        if (!cancelled) toast.error("Failed to load planner");
      })
      .finally(() => {
        if (!cancelled) setPlannerLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizonType, scenarioTag]);

  useEffect(() => {
    if (!focusPeriodId) return;
    setOpenPeriod((prev) => ({ ...prev, [focusPeriodId]: true }));
  }, [focusPeriodId]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCashForecast({ horizonType, scenarioTag });
      await load();
      toast.success("Forecast refreshed");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to refresh forecast");
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
  const [plan, setPlan] = useState<Record<string, { status: "open" | "deferred" | "resolved"; note?: string }>>({});
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerItemId, setPlannerItemId] = useState<string | null>(null);
  const [timingOverlay, setTimingOverlay] = useState<"none" | "deferred-only" | "hide-resolved">("none");

  const visibleOutflows = useMemo(() => {
    if (timingOverlay === "none") return outflows;
    if (timingOverlay === "deferred-only") return outflows.filter((i) => plan[i.id]?.status === "deferred");
    return outflows.filter((i) => plan[i.id]?.status !== "resolved");
  }, [outflows, plan, timingOverlay]);

  const plannerItem = useMemo(() => {
    if (!plannerItemId) return null;
    return outflows.find((i) => i.id === plannerItemId) ?? null;
  }, [outflows, plannerItemId]);

  const plannerState = useMemo(() => (plannerItemId ? plan[plannerItemId] ?? { status: "open" as const } : null), [plan, plannerItemId]);

  const persistPlannerRow = async (lineItemId: string, next: { status: "open" | "deferred" | "resolved"; note?: string }) => {
    try {
      await upsertPlannerRow({
        horizonType,
        scenarioTag,
        planKey: lineItemId,
        status: next.status,
        note: next.note ?? null,
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to save planner");
    }
  };

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
            updateCashFlowContextInUrl({ horizonType: next.horizonType, scenarioTag: next.scenarioTag });
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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Overlay: mark items as deferred/resolved to simulate timing decisions (local only).
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={timingOverlay === "none" ? "secondary" : "outline"}
                      className="h-8"
                      onClick={() => setTimingOverlay("none")}
                    >
                      All
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={timingOverlay === "hide-resolved" ? "secondary" : "outline"}
                      className="h-8"
                      onClick={() => setTimingOverlay("hide-resolved")}
                    >
                      Hide resolved
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={timingOverlay === "deferred-only" ? "secondary" : "outline"}
                      className="h-8"
                      onClick={() => setTimingOverlay("deferred-only")}
                    >
                      Deferred only
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        setPlannerItemId(visibleOutflows[0]?.id ?? null);
                        setPlannerOpen(true);
                      }}
                      disabled={visibleOutflows.length === 0}
                    >
                      Open planner
                    </Button>
                  </div>
                </div>
                <CashFlowLineItemsTable
                  items={visibleOutflows}
                  directionLabel="Outflow drivers"
                  currencyFormatter={(n) => fCurrency(n)}
                  rowTone={(item) => {
                    const st = plan[item.id]?.status ?? "open";
                    if (st === "resolved") return "success";
                    if (st === "deferred") return "warning";
                    return "default";
                  }}
                  onPlanChange={(itemId, next) => setPlan((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { status: "open" }), status: next.status } }))}
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

                <CashFlowPeriodBreakdown
                  snapshot={snapshot}
                  direction="OUTFLOW"
                  currencyFormatter={(n) => fCurrency(n)}
                  defaultOpenPeriodId={focusPeriodId}
                />
          </>
        )}
      </div>

      <div
        className={`fixed inset-0 z-40 ${plannerOpen ? "" : "pointer-events-none opacity-0"} transition-opacity`}
        aria-hidden={!plannerOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/20 dark:bg-black/40"
          onClick={() => setPlannerOpen(false)}
          aria-label="Close planner"
        />
        <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] border-l border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/70 backdrop-blur-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Timing planner</div>
              <div className="mt-1 text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100 truncate">
                {plannerItem?.title ?? "Select an item"}
              </div>
              {plannerItem ? (
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {plannerItem.sourceType} · Expected {new Date(plannerItem.expectedDate).toLocaleDateString()} · {fCurrency(Number(plannerItem.amount ?? 0))}
                </div>
              ) : null}
            </div>
            <Button size="sm" variant="ghost" className="h-8 text-zinc-500" onClick={() => setPlannerOpen(false)}>
              Close
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["open", "deferred", "resolved"] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={plannerState?.status === s ? "secondary" : "outline"}
                  className="h-8"
                  disabled={!plannerItemId}
                  onClick={() => {
                    if (!plannerItemId) return;
                    setPlan((prev) => ({ ...prev, [plannerItemId]: { ...(prev[plannerItemId] ?? { status: "open" }), status: s } }));
                  }}
                >
                  {s === "open" ? "Open" : s === "deferred" ? "Deferred" : "Resolved"}
                </Button>
              ))}
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Note</div>
              <Textarea
                value={plannerState?.note ?? ""}
                onChange={(e) => {
                  if (!plannerItemId) return;
                  const note = e.target.value;
                  setPlan((prev) => ({ ...prev, [plannerItemId]: { ...(prev[plannerItemId] ?? { status: "open" }), note } }));
                }}
                placeholder="Why defer/resolve? Capture the decision so you can revisit later."
                className="mt-2 min-h-[96px]"
                disabled={!plannerItemId}
              />
            </div>

            <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-3 text-sm text-zinc-600 dark:text-zinc-300">
              This planner is a lightweight overlay to help you reason about timing. It doesn’t change the forecast engine yet—use it to identify what to renegotiate, phase, or delay before the runway window.
            </div>
          </div>
        </div>
      </div>
    </DashboardPageShell>
  );
}
 
