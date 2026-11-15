"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { InventoryArt } from "./art/InventoryArt";
import type { PoDraftLine } from "./PoComposer";
import type { Insights } from "./shared";

export function ReorderPanel({ data, money, num, canEdit, onCreate }: { data: Insights; money: (n: number) => string; num: (n: number) => string; canEdit: boolean; onCreate: (lines: PoDraftLine[]) => void }) {
  const t = useTranslations("InventoryHub");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const rows = data.reorder;
  if (rows.length === 0) return <div className="rounded-3xl border border-dashed p-8 text-center"><InventoryArt variant="ok" className="mx-auto max-w-[220px]" /><p className="mt-3 font-medium">{t("reorder.noneTitle")}</p><p className="text-sm text-muted-foreground">{t("reorder.noneBody")}</p></div>;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = rows.filter((r) => picked.has(r.productId));
  const total = chosen.reduce((s, r) => s + r.estimatedCost, 0);
  const create = () => onCreate(chosen.map((r) => ({ productId: r.productId, name: r.name, unit: r.unit, quantity: r.suggestedQty, unitPrice: r.suggestedQty > 0 ? r.estimatedCost / r.suggestedQty : 0 })));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("reorder.intro")}</p>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {rows.map((r) => (
          <li key={r.productId} className="flex items-center gap-3 p-3">
            {canEdit ? <Checkbox checked={picked.has(r.productId)} onCheckedChange={() => toggle(r.productId)} aria-label={t("reorder.select", { name: r.name })} /> : null}
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{t("reorder.stockLine", { stock: num(r.currentStock), unit: r.unit })}{r.onOrder > 0 ? ` · ${t("reorder.onOrder", { n: num(r.onOrder) })}` : ""}{r.daysOfCover !== null ? ` · ${t("reorder.cover", { days: Math.round(r.daysOfCover) })}` : ""} · {t(`reorder.reason.${r.reason}`)}</p></div>
            <div className="text-end text-sm tabular-nums"><p className="font-semibold">+{num(r.suggestedQty)}</p><p className="text-xs text-muted-foreground">{money(r.estimatedCost)}</p></div>
            <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-xs sm:inline", r.urgency === "NOW" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/15 text-amber-700")}>{t(`reorder.urgency.${r.urgency}`)}</span>
          </li>
        ))}
      </ul>
      {canEdit ? (
        <div className="sticky bottom-above-nav flex items-center justify-between gap-3 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm">{chosen.length > 0 ? t("reorder.selected", { count: chosen.length, total: money(total) }) : t("reorder.pick")}</span>
          <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setPicked(new Set(rows.map((r) => r.productId)))}>{t("reorder.selectAll")}</Button><Button size="sm" className="gap-1.5" disabled={chosen.length === 0} onClick={create}><ShoppingCart className="h-4 w-4" />{t("reorder.createPo")}</Button></div>
        </div>
      ) : null}
    </div>
  );
}
