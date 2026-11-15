"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Loader2, PackagePlus, Pencil, ScanLine, Search, SlidersHorizontal, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductFormModal } from "@/components/inventory/ProductFormModal";
import { MobileScanner } from "@/components/inventory/MobileScanner";
import type { InventoryProduct } from "@/lib/types/inventory";
import { InventoryArt } from "./art/InventoryArt";
import { api, type Product, type ProductList, type StockStatus } from "./shared";
import { StatusBadge } from "./StatusBadge";
import { StockDialog } from "./StockDialog";

export function ProductsPanel({ canEdit, money, num, reloadKey, onChanged, initialStatus }: { canEdit: boolean; money: (n: number) => string; num: (n: number) => string; reloadKey: number; onChanged: () => void; initialStatus?: StockStatus }) {
  const t = useTranslations("InventoryHub");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StockStatus | "">(initialStatus ?? "");
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [edit, setEdit] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (more: string | null) => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: "50", archived: String(archived) });
      if (q.trim()) p.set("q", q.trim());
      if (status) p.set("status", status);
      if (category) p.set("category", category);
      if (more) p.set("cursor", more);
      const d = await api<ProductList>(`/api/inventory/products?${p}`);
      if (my !== seq.current) return;
      setItems((prev) => (more ? [...prev, ...d.items] : d.items));
      setCursor(d.nextCursor);
      setCategories(d.categories);
      setError(null);
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : "error");
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [q, status, category, archived]);

  useEffect(() => { const h = setTimeout(() => void load(null), q ? 250 : 0); return () => clearTimeout(h); }, [load, reloadKey, q]);

  const archive = async (p: Product, restore = false) => {
    try {
      const r = await api<{ archived?: boolean }>(`/api/inventory/products/${p.id}${restore ? "?restore=1" : ""}`, { method: "DELETE" });
      toast.success(restore ? t("products.restored") : r.archived ? t("products.archived") : t("products.deleted"));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("products.failed"));
    }
  };

  const sel = "h-9 rounded-lg border bg-background px-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("products.search")} className="ps-9" aria-label={t("products.search")} /></div>
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value as StockStatus | "")} aria-label={t("products.status")}><option value="">{t("products.allStatus")}</option>{(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
        {categories.length > 0 ? <select className={sel} value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("products.category")}><option value="">{t("products.allCategories")}</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select> : null}
        <Button variant={archived ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setArchived((a) => !a)}><Archive className="h-4 w-4" />{t("products.archivedToggle")}</Button>
        <Button variant="outline" size="sm" className="gap-1.5 sm:hidden" onClick={() => setScanning(true)}><ScanLine className="h-4 w-4" />{t("products.scan")}</Button>
        {canEdit ? <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}><PackagePlus className="h-4 w-4" />{t("products.add")}</Button> : null}
      </div>

      {error && items.length === 0 ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm">{error}<div className="mt-3"><Button size="sm" variant="outline" onClick={() => void load(null)}>{t("retry")}</Button></div></div>
        : loading && items.length === 0 ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-8 text-center"><InventoryArt variant="empty" className="mx-auto max-w-[220px]" /><p className="mt-3 font-medium">{q || status || category ? t("products.noMatch") : archived ? t("products.noneArchived") : t("products.empty")}</p>{canEdit && !q && !status && !archived ? <Button className="mt-3" onClick={() => setCreating(true)}>{t("products.add")}</Button> : null}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <ul className="divide-y">
              {items.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.sku}{p.category ? ` · ${p.category}` : ""}{p.location ? ` · ${p.location}` : ""}</p>
                  </div>
                  <div className="text-end text-sm tabular-nums"><p className="font-semibold">{num(p.currentStock)} <span className="text-xs font-normal text-muted-foreground">{p.unit}</span></p><p className="text-xs text-muted-foreground">{money(Number(p.costPrice))} → {money(Number(p.baselinePrice))}</p></div>
                  <StatusBadge status={p.status} />
                  {canEdit ? (
                    <div className="ms-auto flex gap-1">
                      {!p.archivedAt ? <Button size="icon" variant="ghost" aria-label={t("products.adjust")} onClick={() => setAdjust(p)}><SlidersHorizontal className="h-4 w-4" /></Button> : null}
                      {!p.archivedAt ? <Button size="icon" variant="ghost" aria-label={t("products.edit")} onClick={() => setEdit(p)}><Pencil className="h-4 w-4" /></Button> : null}
                      {p.archivedAt ? <Button size="icon" variant="ghost" aria-label={t("products.restore")} onClick={() => void archive(p, true)}><Undo2 className="h-4 w-4" /></Button> : <Button size="icon" variant="ghost" aria-label={t("products.archive")} onClick={() => void archive(p)}><Archive className="h-4 w-4" /></Button>}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {cursor ? <div className="border-t p-3 text-center"><Button variant="outline" size="sm" onClick={() => void load(cursor)} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("loadMore")}</Button></div> : null}
          </div>
        )}

      <StockDialog product={adjust} onClose={() => setAdjust(null)} onDone={onChanged} />
      <ProductFormModal open={creating || Boolean(edit)} onOpenChange={(o) => { if (!o) { setCreating(false); setEdit(null); } }} productToEdit={edit ? (edit as unknown as InventoryProduct) : undefined} onSuccess={() => { setCreating(false); setEdit(null); onChanged(); }} />
      <MobileScanner open={scanning} onOpenChange={setScanning} onScan={(code: string) => { setQ(code); setScanning(false); }} />
    </div>
  );
}
