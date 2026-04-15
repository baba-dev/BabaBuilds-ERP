"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CashFlowNav } from "../_components/cash-flow-nav";
import type { CashFlowHorizonType, CashFlowScenarioTag, CashFlowAlertDto } from "../_components/types";
import { fetchCashFlowAlerts, refreshCashForecast } from "../_components/api";
import { buildCashFlowContextQuery } from "../_components/context";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowInsightCard } from "../_components/primitives/insight-card";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";

export default function CashFlowAlertsPage() {
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>("WEEKLY_13");
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>("BASE");
  const [alerts, setAlerts] = useState<CashFlowAlertDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCashFlowAlerts({ horizonType, scenarioTag, limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setAlerts(res.alerts);
        setHasSnapshot(Boolean(res.snapshot));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load alerts");
        setAlerts([]);
        setHasSnapshot(true);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [horizonType, scenarioTag]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCashForecast({ horizonType, scenarioTag });
      toast.success("Forecast refreshed");
      const res = await fetchCashFlowAlerts({ horizonType, scenarioTag, limit: 100 });
      setAlerts(res.alerts);
      setHasSnapshot(Boolean(res.snapshot));
    } catch (e) {
      console.error(e);
      toast.error("Failed to refresh forecast");
    } finally {
      setRefreshing(false);
    }
  };

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const a of alerts) counts[a.severity as "critical" | "warning" | "info"] += 1;
    return counts;
  }, [alerts]);

  const grouped = useMemo(() => {
    const critical = alerts.filter((a) => a.severity === "critical");
    const warning = alerts.filter((a) => a.severity === "warning");
    const info = alerts.filter((a) => a.severity === "info");
    return { critical, warning, info };
  }, [alerts]);

  const q = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag }), [horizonType, scenarioTag]);

  const explain = (a: CashFlowAlertDto) => {
    if (a.type === "CASH_NEGATIVE") {
      return "Cash going negative is a forcing function. Prioritize collections, consider delaying discretionary spend, and validate assumptions.";
    }
    if (a.type === "CASH_LOW") {
      return "Low cash reduces flexibility. Review large commitments and high-risk inflows for this window.";
    }
    return "This alert highlights a risk signal derived from your snapshot. Use drivers to confirm the cause and decide next actions.";
  };

  const SeveritySection = ({
    title,
    tone,
    items,
  }: {
    title: string;
    tone: "danger" | "warning" | "default";
    items: CashFlowAlertDto[];
  }) => {
    if (items.length === 0) return null;
    const headerClass =
      tone === "danger"
        ? "border-rose-200/60 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20"
        : tone === "warning"
          ? "border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20"
          : "border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20";
    return (
      <Card className={`rounded-2xl border shadow-sm backdrop-blur-sm ${headerClass}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black tracking-tight">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((a, idx) => (
            <div
              key={`${a.type}-${a.periodId ?? "na"}-${idx}`}
              className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 p-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5">
                  <AlertTriangle
                    className={
                      a.severity === "critical"
                        ? "h-4 w-4 text-rose-600 dark:text-rose-400"
                        : a.severity === "warning"
                          ? "h-4 w-4 text-amber-600 dark:text-amber-400"
                          : "h-4 w-4 text-zinc-500"
                    }
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{a.title}</p>
                    <Badge variant="outline" className="text-[11px]">
                      {a.severity}
                    </Badge>
                    {a.periodStart ? (
                      <Badge variant="outline" className="text-[11px] text-zinc-500">
                        {new Date(a.periodStart).toLocaleDateString()}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{a.body}</p>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{explain(a)}</p>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <Button size="sm" variant="outline" asChild className="h-8 gap-2">
                  <Link href={`/cash-flow/overview?${q}`}>
                    Open command center <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" asChild className="h-8 text-zinc-500">
                  <Link href={`/cash-flow/variance?${q}`}>Validate in variance</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardPageShell
      title="Cash Flow Alerts"
      description="Proactive warnings derived from your latest forecast snapshot."
      icon={<ShieldAlert className="h-5 w-5 text-indigo-500" />}
      secondaryActions={<CashFlowNav />}
      animated={false}
    >
      <div className="space-y-6">
        <CashFlowActionBar
          context={{ horizonType, scenarioTag }}
          onChange={(next) => {
            setHorizonType(next.horizonType);
            setScenarioTag(next.scenarioTag);
          }}
          loading={loading}
          refreshing={refreshing}
          onRefresh={onRefresh}
          extra={
            <Button variant="outline" size="sm" className="h-9 gap-2" asChild>
              <Link href={`/cash-flow/overview?${q}`}>
                Open command center <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {error ? (
          <CashFlowErrorState description={error} onRetry={() => void onRefresh()} />
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[108px] rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : !hasSnapshot ? (
          <CashFlowNoSnapshotState onGenerate={onRefresh} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <CashFlowInsightCard
                  title="What alerts mean"
                  tone={severityCounts.critical > 0 ? "danger" : severityCounts.warning > 0 ? "warning" : "default"}
                  description="Alerts are derived from your latest snapshot’s period risk levels. They point you to the window that needs attention — then you drill into drivers to act."
                  ctas={[
                    { label: "Review commitments", href: `/cash-flow/outflows?${q}`, variant: "outline" },
                    { label: "Review receivables", href: `/cash-flow/inflows?${q}`, variant: "outline" },
                  ]}
                />
              </div>
              <div className="space-y-3">
                <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black tracking-tight">Severity summary</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-rose-200 text-rose-700 dark:border-rose-900/50 dark:text-rose-300"
                    >
                      Critical: {severityCounts.critical}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-amber-200 text-amber-700 dark:border-amber-900/50 dark:text-amber-300"
                    >
                      Warning: {severityCounts.warning}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300"
                    >
                      Info: {severityCounts.info}
                    </Badge>
                  </CardContent>
                </Card>
              </div>
            </div>

            {alerts.length === 0 ? (
              <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                <CardContent className="py-10 text-center text-sm text-zinc-500">
                  No alerts for this selection.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <SeveritySection title="Critical" tone="danger" items={grouped.critical} />
                <SeveritySection title="Warning" tone="warning" items={grouped.warning} />
                <SeveritySection title="Info" tone="default" items={grouped.info} />
              </div>
            )}
          </>
        )}
      </div>
    </DashboardPageShell>
  );
}

