"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CashFlowHelp } from "./help";
import type { CashFlowHorizonType, CashFlowScenarioTag } from "../types";

export type CashFlowContext = {
  horizonType: CashFlowHorizonType;
  scenarioTag: CashFlowScenarioTag;
};

export function CashFlowActionBar({
  context,
  onChange,
  generatedAtLabel,
  loading,
  refreshing,
  stale,
  onRefresh,
  extra,
}: {
  context: CashFlowContext;
  onChange: (next: CashFlowContext) => void;
  generatedAtLabel?: string | null;
  loading?: boolean;
  refreshing?: boolean;
  stale?: boolean;
  onRefresh?: () => void;
  extra?: React.ReactNode;
}) {
  const freshness = useMemo(() => {
    if (loading) return { label: "Loading…", tone: "secondary" as const };
    if (!generatedAtLabel) return { label: "No snapshot", tone: "outline" as const };
    if (stale) return { label: "Stale", tone: "outline" as const };
    return { label: "Fresh", tone: "secondary" as const };
  }, [generatedAtLabel, loading, stale]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={context.horizonType}
            onValueChange={(v) => onChange({ ...context, horizonType: v as CashFlowHorizonType })}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY_30">30 days</SelectItem>
              <SelectItem value="WEEKLY_13">13 weeks</SelectItem>
              <SelectItem value="MONTHLY_12">12 months</SelectItem>
            </SelectContent>
          </Select>
          <CashFlowHelp label="Horizon">
            Your forecast bucket size. 13 weeks is typically best for operational cash planning.
          </CashFlowHelp>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={context.scenarioTag}
            onValueChange={(v) => onChange({ ...context, scenarioTag: v as CashFlowScenarioTag })}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BASE">Base</SelectItem>
              <SelectItem value="BEST_CASE">Best case</SelectItem>
              <SelectItem value="WORST_CASE">Worst case</SelectItem>
            </SelectContent>
          </Select>
          <CashFlowHelp label="Scenario">
            Scenarios apply assumptions (collections delay, haircuts, spend stress) to show best/base/worst outcomes.
          </CashFlowHelp>
        </div>

        <Badge
          variant={freshness.tone}
          className={
            stale ? "border-amber-200/60 text-amber-700 dark:border-amber-900/40 dark:text-amber-300" : undefined
          }
        >
          {freshness.label}
        </Badge>
        {generatedAtLabel ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Generated {generatedAtLabel}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {extra}
        {onRefresh ? (
          <Button onClick={onRefresh} disabled={Boolean(refreshing)} className="h-9 gap-2">
            <RefreshCw className={refreshing ? "h-[15px] w-[15px] animate-spin" : "h-[15px] w-[15px]"} />
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  );
}
