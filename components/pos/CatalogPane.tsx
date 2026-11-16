"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, PackageSearch, Plus, ScanLine, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileScanner } from "@/components/inventory/MobileScanner";
import { cn } from "@/lib/utils";
import { useDebounced } from "./hooks";
import { api, type CatalogItem, type CatalogPage } from "./shared";

type Props = {
  onAdd: (item: CatalogItem) => void;
  onMeta: (m: { chargesGst: boolean }) => void;
  reloadKey: number;
  money: (n: number) => string;
  canCustom: boolean;
  onCustom: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
};

export function CatalogPane({ onAdd, onMeta, reloadKey, money, canCustom, onCustom, searchRef }: Props) {
  const t = useTranslations("PosRegister");
  const [type, setType] = useState<"PRODUCTS" | "SERVICES">("PRODUCTS");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [scanning, setScanning] = useState(false);
  const dq = useDebounced(q.trim());
  const base = `/api/pos/catalog?${new URLSearchParams({ type, limit: "40", ...(dq ? { q: dq } : {}), ...(category && type === "PRODUCTS" ? { category } : {}) })}`;
  const key = `${base}|${reloadKey}`;
  const [state, setState] = useState<{ key: string | null; items: CatalogItem[]; cursor: string | null; categories: string[]; error: string | null }>({ key: null, items: [], cursor: null, categories: [], error: null });
  const [moreBusy, setMoreBusy] = useState(false);
  const onMetaRef = useRef(onMeta);
  useEffect(() => { onMetaRef.current = onMeta; });

  useEffect(() => {
    let cancelled = false;
    api<CatalogPage>(base)
      .then((d) => { if (cancelled) return; setState({ key, items: d.items, cursor: d.nextCursor, categories: d.categories, error: null }); onMetaRef.current({ chargesGst: d.chargesGst }); })
      .catch((e) => { if (!cancelled) setState((s) => ({ ...s, key, error: e instanceof Error ? e.message : "error" })); });
    return () => { cancelled = true; };
  }, [base, key]);

  const loading = state.key !== key;
  const loadMore = async () => {
    if (!state.cursor) return;
    setMoreBusy(true);
    try {
      const d = await api<CatalogPage>(`${base}&cursor=${encodeURIComponent(state.cursor)}`);
      setState((s) => ({ ...s, items: [...s.items, ...d.items], cursor: d.nextCursor }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("catalogFailed"));
    } finally {
      setMoreBusy(false);
    }
  };

  /** A scanner or a barcode typed and sent with Enter: one exact match goes straight into the cart. */
  const lookup = useCallback(async (code: string) => {
    const c = code.trim();
    if (!c) return;
    try {
      const d = await api<CatalogPage>(`/api/pos/catalog?${new URLSearchParams({ type: "PRODUCTS", barcode: c, limit: "2" })}`);
      if (d.items.length === 1) { onAdd(d.items[0]!); setQ(""); } else if (d.items.length === 0) toast.warning(t("noBarcode", { code: c }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("catalogFailed"));
    }
  }, [onAdd, t]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-3 border-b bg-card p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:w-64" role="tablist">
          {(["PRODUCTS", "SERVICES"] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={type === k} onClick={() => { setType(k); setCategory(""); }} className={cn("rounded-lg py-1.5 text-sm transition-colors", type === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>{t(`tab.${k}`)}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && type === "PRODUCTS") { e.preventDefault(); void lookup(q); } }} placeholder={t("search")} className="h-11 ps-9 text-base" aria-label={t("search")} />
          </div>
          <Button variant="outline" className="h-11 gap-1.5 sm:hidden" onClick={() => setScanning(true)} aria-label={t("scan")}><ScanLine className="h-4 w-4" /></Button>
          {canCustom ? <Button variant="outline" className="h-11 gap-1.5 border-dashed" onClick={onCustom}><Plus className="h-4 w-4" /><span className="hidden sm:inline">{t("customItem")}</span></Button> : null}
        </div>
        {type === "PRODUCTS" && state.categories.length > 0 ? (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {["", ...state.categories].map((c) => <button key={c || "all"} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs transition-colors", category === c ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{c || t("allCategories")}</button>)}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {state.error && state.items.length === 0 ? <p className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm">{state.error}</p>
          : loading && state.items.length === 0 ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          : state.items.length === 0 ? <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground"><PackageSearch className="h-8 w-8 opacity-50" />{dq ? t("noMatch") : type === "PRODUCTS" ? t("noProducts") : t("noServices")}</div>
          : (
            <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4", loading && "opacity-60 transition-opacity")}>
              {state.items.map((item) => {
                const out = item.type === "PRODUCT" && (item.stock ?? 0) <= 0;
                return (
                  <button key={item.id} type="button" disabled={out} onClick={() => onAdd(item)} className={cn("flex min-h-24 flex-col justify-between rounded-2xl border bg-card p-3 text-start transition active:scale-[0.98]", out ? "cursor-not-allowed opacity-50" : "hover:border-primary/50 hover:shadow-md")}>
                    <span className="line-clamp-2 text-sm font-medium leading-snug">{item.name}</span>
                    <span>
                      <span className="block text-base font-semibold tabular-nums">{money(item.price)}</span>
                      {item.type === "PRODUCT" ? <span className={cn("text-xs", out ? "text-rose-600" : (item.stock ?? 0) <= 5 ? "text-amber-600" : "text-muted-foreground")}>{out ? t("outOfStock") : t("inStock", { count: item.stock ?? 0 })}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        {state.cursor ? <div className="pt-4 text-center"><Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={moreBusy}>{moreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("loadMore")}</Button></div> : null}
      </div>
      <MobileScanner open={scanning} onOpenChange={setScanning} onScan={(code: string) => { setScanning(false); void lookup(code); }} />
    </div>
  );
}
