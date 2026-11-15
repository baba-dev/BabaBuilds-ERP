"use client";

import { AlertTriangle, ArrowRight, Boxes, Coins, PackageX, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InventoryArt } from "./art/InventoryArt";
import type { Insights } from "./shared";

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: typeof Boxes; label: string; value: string; sub?: string; tone?: "warn" | "bad" | "good" }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={cn("h-4 w-4", tone === "bad" && "text-rose-500", tone === "warn" && "text-amber-500", tone === "good" && "text-emerald-500")} />{label}</div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function OverviewPanel({ data, money, num, onTab }: { data: Insights; money: (n: number) => string; num: (n: number) => string; onTab: (k: string) => void }) {
  const t = useTranslations("InventoryHub");
  const s = data.summary;
  const urgent = data.reorder.filter((r) => r.urgency === "NOW");
  const empty = (s.products ?? 0) === 0 && s.units === 0;
  return (
    <div className="space-y-5">
      <section className="grid items-center gap-4 overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-card to-emerald-500/10 p-5 md:grid-cols-[1fr_280px]">
        <div>
          <h2 className="text-xl font-semibold">{empty ? t("overview.emptyTitle") : t("overview.heroTitle", { value: money(s.stockValue) })}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{empty ? t("overview.emptyBody") : t("overview.heroBody", { units: num(s.units), margin: money(s.potentialMargin), pct: s.marginPct })}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onTab("products")}>{t("overview.viewProducts")}</Button>
            {urgent.length > 0 ? <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onTab("reorder")}><AlertTriangle className="h-4 w-4 text-amber-500" />{t("overview.reorderNow", { count: urgent.length })}</Button> : null}
          </div>
        </div>
        <InventoryArt variant={empty ? "empty" : "hero"} className="mx-auto max-w-[280px]" />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Coins} label={t("kpi.stockValue")} value={money(s.stockValue)} sub={t("kpi.atCost")} />
        <Kpi icon={TrendingUp} label={t("kpi.retailValue")} value={money(s.retailValue)} sub={t("kpi.margin", { pct: s.marginPct })} tone="good" />
        <Kpi icon={AlertTriangle} label={t("kpi.low")} value={num(s.lowStock)} sub={t("kpi.belowSafety")} tone={s.lowStock ? "warn" : undefined} />
        <Kpi icon={PackageX} label={t("kpi.out")} value={num(s.outOfStock)} sub={s.negativeStock ? t("kpi.negative", { count: s.negativeStock }) : t("kpi.cantSell")} tone={s.outOfStock ? "bad" : undefined} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="font-medium">{t("overview.reorderTitle")}</h3><Button variant="ghost" size="sm" className="gap-1" onClick={() => onTab("reorder")}>{t("overview.seeAll")}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Button></div>
          {data.reorder.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("overview.reorderNone")}</p> : (
            <ul className="mt-2 divide-y">
              {data.reorder.slice(0, 5).map((r) => (
                <li key={r.productId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{t("reorder.stockLine", { stock: num(r.currentStock), unit: r.unit })}{r.daysOfCover !== null ? ` · ${t("reorder.cover", { days: Math.round(r.daysOfCover) })}` : ""}</p></div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", r.urgency === "NOW" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/15 text-amber-700")}>{t(`reorder.urgency.${r.urgency}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between"><h3 className="font-medium">{t("overview.deadTitle")}</h3><span className="text-xs text-muted-foreground">{t("overview.deadSub", { days: data.dead.days })}</span></div>
          {data.dead.items.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("overview.deadNone")}</p> : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{t("overview.deadTied", { value: money(data.dead.tiedUp) })}</p>
              <ul className="mt-2 divide-y">
                {data.dead.items.slice(0, 5).map((d) => (
                  <li key={d.productId} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0 truncate">{d.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{money(d.tiedUp)}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
