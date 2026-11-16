"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { EmptyNote, Panel, PanelLink, Sparkline } from "./dashboard-ui";

type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Forecast = {
  cashNow: number;
  closingCash: number;
  confidence: number | null;
  periods: Array<{ label: string; closing: number; risk: Risk }>;
};
type ForecastResponse = {
  data?: {
    kpis: { cashNow: number; closingCash: number; confidence: number | null };
    scenarios: Array<{ tag: string; periods: Array<{ label: string; closing: number; risk: Risk }> }>;
  };
};

const HORIZON = "WEEKLY_13";
const SCENARIO = "BASE";

/** Thirteen-week cash outlook from the Cash Flow module: where the balance is heading and its lowest point. */
export function DashboardCashFlowSummary({ money, reloadKey }: { money: (value: number) => string; reloadKey: number }) {
  const t = useTranslations("DashboardHome");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/cash-flow/forecast?horizonType=${HORIZON}&scenarioTag=${SCENARIO}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as ForecastResponse | null;
        if (!res.ok || !json?.data) throw new Error("forecast unavailable");
        const scenario = json.data.scenarios.find((s) => s.tag === SCENARIO) ?? json.data.scenarios[0];
        setForecast({
          cashNow: Number(json.data.kpis.cashNow ?? 0),
          closingCash: Number(json.data.kpis.closingCash ?? 0),
          confidence: json.data.kpis.confidence,
          periods: (scenario?.periods ?? []).map((p) => ({ label: p.label, closing: Number(p.closing ?? 0), risk: p.risk })),
        });
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const lowest = forecast?.periods.length ? forecast.periods.reduce((min, p) => (p.closing < min.closing ? p : min)) : null;
  const change = forecast ? forecast.closingCash - forecast.cashNow : 0;
  const lowRisk = lowest ? lowest.risk === "HIGH" || lowest.risk === "CRITICAL" || lowest.closing < 0 : false;

  return (
    <Panel
      labelledBy="dash-cash"
      title={t("cash.title")}
      description={t("cash.description")}
      action={<PanelLink href={`${DASHBOARD_ROUTES.cashFlow}?horizonType=${HORIZON}&scenarioTag=${SCENARIO}`}>{t("common.open")}</PanelLink>}
    >
      {state === "loading" ? (
        <div className="space-y-3" aria-hidden>
          <div className="h-7 w-2/3 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-9 animate-pulse rounded-lg bg-muted/70" />
          <div className="h-12 animate-pulse rounded-xl bg-muted/70" />
        </div>
      ) : state === "error" || !forecast ? (
        <EmptyNote icon={Waves} title={t("cash.errorTitle")} hint={t("cash.errorHint")} />
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{t("cash.projected")}</p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[22px] font-semibold leading-tight tracking-tight tabular-nums text-foreground">{money(forecast.closingCash)}</span>
              <span className={cn("text-xs font-medium tabular-nums", change < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                {change >= 0 ? "+" : "−"}
                {money(Math.abs(change))}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("cash.now", { amount: money(forecast.cashNow) })}</p>
          </div>
          <Sparkline values={[forecast.cashNow, ...forecast.periods.map((p) => p.closing)]} className={change < 0 ? "text-rose-500" : "text-emerald-500"} />
          {lowest ? (
            <dl className="grid grid-cols-2 gap-2">
              <div className="min-w-0 rounded-xl bg-muted/50 px-3 py-2.5">
                <dt className="truncate text-[11px] text-muted-foreground">{t("cash.lowest")}</dt>
                <dd className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums", lowRisk ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>{money(lowest.closing)}</dd>
                <dd className="truncate text-[11px] text-muted-foreground">{lowest.label}</dd>
              </div>
              <div className="min-w-0 rounded-xl bg-muted/50 px-3 py-2.5">
                <dt className="truncate text-[11px] text-muted-foreground">{t("cash.confidence")}</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{forecast.confidence == null ? "—" : `${Math.round(forecast.confidence)}%`}</dd>
                <dd className="truncate text-[11px] text-muted-foreground">{t("cash.confidenceHint")}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
