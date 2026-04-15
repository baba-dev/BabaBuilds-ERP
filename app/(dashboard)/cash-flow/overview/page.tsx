"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AreaChart, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFormat } from "@/hooks/use-format";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchSnapshots, refreshCashForecast } from "../_components/api";
import type { CashFlowHorizonType, CashFlowScenarioTag, SnapshotListItem } from "../_components/types";

export default function CashFlowOverviewPage() {
  const { fCurrency } = useFormat();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [snapshot, setSnapshot] = useState<SnapshotListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await fetchSnapshots({ horizonType, scenarioTag, limit: 1 });
      setSnapshot(list[0] ?? null);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load cash flow snapshot");
      setSnapshot(null);
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

  const cards = useMemo(() => {
    if (!snapshot) return null;
    return {
      generatedAt: format(new Date(snapshot.generatedAt), "dd MMM yyyy, HH:mm"),
      opening: fCurrency(Number(snapshot.openingCash)),
      closing: fCurrency(Number(snapshot.closingCash)),
      inflows: fCurrency(Number(snapshot.totalProjectedInflows)),
      outflows: fCurrency(Number(snapshot.totalProjectedOutflows)),
    };
  }, [snapshot, fCurrency]);

  return (
    <DashboardPageShell
      title="Cash Flow Command Center"
      description="13-week cash forecasting built from invoices, retainers, POs, bank activity, and manual adjustments."
      icon={<AreaChart className="h-5 w-5 text-indigo-500" />}
      secondaryActions={<CashFlowNav />}
      primaryAction={
        <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      }
      animated={false}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{horizonType}</Badge>
          <Badge variant="outline">{scenarioTag}</Badge>
          <span className="text-xs text-zinc-500">
            {loading ? "Loading…" : snapshot ? `Generated ${cards?.generatedAt}` : "No snapshot yet"}
          </span>
          <span className="ml-auto text-xs text-zinc-500">
            <Link className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-200" href="/cash-flow/assumptions">
              Edit assumptions
            </Link>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 dark:text-zinc-400">Opening cash</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{cards ? cards.opening : "—"}</div>
              <p className="mt-1 text-xs text-zinc-500">From bank accounts + transactions</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 dark:text-zinc-400">Projected inflows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{cards ? cards.inflows : "—"}</div>
              <p className="mt-1 text-xs text-zinc-500">Invoices + retainers</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 dark:text-zinc-400">Projected outflows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{cards ? cards.outflows : "—"}</div>
              <p className="mt-1 text-xs text-zinc-500">POs + manual commitments</p>
            </CardContent>
          </Card>
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-500 dark:text-zinc-400">Closing cash</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{cards ? cards.closing : "—"}</div>
              <p className="mt-1 text-xs text-zinc-500">End of horizon estimate</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Next actions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-600 dark:text-zinc-300 space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Add bank accounts on{" "}
                <Link className="underline underline-offset-4" href="/cash-flow/assumptions">
                  Assumptions
                </Link>{" "}
                (v2 polish: dedicated bank account settings page).
              </li>
              <li>Refresh forecast after invoice/PO updates.</li>
              <li>Review Alerts for potential cash crunch periods.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardPageShell>
  );
}

