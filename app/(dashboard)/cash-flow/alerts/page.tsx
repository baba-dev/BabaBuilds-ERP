"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CashFlowPageShell } from "../_components/cash-flow-page-shell";
import type { CashFlowHorizonType, CashFlowScenarioTag, CashFlowAlertDto } from "../_components/types";
import { fetchAlertPreferences, fetchCashFlowAlerts, refreshCashForecast, updateAlertPreferences } from "../_components/api";
import { buildCashFlowContextQuery } from "../_components/context";
import { CashFlowActionBar } from "../_components/primitives/action-bar";
import { CashFlowInsightCard } from "../_components/primitives/insight-card";
import { CashFlowErrorState, CashFlowNoSnapshotState } from "../_components/primitives/state";
import { useCashFlowContextFromUrl, updateCashFlowContextInUrl } from "../_components/context";

type AlertPreferences = {
  showInfo: boolean;
  showWarnings: boolean;
  showCritical: boolean;
  highlightNearRunway: boolean;
};

const defaultAlertPrefs: AlertPreferences = {
  showInfo: true,
  showWarnings: true,
  showCritical: true,
  highlightNearRunway: true,
};

export default function CashFlowAlertsPage() {
  const urlCtx = useCashFlowContextFromUrl();
  const [horizonType, setHorizonType] = useState<CashFlowHorizonType>(urlCtx.horizonType);
  const [scenarioTag, setScenarioTag] = useState<CashFlowScenarioTag>(urlCtx.scenarioTag);
  const [alerts, setAlerts] = useState<CashFlowAlertDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSnapshot, setHasSnapshot] = useState<boolean>(true);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefs, setPrefs] = useState<AlertPreferences>(defaultAlertPrefs);

  useEffect(() => {
    let cancelled = false;
    setPrefsLoading(true);
    fetchAlertPreferences()
      .then((row) => {
        if (cancelled) return;
        const raw = row ?? null;
        const next: AlertPreferences = {
          showInfo: Boolean(raw?.infoEnabled ?? defaultAlertPrefs.showInfo),
          showWarnings: Boolean(raw?.warningEnabled ?? defaultAlertPrefs.showWarnings),
          showCritical: Boolean(raw?.criticalEnabled ?? defaultAlertPrefs.showCritical),
          highlightNearRunway: Boolean(defaultAlertPrefs.highlightNearRunway),
        };
        setPrefs(next);
      })
      .catch(() => {
        // Non-fatal: preferences are optional. Keep defaults and allow user to save later.
      })
      .finally(() => {
        if (cancelled) return;
        setPrefsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePrefs = async (next: AlertPreferences) => {
    setPrefs(next);
    setPrefsSaving(true);
    try {
      await updateAlertPreferences({
        infoEnabled: next.showInfo,
        warningEnabled: next.showWarnings,
        criticalEnabled: next.showCritical,
      });
      toast.success("Alert preferences saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save preferences");
    } finally {
      setPrefsSaving(false);
    }
  };

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

  const visibleAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (a.severity === "critical") return prefs.showCritical;
      if (a.severity === "warning") return prefs.showWarnings;
      if (a.severity === "info") return prefs.showInfo;
      return true;
    });
  }, [alerts, prefs.showCritical, prefs.showWarnings, prefs.showInfo]);

  const grouped = useMemo(() => {
    const critical = visibleAlerts.filter((a) => a.severity === "critical");
    const warning = visibleAlerts.filter((a) => a.severity === "warning");
    const info = visibleAlerts.filter((a) => a.severity === "info");
    return { critical, warning, info };
  }, [visibleAlerts]);

  const q = useMemo(() => buildCashFlowContextQuery({ horizonType, scenarioTag }), [horizonType, scenarioTag]);

  const remediation = (a: CashFlowAlertDto) => {
    const runwayHint = a.severity === "critical" ? "Act immediately." : "Act before this window.";
    if (a.type === "CASH_NEGATIVE") {
      return {
        title: "Remediation playbook",
        bullets: [
          `${runwayHint} Start with the largest collections risks in Inflows, then the largest commitments in Outflows.`,
          "If you can’t move timing, stress-test assumptions (collections delay / haircut) and refresh the forecast.",
          "Use Variance to validate whether the model is consistently optimistic or pessimistic.",
        ],
      };
    }
    if (a.type === "CASH_LOW") {
      return {
        title: "Remediation playbook",
        bullets: [
          "Prioritize high-risk receivables and late-payer exposure in Inflows.",
          "Review committed outflows in this period and identify what can be phased or deferred.",
          "If this happens repeatedly, raise your minimum cash threshold and tune scenarios.",
        ],
      };
    }
    return {
      title: "Next best actions",
      bullets: [
        "Open the period to review drivers and validate the cause.",
        "If drivers look correct, tune assumptions and refresh.",
      ],
    };
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
                  <div className="mt-2 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-950/10 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                      {remediation(a).title}
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                      {remediation(a).bullets.map((b, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-zinc-400/70 dark:bg-zinc-600/70" aria-hidden="true" />
                          <span className="min-w-0">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                {a.periodId ? (
                  <Button size="sm" variant="outline" asChild className="h-8 gap-2">
                    <Link href={`/cash-flow/outflows?${q}&periodId=${encodeURIComponent(a.periodId)}`}>
                      Review period <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" asChild className="h-8 gap-2">
                  <Link href={`/cash-flow/inflows?${q}${a.periodId ? `&periodId=${encodeURIComponent(a.periodId)}` : ""}`}>
                    Review receivables <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild className="h-8 gap-2">
                  <Link href={`/cash-flow/overview?${q}`}>
                    Open command center <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" asChild className="h-8 text-zinc-500">
                  <Link href={`/cash-flow/variance?${q}${a.periodId ? `&periodId=${encodeURIComponent(a.periodId)}` : ""}`}>
                    Validate in variance
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" asChild className="h-8 text-zinc-500">
                  <Link href={`/cash-flow/assumptions?${q}`}>Tune assumptions</Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <CashFlowPageShell
      title="Cash Flow Alerts"
      description="Proactive warnings derived from your latest forecast snapshot."
      icon={<ShieldAlert className="h-5 w-5 text-indigo-500" />}
    >
      <div className="space-y-6">
        <CashFlowActionBar
          context={{ horizonType, scenarioTag }}
          onChange={(next) => {
            setHorizonType(next.horizonType);
            setScenarioTag(next.scenarioTag);
            updateCashFlowContextInUrl(next, { replace: true });
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

                <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-black tracking-tight">Preferences</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-sm text-zinc-700 dark:text-zinc-200">Show critical</Label>
                      <Switch
                        checked={prefs.showCritical}
                        onCheckedChange={(v) => void savePrefs({ ...prefs, showCritical: Boolean(v) })}
                        disabled={prefsLoading || prefsSaving}
                        className="data-[state=checked]:bg-rose-600"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-sm text-zinc-700 dark:text-zinc-200">Show warnings</Label>
                      <Switch
                        checked={prefs.showWarnings}
                        onCheckedChange={(v) => void savePrefs({ ...prefs, showWarnings: Boolean(v) })}
                        disabled={prefsLoading || prefsSaving}
                        className="data-[state=checked]:bg-amber-600"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-sm text-zinc-700 dark:text-zinc-200">Show info</Label>
                      <Switch
                        checked={prefs.showInfo}
                        onCheckedChange={(v) => void savePrefs({ ...prefs, showInfo: Boolean(v) })}
                        disabled={prefsLoading || prefsSaving}
                        className="data-[state=checked]:bg-indigo-600"
                      />
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Preferences are saved to your workspace. They don’t change the forecast engine—only what you see here.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {visibleAlerts.length === 0 ? (
              <Card className="rounded-2xl border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm backdrop-blur-sm">
                <CardContent className="py-10 text-center text-sm text-zinc-500">
                  No alerts for this selection (or they’re hidden by preferences).
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
    </CashFlowPageShell>
  );
}

