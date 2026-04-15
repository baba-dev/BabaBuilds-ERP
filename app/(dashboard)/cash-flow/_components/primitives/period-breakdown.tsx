"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SnapshotDetail, SnapshotLineItem, SnapshotPeriod } from "../types";
import { CashFlowHelp } from "./help";
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
  className,
}: {
  snapshot: SnapshotDetail;
  direction: "INFLOW" | "OUTFLOW";
  currencyFormatter: (n: number) => string;
  className?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const lineItemsByPeriod = useMemo(() => {
    const map = new Map<string, SnapshotLineItem[]>();
    for (const p of snapshot.periods) map.set(p.id, []);
    for (const li of snapshot.lineItems) {
      // snapshot lineItems don't include periodId; infer by expectedDate bucket overlap
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

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-100">Period breakdown</p>
          <CashFlowHelp label="Periods">
            Each period summarizes cash movement and risk level, with top drivers. Expand a period to see the largest line items.
          </CashFlowHelp>
        </div>
      </div>

      {snapshot.periods.map((p) => {
        const all = (lineItemsByPeriod.get(p.id) ?? []).filter((i) => i.direction === direction);
        const drivers = topDrivers(all, 5);
        const isOpen = Boolean(open[p.id]);
        const projected = direction === "INFLOW" ? Number(p.projectedInflows ?? 0) : Number(p.projectedOutflows ?? 0);
        const actual = direction === "INFLOW" ? Number(p.actualInflows ?? 0) : Number(p.actualOutflows ?? 0);

        return (
          <div key={p.id} className={cn("rounded-2xl border p-3 shadow-sm backdrop-blur-sm", periodTone(p.riskLevel))}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setOpen((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-zinc-400">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{p.bucketLabel}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Projected {money(projected, currencyFormatter)} · Actual {money(actual, currencyFormatter)}
                    </p>
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
              <div className="mt-3 border-t border-zinc-200/40 dark:border-zinc-800/50 pt-3 space-y-2">
                {drivers.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">No drivers for this period.</p>
                ) : (
                  drivers.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/40 dark:bg-zinc-900/30 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{d.title}</div>
                        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {d.sourceType} · {labelForClassification(d.classification)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-black tabular-nums">{currencyFormatter(Number(d.amount ?? 0))}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
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

