"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SnapshotDetail, SnapshotLineItem, SnapshotPeriod } from "../types";
import { CashFlowHelp } from "./help";
import { cashFlowTypography, dt } from "../cash-flow-typography";
import { labelForClassification, sumLineItems, toneForRiskLevel, topDrivers } from "./utils";

function money(n: unknown, fmt: (n: number) => string) {
  return fmt(Number(n ?? 0));
}

function periodTone(riskLevel: SnapshotPeriod["riskLevel"]) {
  const tone = toneForRiskLevel(riskLevel);
  if (tone === "danger") return "border-rose-200/60 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/15";
  if (tone === "warning") return "border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/15";
  return "border-zinc-200/60 bg-white/40 dark:border-zinc-800/60 dark:bg-zinc-900/20";
}

function badgeForRisk(riskLevel: SnapshotPeriod["riskLevel"]) {
  if (riskLevel === "CRITICAL")
    return <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">Critical</Badge>;
  if (riskLevel === "HIGH")
    return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">High</Badge>;
  if (riskLevel === "MEDIUM")
    return <Badge className="bg-amber-500/5 text-amber-700 dark:text-amber-300 border border-amber-500/15">Medium</Badge>;
  return <Badge variant="outline" className="text-zinc-500">Low</Badge>;
}

