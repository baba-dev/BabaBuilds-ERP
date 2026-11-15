"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaged } from "./hooks";
import type { Movement } from "./shared";

const ICON = { IN: ArrowDownLeft, OUT: ArrowUpRight, ADJ: Scale } as const;

export function MovementsPanel({ reloadKey, locale }: { reloadKey: number; locale: string }) {
  const t = useTranslations("InventoryHub");
  const [type, setType] = useState<"" | "IN" | "OUT" | "ADJ">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = usePaged<Movement>("/api/inventory/movements", { limit: "50", type: type || undefined, from: from || undefined, to: to || undefined }, reloadKey);
  const { items, error, loading } = list;
  const cursor = list.hasMore;

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const sel = "h-9 rounded-lg border bg-background px-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={sel} value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label={t("movements.type")}><option value="">{t("movements.all")}</option>{(["IN", "OUT", "ADJ"] as const).map((k) => <option key={k} value={k}>{t(`movements.kind.${k}`)}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">{t("movements.from")}<input type="date" className={sel} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">{t("movements.to")}<input type="date" className={sel} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && items.length === 0 ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm">{error}</div>
        : loading && items.length === 0 ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        : items.length === 0 ? <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("movements.empty")}</p>
        : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <ul className="divide-y">
              {items.map((m) => {
                const Icon = ICON[m.type];
                const positive = m.quantity > 0;
                return (
                  <li key={m.id} className="flex items-center gap-3 p-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.product?.name ?? "—"}</p><p className="truncate text-xs text-muted-foreground">{m.reason ?? t(`movements.kind.${m.type}`)} · {fmt.format(new Date(m.createdAt))}</p></div>
                    <div className="text-end tabular-nums"><p className={`text-sm font-semibold ${positive ? "text-emerald-600" : "text-rose-600"}`}>{positive ? "+" : ""}{m.quantity}</p>{m.balanceAfter !== null ? <p className="text-xs text-muted-foreground">{t("movements.balance", { n: m.balanceAfter })}</p> : null}</div>
                  </li>
                );
              })}
            </ul>
            {cursor ? <div className="border-t p-3 text-center"><Button variant="outline" size="sm" onClick={() => void list.loadMore()} disabled={list.moreBusy}>{list.moreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("loadMore")}</Button></div> : null}
          </div>
        )}
    </div>
  );
}
