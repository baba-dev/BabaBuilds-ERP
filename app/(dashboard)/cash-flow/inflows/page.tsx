"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpRight, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CashFlowNav } from "../_components/cash-flow-nav";
import { fetchSnapshots } from "../_components/api";
import type { SnapshotListItem } from "../_components/types";

export default function CashFlowInflowsPage() {
  const [snapshot, setSnapshot] = useState<SnapshotListItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchSnapshots({ horizonType: "WEEKLY_13", scenarioTag: "BASE", limit: 1 })
      .then((rows) => setSnapshot(rows[0] ?? null))
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load forecast.");
      })
      .finally(() => setLoading(false));
  }, []);

  const description = useMemo(() => {
    if (!snapshot) return "Invoices + retainers powering expected inflows.";
    return `Showing the latest ${snapshot.horizonType} · ${snapshot.scenarioTag} snapshot.`;
  }, [snapshot]);

  return (
    <DashboardPageShell
      title="Cash Flow · Inflows"
      description={description}
      icon={<ReceiptText className="h-5 w-5 text-indigo-500" />}
      animated={false}
      secondaryActions={
        <div className="flex items-center gap-2">
          <CashFlowNav />
          <Button variant="outline" size="sm" asChild>
            <Link href="/cash-flow/overview">
              View overview <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      }
    >
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Receivables forecast</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 dark:text-zinc-300">
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            </div>
          ) : snapshot ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{snapshot.horizonType}</Badge>
              <Badge variant="outline">{snapshot.scenarioTag}</Badge>
              <span className="text-xs text-zinc-500">
                Generated {format(new Date(snapshot.generatedAt), "dd MMM yyyy, HH:mm")}
              </span>
              <span className="text-xs text-zinc-500">
                (Inflows tables + invoice drilldowns are part of v2 polish; this page will switch to line-items once snapshot detail API is added.)
              </span>
            </div>
          ) : (
            <span>No snapshot yet. Refresh from Overview.</span>
          )}
        </CardContent>
      </Card>
    </DashboardPageShell>
  );
}

