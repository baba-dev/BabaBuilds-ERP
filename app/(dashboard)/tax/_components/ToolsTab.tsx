"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, Download, FileArchive, FileCode2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EmptyArt } from "./art/GstArt";
import { Skeleton } from "@/components/ui/skeleton";
import { callApi, formatDay, periodLabel, Section, useJson, useMoney, type ObligationView } from "./gst-utils";

type Forecast = { items: Array<{ id: string; periodKey: string; dueDate: string; amount: number; label: string; estimated: boolean }> };
type WhatIf = { periodKey: string; before: { cash: number; itcUsed: number; closingItc: number }; after: { cash: number; itcUsed: number; closingItc: number }; itcAdded: number; cashChange: number };

export function ToolsTab({ fy, obligations, canManage }: { fy: string; obligations: ObligationView[]; canManage: boolean }) {
  const t = useTranslations("GstHub.tools");
  const { m, locale } = useMoney();
  const forecast = useJson<Forecast>("/api/gst/forecast");
  const periods = Array.from(new Set(obligations.filter((o) => o.returnType === "GSTR3B" && o.status !== "FILED").map((o) => o.periodKey)));
  const nowMs = new Date().getTime();
  const current = obligations.find((o) => o.returnType === "GSTR3B" && new Date(o.periodStart).getTime() <= nowMs && nowMs <= new Date(o.periodEnd).getTime());
  const [period, setPeriod] = useState(current && periods.includes(current.periodKey) ? current.periodKey : (periods[0] ?? ""));
  const [amount, setAmount] = useState("100000");
  const [rate, setRate] = useState("18");
  const [inter, setInter] = useState(false);
  const [kind, setKind] = useState<"ELIGIBLE" | "REVERSE_CHARGE">("ELIGIBLE");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WhatIf | null>(null);

  async function run() {
    setBusy(true);
    const r = await callApi<WhatIf>("POST", "/api/gst/forecast", { periodKey: period, amount: Number(amount), rate: Number(rate), interState: inter, itcStatus: kind });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    setResult(r.data);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title={t("forecast.title")} hint={t("forecast.hint")} right={<CalendarClock className="size-4 text-indigo-500" aria-hidden />}>
          {forecast.loading && !forecast.data ? <Skeleton className="h-24 rounded-xl" /> : (forecast.data?.items.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center"><EmptyArt variant="ledger" /><p className="text-xs text-muted-foreground">{t("forecast.empty")}</p></div>
          ) : (
            <ul className="divide-y divide-border/50">
              {forecast.data!.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><p className="text-sm font-medium">{i.label}</p><p className="text-xs text-muted-foreground">{t("forecast.due", { date: formatDay(i.dueDate, locale) })}{i.estimated ? ` · ${t("forecast.estimated")}` : ""}</p></div>
                  <p className="text-sm font-semibold tabular-nums">{m(i.amount)}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t("forecast.note")}</p>
        </Section>

        <Section title={t("whatif.title")} hint={t("whatif.hint")} right={<Sparkles className="size-4 text-violet-500" aria-hidden />}>
          {periods.length === 0 ? <p className="text-sm text-muted-foreground">{t("whatif.none")}</p> : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>{t("whatif.period")}</Label>
                  <Select value={period} onValueChange={(v) => { setPeriod(v); setResult(null); }}><SelectTrigger aria-label={t("whatif.period")}><SelectValue /></SelectTrigger><SelectContent>{periods.map((p) => <SelectItem key={p} value={p}>{periodLabel(p, locale)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="wi-amount">{t("whatif.amount")}</Label><Input id="wi-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>{t("whatif.rate")}</Label>
                  <Select value={rate} onValueChange={setRate}><SelectTrigger aria-label={t("whatif.rate")}><SelectValue /></SelectTrigger><SelectContent>{[5, 18, 40, 12, 28].map((r) => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label>{t("whatif.supplier")}</Label>
                  <Select value={inter ? "inter" : "intra"} onValueChange={(v) => setInter(v === "inter")}><SelectTrigger aria-label={t("whatif.supplier")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="intra">{t("whatif.intra")}</SelectItem><SelectItem value="inter">{t("whatif.inter")}</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>{t("whatif.kind")}</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}><SelectTrigger aria-label={t("whatif.kind")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ELIGIBLE">{t("whatif.eligible")}</SelectItem><SelectItem value="REVERSE_CHARGE">{t("whatif.rcm")}</SelectItem></SelectContent></Select></div>
              </div>
              <Button onClick={run} disabled={busy || !(Number(amount) > 0)}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("whatif.run")}</Button>
              {result ? (
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
                  <div><p className="text-muted-foreground">{t("whatif.before")}</p><p className="text-sm font-semibold tabular-nums">{m(result.before.cash)}</p></div>
                  <div><p className="text-muted-foreground">{t("whatif.after")}</p><p className="text-sm font-semibold tabular-nums">{m(result.after.cash)}</p></div>
                  <div><p className="text-muted-foreground">{t("whatif.change")}</p><p className={cn("text-sm font-semibold tabular-nums", result.cashChange < 0 ? "text-emerald-600" : "text-rose-600")}>{m(result.cashChange)}</p></div>
                  <p className="col-span-3 text-muted-foreground">{t("whatif.explain", { credit: m(result.itcAdded), carry: m(result.after.closingItc) })}</p>
                </div>
              ) : null}
            </div>
          )}
        </Section>
      </div>

      <Section title={t("exports.title")} hint={t("exports.hint")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { href: `/api/gst/export/bundle?fy=${encodeURIComponent(fy)}`, icon: FileArchive, key: "bundle", gradient: "from-indigo-500 to-violet-500" },
            { href: `/api/gst/export/tally?fy=${encodeURIComponent(fy)}`, icon: FileCode2, key: "tally", gradient: "from-emerald-500 to-teal-500" },
            { href: `/api/gst/gstr9/export?fy=${encodeURIComponent(fy)}`, icon: Download, key: "gstr9", gradient: "from-amber-500 to-orange-500" },
          ].map((e) => (
            <a key={e.key} href={e.href} className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", e.gradient)}><e.icon className="size-5" aria-hidden /></span>
              <span><span className="block text-sm font-semibold">{t(`exports.${e.key}`)}</span><span className="block text-xs text-muted-foreground">{t(`exports.${e.key}Body`)}</span></span>
            </a>
          ))}
        </div>
        {!canManage ? <p className="mt-3 text-xs text-muted-foreground">{t("exports.readOnly")}</p> : null}
      </Section>
    </div>
  );
}
