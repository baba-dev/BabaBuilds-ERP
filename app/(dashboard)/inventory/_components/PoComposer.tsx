"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounced } from "./hooks";
import { api, type Product, type ProductList, type VendorHit } from "./shared";

export type PoDraftLine = { productId: string; name: string; unit: string; quantity: number; unitPrice: number };

/** Create a purchase order, optionally prefilled from reorder suggestions. */
export function PoComposer({ open, initialLines, onClose, onDone, money }: { open: boolean; initialLines: PoDraftLine[]; onClose: () => void; onDone: () => void; money: (n: number) => string }) {
  return open ? <ComposerBody initialLines={initialLines} onClose={onClose} onDone={onDone} money={money} /> : null;
}

function ComposerBody({ initialLines, onClose, onDone, money }: { initialLines: PoDraftLine[]; onClose: () => void; onDone: () => void; money: (n: number) => string }) {
  const t = useTranslations("InventoryHub");
  const [supplier, setSupplier] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [gstin, setGstin] = useState("");
  const [vendors, setVendors] = useState<VendorHit[]>([]);
  const dsupplier = useDebounced(supplier.trim());
  const [expected, setExpected] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PoDraftLine[]>(initialLines);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Product[]>([]);
  const dsearch = useDebounced(search.trim());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!dsearch) return;
    let cancelled = false;
    api<ProductList>(`/api/inventory/products?limit=8&q=${encodeURIComponent(dsearch)}`).then((d) => { if (!cancelled) setFound(d.items); }).catch(() => { if (!cancelled) setFound([]); });
    return () => { cancelled = true; };
  }, [dsearch]);
  useEffect(() => {
    if (!dsupplier) return;
    let cancelled = false;
    api<{ items: VendorHit[] }>(`/api/inventory/vendors?q=${encodeURIComponent(dsupplier)}`).then((d) => { if (!cancelled) setVendors(d.items); }).catch(() => { if (!cancelled) setVendors([]); });
    return () => { cancelled = true; };
  }, [dsupplier]);
  const vendorHits = dsupplier && supplier.trim() && !vendorId ? vendors.filter((v) => v.name.toLowerCase() !== supplier.trim().toLowerCase()) : [];
  const pickVendor = (v: VendorHit) => { setSupplier(v.name); setVendorId(v.id); if (v.gstin) setGstin(v.gstin); if (v.paymentTermsDays) setTerms(String(v.paymentTermsDays)); setVendors([]); };
  const results = dsearch && search.trim() ? found : [];

  const total = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), [lines]);
  const valid = supplier.trim().length > 0 && lines.length > 0 && lines.every((l) => l.quantity >= 1 && l.unitPrice >= 0);
  const patch = (i: number, p: Partial<PoDraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const add = (p: Product) => { if (!lines.some((l) => l.productId === p.id)) setLines((ls) => [...ls, { productId: p.id, name: p.name, unit: p.unit, quantity: p.reorderQuantity ?? 1, unitPrice: Number(p.costPrice) }]); setSearch(""); };

  const save = async (send: boolean) => {
    setBusy(true); setErr(null);
    try {
      await api("/api/inventory/purchase-orders", { method: "POST", body: JSON.stringify({ supplier: supplier.trim(), vendorId, supplierGstin: gstin || null, expectedDate: expected || null, paymentTermsDays: terms ? Number(terms) : null, notes: notes || null, send, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })) }) });
      toast.success(send ? t("po.sentToast") : t("po.draftToast"));
      onDone(); onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("po.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("po.newTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2"><Label htmlFor="po-sup">{t("po.supplier")}</Label><Input id="po-sup" value={supplier} maxLength={120} autoComplete="off" onChange={(e) => { setSupplier(e.target.value); setVendorId(null); }} />
            {vendorHits.length > 0 ? <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">{vendorHits.map((v) => <li key={v.id}><button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted" onClick={() => pickVendor(v)}><span className="truncate">{v.name}</span>{v.gstin ? <span className="text-xs text-muted-foreground">{v.gstin}</span> : null}</button></li>)}</ul> : null}
          </div>
          <div><Label htmlFor="po-gstin">{t("po.gstin")}</Label><Input id="po-gstin" value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} /></div>
          <div><Label htmlFor="po-exp">{t("po.expected")}</Label><Input id="po-exp" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
          <div><Label htmlFor="po-terms">{t("po.terms")}</Label><Input id="po-terms" inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="0" /></div>
          <div className="sm:col-span-3"><Label htmlFor="po-notes">{t("po.notes")}</Label><Input id="po-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div>
          <Label htmlFor="po-add">{t("po.addItem")}</Label>
          <div className="relative"><Input id="po-add" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("po.searchItem")} autoComplete="off" />
            {results.length > 0 ? <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-lg">{results.map((p) => <li key={p.id}><button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-muted" onClick={() => add(p)}><span className="truncate">{p.name}</span><span className="text-xs text-muted-foreground">{p.sku}</span></button></li>)}</ul> : null}
          </div>
        </div>
        {lines.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{t("po.noLines")}</p> : (
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={l.productId} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border p-2.5 sm:grid-cols-[1fr_90px_110px_auto]">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <Button size="icon" variant="ghost" className="sm:order-last" aria-label={t("po.removeLine")} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                <Input aria-label={t("po.qty")} inputMode="numeric" value={String(l.quantity)} onChange={(e) => patch(i, { quantity: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                <Input aria-label={t("po.unitPrice")} inputMode="decimal" value={String(l.unitPrice)} onChange={(e) => patch(i, { unitPrice: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-t pt-3"><span className="text-sm text-muted-foreground">{t("po.total")}</span><span className="text-lg font-semibold tabular-nums">{money(total)}</span></div>
        {err ? <p role="alert" className="text-sm text-rose-600">{err}</p> : null}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onClose}>{t("cancel")}</Button><Button variant="secondary" disabled={!valid || busy} onClick={() => void save(false)}>{t("po.saveDraft")}</Button><Button disabled={!valid || busy} onClick={() => void save(true)} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t("po.saveSend")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
