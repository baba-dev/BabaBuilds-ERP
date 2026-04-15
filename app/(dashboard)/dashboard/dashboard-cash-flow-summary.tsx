"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AreaChart, ArrowRight, RefreshCw, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";

type CashFlowHorizonType = "DAILY_30" | "WEEKLY_13" | "MONTHLY_12";
type CashFlowScenarioTag = "BASE" | "BEST_CASE" | "WORST_CASE";

type SnapshotDetail = {
  id: string;
  generatedAt: string;
  horizonType: CashFlowHorizonType;
  scenarioTag: CashFlowScenarioTag;
  openingCash: number | string;
  closingCash: number | string;
  confidenceScore: number | null;
  periods: Array<{ id: string; bucketLabel: string; closingCash: number | string; riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }>;
};

function buildQs(horizonType: CashFlowHorizonType, scenarioTag: CashFlowScenarioTag) {
  const qs = new URLSearchParams();
  qs.set("horizonType", horizonType);
  qs.set("scenarioTag", scenarioTag);
  return qs.toString();
}

function deriveCrunch(snapshot: SnapshotDetail | null) {
  if (!snapshot?.periods?.length) return null;
  let worst = snapshot.periods[0]!;
  let min = Number(worst.closingCash ?? 0);
  for (const p of snapshot.periods) {
    const c = Number(p.closingCash ?? 0);
    if (c < min) {
      min = c;
      worst = p;
    }
  }
  return { period: worst, minClosing: min };
}

export function DashboardCashFlowSummary({
  defaultHorizonType = "WEEKLY_13",
  defaultScenarioTag = "BASE",
  className,
}: {
  defaultHorizonType?: CashFlowHorizonType;
  defaultScenarioTag?: CashFlowScenarioTag;
  className?: string;
}) {
  const { fCurrency } = useFormat();
  const [snapshot, setSnapshot] = useState<SnapshotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const listRes = await fetch(
        `/api/cash-flow/snapshots?horizonType=${defaultHorizonType}&scenarioTag=${defaultScenarioTag}&limit=1`,
        { cache: "no-store" },
      );
      const listJson = (await listRes.json().catch(() => null)) as unknown;
      if (!listRes.ok) throw new Error((listJson as { error?: string } | null)?.error ?? "Failed to load cash flow snapshot");
      const head = (((listJson as { data?: unknown } | null)?.data ?? []) as Array<{ id?: string }>)[0];
      if (!head?.id) {
        setSnapshot(null);
        return;
      }

      const snapRes = await fetch(`/api/cash-flow/snapshot/${head.id}`, { cache: "no-store" });
      const snapJson = (await snapRes.json().catch(() => null)) as unknown;
      if (!snapRes.ok) throw new Error((snapJson as { error?: string } | null)?.error ?? "Failed to load cash flow details");
      setSnapshot(((snapJson as { data?: unknown } | null)?.data ?? null) as SnapshotDetail | null);
    } catch (e) {
      console.warn(e);
      setSnapshot(null);
      setError(e instanceof Error ? e.message : "Failed to load cash flow");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/cash-flow/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ horizonType: defaultHorizonType, scenarioTag: defaultScenarioTag }),
      });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "Failed to refresh forecast");
      await load();
    } catch (e) {
      console.warn(e);
    } finally {
      setRefreshing(false);
    }
  };

  const crunch = useMemo(() => deriveCrunch(snapshot), [snapshot]);
  const qs = useMemo(() => buildQs(defaultHorizonType, defaultScenarioTag), [defaultHorizonType, defaultScenarioTag]);
  const generatedAtLabel = useMemo(() => {
    if (!snapshot?.generatedAt) return null;
    return format(new Date(snapshot.generatedAt), "dd MMM, HH:mm");
  }, [snapshot?.generatedAt]);
  const confidenceLabel = snapshot?.confidenceScore == null ? "—" : `${Math.round(snapshot.confidenceScore * 100)}%`;

  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/50 shadow-sm hover:shadow-md transition-all duration-500",
        className,
      )}
    >
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-500/5 dark:bg-indigo-500/12 rounded-full blur-3xl group-hover:bg-indigo-500/10 dark:group-hover:bg-indigo-500/20 transition-all duration-700" />

      <div className="relative z-10 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shadow-sm">
              <AreaChart className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Cash flow</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {defaultHorizonType.replace("_", " ")} · {defaultScenarioTag.replace("_", " ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-9 w-9 rounded-xl text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50/60 dark:hover:bg-indigo-500/10"
              aria-label="Refresh cash flow"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Button size="sm" variant="outline" asChild className="h-9 gap-2">
              <Link href={`/cash-flow/overview?${qs}`}>
                Open <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div className="h-9 w-full rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200/60 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/15 p-4">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Cash flow unavailable</p>
            <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">{error}</p>
          </div>
        ) : !snapshot ? (
          <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/20 p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Generate your first forecast</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Unlock runway, crunch windows, alerts, and drivers.
              </p>
            </div>
            <Button size="sm" onClick={onRefresh} disabled={refreshing} className="h-9 gap-2">
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Generate
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-900/40 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Worst window</p>
                <p className="mt-2 text-sm font-black text-zinc-900 dark:text-zinc-50 truncate">
                  {crunch ? crunch.period.bucketLabel : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {crunch ? fCurrency(crunch.minClosing) : "No periods"}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-900/40 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Confidence</p>
                <p className="mt-2 text-sm font-black text-zinc-900 dark:text-zinc-50 tabular-nums">{confidenceLabel}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {generatedAtLabel ? `Updated ${generatedAtLabel}` : "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/20 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-center justify-center border border-amber-500/20">
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">Go from insight → action</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    Review drivers, commitments, and scenario assumptions in one place.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="tabular-nums">
                  Close {fCurrency(Number(snapshot.closingCash ?? 0))}
                </Badge>
                <Button size="sm" variant="outline" asChild className="h-9 gap-2">
                  <Link href={`/cash-flow/alerts?${qs}`}>Alerts</Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

