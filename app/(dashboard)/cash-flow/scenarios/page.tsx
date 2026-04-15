"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { CashFlowNav } from "../_components/cash-flow-nav";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotListItem } from "../_components/types";
import { fetchSnapshots, refreshCashForecast } from "../_components/api";
import { useFormat } from "@/hooks/use-format";

export default function CashFlowScenariosPage() {
  const { fCurrency } = useFormat();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [selected, setSelected] = useState<CashFlowScenarioTag>("BASE");
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await fetchSnapshots({ horizonType, scenarioTag: selected, limit: 25 });
      setSnapshots(all);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [horizonType]);

  const latestByScenario = useMemo(() => {
    const map = new Map<CashFlowScenarioTag, SnapshotListItem>();
    for (const s of snapshots) {
      if (!map.has(s.scenarioTag)) map.set(s.scenarioTag, s);
    }
    return map;
  }, [snapshots]);

  const card = (tag: CashFlowScenarioTag, tone: "default" | "positive" | "warning") => {
    const s = latestByScenario.get(tag);
    const isActive = selected === tag;
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
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{tag.replace("_", " ")}</p>
            <p className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              {s ? fCurrency(Number(s.closingCash)) : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {s ? `Generated ${new Date(s.generatedAt).toLocaleString()}` : "No snapshot yet"}
            </p>
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
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to refresh scenario");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <DashboardPageShell
      title="Cash Flow · Scenarios"
      description="Best/base/worst case forecast views with traceable snapshots."
      icon={<SlidersHorizontal className="h-5 w-5 text-indigo-500" />}
      secondaryActions={
        <Select value={horizonType} onValueChange={(v) => setHorizonType(v as CashFlowHorizonType)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DAILY_30">30 days (daily)</SelectItem>
            <SelectItem value="WEEKLY_13">13 weeks (weekly)</SelectItem>
            <SelectItem value="MONTHLY_12">12 months (monthly)</SelectItem>
          </SelectContent>
        </Select>
      }
      primaryAction={
        <Button onClick={onRefresh} disabled={refreshing}>
          <RefreshCcw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh selected
        </Button>
      }
    >
      <CashFlowNav />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {card("BEST_CASE", "positive")}
        {card("BASE", "default")}
        {card("WORST_CASE", "warning")}
      </div>

      <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-sm font-bold tracking-tight">What changes between scenarios</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 dark:text-zinc-300">
          {loading ? (
            <p>Loading…</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              <li>Collections delay (days)</li>
              <li>Inflow haircut (%)</li>
              <li>Outflow increase (%)</li>
              <li>PO timing shift (days)</li>
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            v2 polish: these knobs will become editable per workspace in the Assumptions page.
          </p>
        </CardContent>
      </Card>
    </DashboardPageShell>
  );
}

