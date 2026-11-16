"use client";

import { useEffect, useState } from "react";
import { Landmark, Printer, Receipt, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CloseoutDialog } from "./CloseoutDialog";
import { RefundDialog, type RefundTarget } from "./RefundDialog";
import { api, type CloseoutState, type Summary } from "./shared";

function startOfLocalDay() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

export function TodayPanel({ money, locale, reloadKey, canCheckout, canRefund, onChanged }: { money: (n: number) => string; locale: string; reloadKey: number; canCheckout: boolean; canRefund: boolean; onChanged: () => void }) {
  const t = useTranslations("PosRegister");
  const [state, setState] = useState<{ key: number | null; data: Summary | null; error: string | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    const from = startOfLocalDay();
    const to = new Date(from.getTime() + 86_400_000);
    api<Summary>(`/api/pos/summary?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then((d) => { if (!cancelled) setState({ key: reloadKey, data: d, error: null }); })
      .catch((e) => { if (!cancelled) setState({ key: reloadKey, data: null, error: e instanceof Error ? e.message : "error" }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const [drawer, setDrawer] = useState<{ key: number | null; data: CloseoutState | null }>({ key: null, data: null });
  useEffect(() => {
    let cancelled = false;
    api<CloseoutState>("/api/pos/closeout").then((d) => { if (!cancelled) setDrawer({ key: reloadKey, data: d }); }).catch(() => { if (!cancelled) setDrawer({ key: reloadKey, data: null }); });
    return () => { cancelled = true; };
  }, [reloadKey]);
  const [closing, setClosing] = useState(false);
  const [refund, setRefund] = useState<RefundTarget | null>(null);
  const cash = drawer.key === reloadKey ? drawer.data : null;
  const d = state.key === reloadKey ? state.data : null;
  const fmt = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  if (state.error && !d) return <p className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm">{state.error}</p>;
  if (!d) return <div className="space-y-3 p-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>;
  const maxMethod = Math.max(1, ...d.byMethod.map((m) => m.amount));

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[t("today.sales"), String(d.totals.count)], [t("today.takings"), money(d.totals.total)], [t("today.average"), money(d.totals.average)], [t("today.gst"), money(d.totals.tax)]].map(([k, v]) => <div key={k} className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4"><h3 className="mb-3 font-medium">{t("today.byMethod")}</h3>
          {d.byMethod.length === 0 ? <p className="text-sm text-muted-foreground">{t("today.none")}</p> : <ul className="space-y-2">{d.byMethod.map((m) => <li key={m.method} className="text-sm"><div className="flex justify-between"><span>{t(`method.${m.method}`)} <span className="text-muted-foreground">· {m.count}</span></span><span className="tabular-nums">{money(m.amount)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${(m.amount / maxMethod) * 100}%` }} /></div></li>)}</ul>}
        </section>
        <section className="rounded-2xl border bg-card p-4"><h3 className="mb-3 font-medium">{t("today.top")}</h3>
          {d.top.length === 0 ? <p className="text-sm text-muted-foreground">{t("today.none")}</p> : <ul className="divide-y text-sm">{d.top.map((i) => <li key={i.name} className="flex justify-between gap-3 py-2"><span className="truncate">{i.name} <span className="text-muted-foreground">× {i.qty}</span></span><span className="tabular-nums">{money(i.amount)}</span></li>)}</ul>}
        </section>
      </div>
      {cash ? (
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="flex items-center gap-2 font-medium"><Landmark className="h-4 w-4" />{t("closeout.drawer")}</h3><p className="mt-1 text-sm text-muted-foreground">{t("closeout.expectedNow", { amount: money(cash.shift.expectedCash), count: cash.shift.salesCount })}</p></div>
            {canCheckout ? <Button variant="outline" size="sm" onClick={() => setClosing(true)}>{t("closeout.start")}</Button> : null}
          </div>
          {cash.recent.length > 0 ? (
            <ul className="mt-3 divide-y border-t text-sm">{cash.recent.slice(0, 4).map((c) => <li key={c.id} className="flex items-center justify-between gap-3 py-2"><span className="text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(c.closedAt))}</span><span className="tabular-nums">{money(c.countedCash)}</span><span className={c.variance === 0 ? "text-emerald-600" : "text-amber-600"}>{c.variance === 0 ? t("closeout.balancedShort") : `${c.variance > 0 ? "+" : "−"}${money(Math.abs(c.variance))}`}</span></li>)}</ul>
          ) : null}
        </section>
      ) : null}
      <section className="rounded-2xl border bg-card"><h3 className="flex items-center gap-2 border-b p-4 font-medium"><Receipt className="h-4 w-4" />{t("today.recent")}</h3>
        {d.recent.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{t("today.none")}</p> : (
          <ul className="divide-y">{d.recent.map((s) => <li key={s.id} className="flex items-center gap-3 p-3 text-sm"><div className="min-w-0 flex-1"><p className="font-medium">{s.number}</p><p className="truncate text-xs text-muted-foreground">{fmt.format(new Date(s.at))}{s.customer ? ` · ${s.customer}` : ""}{s.method ? ` · ${t(`method.${s.method}`)}` : ""}</p></div><span className="font-semibold tabular-nums">{money(s.total)}</span><Button asChild size="icon" variant="ghost" aria-label={t("receipt")}><a href={`/api/pos/receipts/${s.id}`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" /></a></Button>{canRefund ? <Button size="icon" variant="ghost" className="text-rose-600" aria-label={t("refund.action", { number: s.number })} onClick={() => setRefund({ id: s.id, number: s.number, total: s.total, method: s.method })}><Undo2 className="h-4 w-4" /></Button> : null}</li>)}</ul>
        )}
      </section>
      <CloseoutDialog open={closing} shift={cash?.shift ?? null} money={money} onClose={() => setClosing(false)} onDone={onChanged} />
      <RefundDialog target={refund} money={money} onClose={() => setRefund(null)} onDone={onChanged} />
    </div>
  );
}
