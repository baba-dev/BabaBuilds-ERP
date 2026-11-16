"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PackagePlus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, type CatalogProduct } from "./shared";

/** What is for sale: every product, with a switch to list it in the shop. Stock and price come from Inventory. */
export function CatalogPanel({ canManage, money, reloadKey, onChanged }: { canManage: boolean; money: (n: number) => string; reloadKey: number; onChanged: () => void }) {
  const t = useTranslations("ShopHub");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"ALL" | "LISTED" | "UNLISTED">("ALL");
  const [state, setState] = useState<{ key: number | null; items: CatalogProduct[]; error: string | null }>({ key: null, items: [], error: null });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ items: CatalogProduct[] }>("/api/inventory/products?limit=200&sort=name")
      .then((d) => { if (!cancelled) setState({ key: reloadKey, items: d.items, error: null }); })
      .catch((e) => { if (!cancelled) setState({ key: reloadKey, items: [], error: e instanceof Error ? e.message : "error" }); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const loading = state.key !== reloadKey;
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.items.filter((p) => (only === "ALL" || (only === "LISTED") === p.showInShop) && (!needle || `${p.name} ${p.sku} ${p.category ?? ""}`.toLowerCase().includes(needle)));
  }, [state.items, q, only]);

  const toggle = async (p: CatalogProduct, on: boolean) => {
    setBusyId(p.id);
    try {
      const fd = new FormData();
      fd.set("showInShop", on ? "true" : "false");
      await api(`/api/inventory/products/${p.id}`, { method: "PUT", body: fd });
      setState((s) => ({ ...s, items: s.items.map((x) => (x.id === p.id ? { ...x, showInShop: on } : x)) }));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("catalog.failed"));
    } finally {
      setBusyId(null);
    }
  };

  const listed = state.items.filter((p) => p.showInShop).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("catalog.search")} className="ps-9" aria-label={t("catalog.search")} /></div>
        <div className="flex rounded-lg border text-xs" role="group" aria-label={t("catalog.filter")}>
          {(["ALL", "LISTED", "UNLISTED"] as const).map((k) => <button key={k} type="button" aria-pressed={only === k} onClick={() => setOnly(k)} className={cn("px-3 py-2", only === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{t(`catalog.${k}`)}</button>)}
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/inventory?tab=products"><PackagePlus className="h-4 w-4" />{t("catalog.manage")}</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("catalog.summary", { listed, total: state.items.length })}</p>
      {state.error && state.items.length === 0 ? <p className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm">{state.error}</p>
        : loading && state.items.length === 0 ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        : rows.length === 0 ? <p className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">{state.items.length === 0 ? t("catalog.empty") : t("catalog.noMatch")}</p>
        : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.name}</p><p className="truncate text-xs text-muted-foreground">{p.sku}{p.category ? ` · ${p.category}` : ""}{p.gstRate != null ? ` · GST ${p.gstRate}%` : ""}</p></div>
                <div className="text-end text-sm tabular-nums"><p className="font-medium">{money(Number(p.baselinePrice))}</p><p className={cn("text-xs", p.currentStock <= 0 ? "text-rose-600" : "text-muted-foreground")}>{p.currentStock <= 0 ? t("catalog.outOfStock") : t("catalog.inStock", { count: p.currentStock })}</p></div>
                <Switch checked={p.showInShop} disabled={!canManage || busyId === p.id} onCheckedChange={(on) => void toggle(p, on)} aria-label={t("catalog.listIn", { name: p.name })} />
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