export function CashFlowPeriodBreakdown({
  snapshot,
  direction,
  currencyFormatter,
  defaultOpenPeriodId,
  className,
  showTimingOverlay = true,
}: {
  snapshot: SnapshotDetail;
  direction: "INFLOW" | "OUTFLOW";
  currencyFormatter: (n: number) => string;
  defaultOpenPeriodId?: string | null;
  className?: string;
  showTimingOverlay?: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (periodId: string) => setOpen((prev) => ({ ...prev, [periodId]: !prev[periodId] }));

  // Open a focused period when deep-linked.
  // We keep this client-only and local to avoid forcing state into parent pages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    if (!defaultOpenPeriodId) return;
    setOpen((prev) => (prev[defaultOpenPeriodId] ? prev : { ...prev, [defaultOpenPeriodId]: true }));
  }, [defaultOpenPeriodId]);

  const lineItemsByPeriod = useMemo(() => {
    const map = new Map<string, SnapshotLineItem[]>();
    for (const p of snapshot.periods) map.set(p.id, []);
    for (const li of snapshot.lineItems) {
      // Prefer explicit periodId when available (newer snapshots). Fall back to expectedDate bucketing for older snapshots.
      const explicit = li.periodId;
      if (explicit && map.has(explicit)) {
        const arr = map.get(explicit) ?? [];
        arr.push(li);
        map.set(explicit, arr);
        continue;
      }

      const date = new Date(li.expectedDate).getTime();
      const match = snapshot.periods.find((p) => {
        const start = new Date(p.periodStart).getTime();
        const end = new Date(p.periodEnd).getTime();
        return date >= start && date <= end;
      });
      if (!match) continue;
      const arr = map.get(match.id) ?? [];
      arr.push(li);
      map.set(match.id, arr);
    }
    return map;
  }, [snapshot]);

  const overlayColors = useMemo(() => {
    // Intent: consistent, restrained tokens that work in dark mode.
    const committed = "bg-amber-500/80 dark:bg-amber-400/80";
    const expected = "bg-zinc-400/70 dark:bg-zinc-500/60";
    const predicted = "bg-zinc-300/80 dark:bg-zinc-600/50";
    const actual = "bg-indigo-500/80 dark:bg-indigo-400/80";
    const manual = "bg-emerald-500/75 dark:bg-emerald-400/70";
    return { committed, expected, predicted, actual, manual };
  }, []);

  const overlayHelp = direction === "OUTFLOW"
    ? "Timing overlay shows how much of this period’s outflow is committed vs projected. Use it to spot what can be reviewed or deferred."
    : "Timing overlay shows how much of this period’s inflow is expected vs predicted vs actual. Use it to spot risk and collection focus.";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className={dt(cashFlowTypography.cardTitle, "tracking-tight")}>Period breakdown</p>
          <CashFlowHelp label="Periods">
            Each period summarizes cash movement and risk level, with top drivers. Expand a period to see the largest line items.
          </CashFlowHelp>
          {showTimingOverlay ? (
            <CashFlowHelp label="Timing overlay">
              {overlayHelp}
            </CashFlowHelp>
          ) : null}
        </div>
      </div>

      {snapshot.periods.map((p) => {
        const all = (lineItemsByPeriod.get(p.id) ?? []).filter((i) => i.direction === direction);
        const drivers = topDrivers(all, 5);
        const isOpen = Boolean(open[p.id]);
        const projected = direction === "INFLOW" ? Number(p.projectedInflows ?? 0) : Number(p.projectedOutflows ?? 0);
        const actual = direction === "INFLOW" ? Number(p.actualInflows ?? 0) : Number(p.actualOutflows ?? 0);
        const totalsByClass = all.reduce(
          (acc, it) => {
            const cls = it.classification;
            acc[cls] = (acc[cls] ?? 0) + Number(it.amount ?? 0);
            return acc;
          },
          {} as Record<SnapshotLineItem["classification"], number>,
        );
        const overlayTotal = Object.values(totalsByClass).reduce((a, b) => a + b, 0) || 0;

        return (
          <div
            key={p.id}
            className={cn(
              "rounded-2xl border p-3 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md",
              periodTone(p.riskLevel),
            )}
          >
            <button
              type="button"
              className="w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => toggle(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(p.id);
                }
              }}
              aria-expanded={isOpen}
              aria-controls={`cashflow-period-${p.id}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-zinc-400">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className={dt(cashFlowTypography.cardTitle, "truncate")}>{p.bucketLabel}</p>
                    <p className={dt(cashFlowTypography.helperXs)}>
                      Projected {money(projected, currencyFormatter)} · Actual {money(actual, currencyFormatter)}
                    </p>
                    {showTimingOverlay && overlayTotal > 0 ? (
                      <div className="mt-2">
                        <div
                          className="h-2 w-full overflow-hidden rounded-full bg-zinc-200/60 dark:bg-zinc-800/60"
                          role="img"
                          aria-label={`Timing overlay: ${Object.entries(totalsByClass)
                            .filter(([, v]) => (v ?? 0) > 0)
                            .map(([k, v]) => `${labelForClassification(k as any)} ${currencyFormatter(v ?? 0)}`)
                            .join(", ")}`}
                        >
                          <div className="flex h-full w-full">
                            {totalsByClass.COMMITTED ? (
                              <div
                                className={overlayColors.committed}
                                style={{ width: `${(totalsByClass.COMMITTED / overlayTotal) * 100}%` }}
                              />
                            ) : null}
                            {totalsByClass.EXPECTED ? (
                              <div
                                className={overlayColors.expected}
                                style={{ width: `${(totalsByClass.EXPECTED / overlayTotal) * 100}%` }}
                              />
                            ) : null}
                            {totalsByClass.PREDICTED ? (
                              <div
                                className={overlayColors.predicted}
                                style={{ width: `${(totalsByClass.PREDICTED / overlayTotal) * 100}%` }}
                              />
                            ) : null}
                            {totalsByClass.ACTUAL ? (
                              <div
                                className={overlayColors.actual}
                                style={{ width: `${(totalsByClass.ACTUAL / overlayTotal) * 100}%` }}
                              />
                            ) : null}
                            {totalsByClass.MANUAL ? (
                              <div
                                className={overlayColors.manual}
                                style={{ width: `${(totalsByClass.MANUAL / overlayTotal) * 100}%` }}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {badgeForRisk(p.riskLevel)}
                  <Badge variant="outline" className="tabular-nums">
                    {currencyFormatter(sumLineItems(all))}
                  </Badge>
                </div>
              </div>
            </button>

            {isOpen ? (
              <div id={`cashflow-period-${p.id}`} className="mt-3 border-t border-zinc-200/40 dark:border-zinc-800/50 pt-3 space-y-2">
                {drivers.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">No drivers for this period.</p>
                ) : (
                  drivers.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2">
                      <div className="min-w-0">
                        <div className={dt(cashFlowTypography.cardTitle, "truncate text-sm")}>{d.title}</div>
                        <div className={dt(cashFlowTypography.helperXs, "mt-0.5")}>
                          {d.sourceType} · {labelForClassification(d.classification)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={dt(cashFlowTypography.valueSmBold, "tabular-nums")}>{currencyFormatter(Number(d.amount ?? 0))}</div>
                        <div className={dt(cashFlowTypography.labelUpper, "tabular-nums")}>
                          {d.confidence == null ? "—" : `${Math.round(d.confidence * 100)}%`}
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <div className="pt-1">
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-zinc-500" onClick={() => setOpen((prev) => ({ ...prev, [p.id]: false }))}>
                    Collapse
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

