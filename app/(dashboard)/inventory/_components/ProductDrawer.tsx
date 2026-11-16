"use client";

import { useEffect, useState } from "react";
import { Boxes, Loader2, Pencil, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type ProductDetail } from "./shared";
import { StatusBadge } from "./StatusBadge";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

export function ProductDrawer({ productId, canEdit, money, num, locale, reloadKey, onClose, onAdjust, onEdit, onOrder }: {
  productId: string | null; canEdit: boolean; money: (n: number) => string; num: (n: number) => string; locale: string; reloadKey: number;
  onClose: () => void; onAdjust: (p: ProductDetail) => void; onEdit: (p: ProductDetail) => void; onOrder: (p: ProductDetail) => void;
}) {
  const t = useTranslations("InventoryHub");
  const [loaded, setLoaded] = useState<{ key: string; data: ProductDetail | null; error: string | null }>({ key: "", data: null, error: null });
  const key = `${productId}|${reloadKey}`;
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    api<ProductDetail>(`/api/inventory/products/${productId}`)
      .then((d) => { if (!cancelled) setLoaded({ key, data: d, error: null }); })
      .catch((e) => { if (!cancelled) setLoaded({ key, data: null, error: e instanceof Error ? e.message : "error" }); });
    return () => { cancelled = true; };
  }, [productId, key]);

  const p = loaded.key === key ? loaded.data : null;
  const busy = Boolean(productId) && loaded.key !== key;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Sheet open={Boolean(productId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-primary" />{p?.name ?? t("drawer.loading")}</SheetTitle></SheetHeader>
        {busy ? <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : loaded.error && !p ? <p className="p-4 text-sm text-rose-600">{loaded.error}</p> : p ? (
          <div className="space-y-5 px-4 pb-6">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{p.sku}</span>{p.category ? <span>· {p.category}</span> : null}{p.location ? <span>· {p.location}</span> : null}<StatusBadge status={p.status} /></div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t("drawer.onHand")} value={`${num(p.currentStock)} ${p.unit}`} hint={t("drawer.safety", { n: p.safetyStock })} />
              <Stat label={t("drawer.value")} value={money(p.stats.stockValue)} hint={t("drawer.unitCost", { cost: money(Number(p.costPrice)) })} />
              <Stat label={t("drawer.margin")} value={p.stats.marginPct === null ? "—" : `${p.stats.marginPct}%`} hint={t("drawer.sellsAt", { price: money(Number(p.baselinePrice)) })} />
              <Stat label={t("drawer.cover")} value={p.stats.daysOfCover === null ? "—" : t("drawer.days", { n: p.stats.daysOfCover })} hint={t("drawer.sold30", { n: p.stats.sold30 })} />
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => onAdjust(p)}><SlidersHorizontal className="h-4 w-4" />{t("products.adjust")}</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onEdit(p)}><Pencil className="h-4 w-4" />{t("products.edit")}</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onOrder(p)}><ShoppingCart className="h-4 w-4" />{t("drawer.order")}</Button>
              </div>
            ) : null}
            {p.onOrder.length > 0 ? (
              <section><h3 className="mb-2 text-sm font-medium">{t("drawer.onOrder")}</h3>
                <ul className="divide-y rounded-xl border text-sm">{p.onOrder.map((o) => <li key={o.poId} className="flex items-center justify-between gap-3 p-2.5"><span>{o.poNumber}</span><span className="text-muted-foreground tabular-nums">{t("drawer.arriving", { n: o.outstanding })}{o.expectedDate ? ` · ${fmt.format(new Date(o.expectedDate))}` : ""}</span></li>)}</ul>
              </section>
            ) : null}
            <section><h3 className="mb-2 text-sm font-medium">{t("drawer.history")}</h3>
              {p.movements.length === 0 ? <p className="text-sm text-muted-foreground">{t("movements.empty")}</p> : (
                <ul className="divide-y rounded-xl border text-sm">{p.movements.map((m) => <li key={m.id} className="flex items-center justify-between gap-3 p-2.5"><div className="min-w-0"><p className="truncate">{m.reason ?? t(`movements.kind.${m.type}`)}</p><p className="text-xs text-muted-foreground">{day.format(new Date(m.createdAt))}</p></div><div className="text-end tabular-nums"><p className={m.quantity > 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>{m.quantity > 0 ? "+" : ""}{m.quantity}</p>{m.balanceAfter !== null ? <p className="text-xs text-muted-foreground">{t("movements.balance", { n: m.balanceAfter })}</p> : null}</div></li>)}</ul>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
