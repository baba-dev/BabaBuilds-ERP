"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api, shortDay, SOURCE_KEYS, type Forecast, type Horizon, type LineRow, type Scenario } from "./shared";

type Plan = LineRow["planStatus"];

/** Every movement behind the forecast: what, when, how sure, and whether someone is on it. */
export function TimelinePanel({ data, locale, money, canEdit, onChanged }: { data: Forecast; locale: string; money: (n: number) => string; canEdit: boolean; onChanged: (key: string, status: Plan, note: string | null) => void }) {
  const t = useTranslations("CashFlow");
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "INFLOW" | "OUTFLOW">("all");
  const [source, setSource] = useState("all");
  const [state, setState] = useState<"all" | Plan | "overdue">("all");
  const [showActual, setShowActual] = useState(false);

  const rows = useMemo(() => data.lines.filter((l) => {
    if (!showActual && l.classification === "ACTUAL") return false;
    if (dir !== "all" && l.direction !== dir) return false;
    if (source !== "all" && l.sourceType !== source) return false;
    if (state === "overdue" ? l.overdueDays <= 0 : state !== "all" && l.planStatus !== state) return false;
    return !q.trim() || l.title.toLowerCase().includes(q.trim().toLowerCase());
  }), [data.lines, q, dir, source, state, showActual]);

  const totals = useMemo(() => rows.reduce((s, l) => ({ inflow: s.inflow + (l.direction === "INFLOW" ? l.amount : 0), outflow: s.outflow + (l.direction === "OUTFLOW" ? l.amount : 0) }), { inflow: 0, outflow: 0 }), [rows]);

  const setPlan = async (l: LineRow, status: Plan) => {
    try {
      await api("/api/cash-flow/planner", { method: "POST", body: JSON.stringify({ planKey: l.key, status, horizonType: data.horizonType as Horizon, scenarioTag: data.scenarioTag as Scenario, note: l.planNote }) });
      onChanged(l.key, status, l.planNote);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchMovements")} className="pl-9" aria-label={t("searchMovements")} /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
          <Select value={dir} onValueChange={(v) => setDir(v as typeof dir)}><SelectTrigger className="lg:w-36" aria-label={t("direction")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("allDirections")}</SelectItem><SelectItem value="INFLOW">{t("moneyIn")}</SelectItem><SelectItem value="OUTFLOW">{t("moneyOut")}</SelectItem></SelectContent></Select>
          <Select value={source} onValueChange={setSource}><SelectTrigger className="lg:w-40" aria-label={t("sourceLabel")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("allSources")}</SelectItem>{SOURCE_KEYS.map((s) => <SelectItem key={s} value={s}>{t(`source.${s}`)}</SelectItem>)}</SelectContent></Select>
          <Select value={state} onValueChange={(v) => setState(v as typeof state)}><SelectTrigger className="lg:w-40" aria-label={t("statusLabel")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("allStatuses")}</SelectItem><SelectItem value="open">{t("plan.open")}</SelectItem><SelectItem value="deferred">{t("plan.deferred")}</SelectItem><SelectItem value="resolved">{t("plan.resolved")}</SelectItem><SelectItem value="overdue">{t("onlyOverdue")}</SelectItem></SelectContent></Select>
          <label className="flex items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} className="h-4 w-4 accent-primary" />{t("showActual")}</label>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{t("timelineTotals", { count: rows.length, inflow: money(totals.inflow), outflow: money(totals.outflow) })}</p>

      {rows.length === 0 ? <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t("noMovements")}</div> : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {rows.map((l) => (
            <li key={`${l.key}-${l.date}`} className={cn("grid gap-2 px-4 py-3 sm:grid-cols-[5rem_1fr_auto_auto] sm:items-center sm:gap-4", l.planStatus === "resolved" && "opacity-55")}>
              <p className="text-sm tabular-nums text-muted-foreground">{shortDay(l.date, locale)}</p>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{t(`source.${l.sourceType}`)}</Badge>
                  <span>{t(`class.${l.classification}`)}</span>
                  {l.confidence != null ? <span>{t("sureness", { pct: Math.round(l.confidence * 100) })}</span> : null}
                  {l.overdueDays > 0 ? <span className="text-amber-600 dark:text-amber-400">{t("overdueBy", { days: l.overdueDays })}</span> : null}
                  {l.explanation ? <span className="hidden lg:inline">· {l.explanation}</span> : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && l.classification !== "ACTUAL" ? (
                  <Select value={l.planStatus} onValueChange={(v) => void setPlan(l, v as Plan)}>
                    <SelectTrigger className="h-8 w-32 text-xs" aria-label={t("statusLabel")}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="open">{t("plan.open")}</SelectItem><SelectItem value="deferred">{t("plan.deferred")}</SelectItem><SelectItem value="resolved">{t("plan.resolved")}</SelectItem></SelectContent>
                  </Select>
                ) : null}
                <Link href={l.href} className="text-muted-foreground hover:text-foreground" aria-label={t("openSource")}><ExternalLink className="h-4 w-4" /></Link>
              </div>
              <p className={cn("text-right text-sm font-semibold tabular-nums", l.direction === "INFLOW" ? "text-emerald-600 dark:text-emerald-400" : "")}>{l.direction === "INFLOW" ? "+" : "−"}{money(l.amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
