"use client";

import { useState } from "react";
import { Ban, ChevronDown, Loader2, PackageCheck, Plus, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { InventoryArt } from "./art/InventoryArt";
import { PoComposer } from "./PoComposer";
import { usePaged } from "./hooks";
import { api, type PurchaseOrder } from "./shared";

const EMPTY: import("./PoComposer").PoDraftLine[] = [];
const TONE: Record<PurchaseOrder["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground", SENT: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", PARTIAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  DELIVERED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", CANCELLED: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function ReceiveDialog({ po, onClose, onDone }: { po: PurchaseOrder | null; onClose: () => void; onDone: () => void }) {
  return po ? <ReceiveBody key={po.id} po={po} onClose={onClose} onDone={onDone} /> : null;
}

function ReceiveBody({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("InventoryHub");
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(po.items.map((i) => [i.id, String(i.quantity - i.receivedQuantity)])));
  const [sync, setSync] = useState(true);
  const [invoice, setInvoice] = useState("");
  const [gstin, setGstin] = useState(po.supplierGstin ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lines = po.items.map((i) => ({ item: i, outstanding: i.quantity - i.receivedQuantity, n: Math.floor(Number(qty[i.id] ?? 0)) }));
  const bad = lines.some((l) => l.n < 0 || l.n > l.outstanding || Number.isNaN(l.n));
  const any = lines.some((l) => l.n > 0);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ status: string; units: number }>(`/api/inventory/purchase-orders/${po.id}/receive`, { method: "POST", body: JSON.stringify({ lines: lines.filter((l) => l.n > 0).map((l) => ({ itemId: l.item.id, quantity: l.n })), syncExpense: sync, supplierInvoiceNo: invoice || null, supplierGstin: gstin || null }) });
      toast.success(r.status === "DELIVERED" ? t("receive.doneFull") : t("receive.donePartial", { units: r.units }));
      onDone(); onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("receive.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t("receive.title", { po: po.poNumber })}</DialogTitle></DialogHeader>
        <ul className="space-y-2">
          {lines.filter((l) => l.outstanding > 0).map((l) => (
            <li key={l.item.id} className="flex items-center gap-3 rounded-xl border p-2.5">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{l.item.product.name}</p><p className="text-xs text-muted-foreground">{t("receive.outstanding", { n: l.outstanding, unit: l.item.product.unit })}</p></div>
              <Input className={cn("w-24 text-end", (l.n > l.outstanding || l.n < 0) && "border-rose-500")} inputMode="numeric" aria-label={t("receive.qtyFor", { name: l.item.product.name })} value={qty[l.item.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.item.id]: e.target.value.replace(/\D/g, "") }))} />
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="rc-inv">{t("receive.invoiceNo")}</Label><Input id="rc-inv" value={invoice} maxLength={60} onChange={(e) => setInvoice(e.target.value)} /></div>
          <div><Label htmlFor="rc-gstin">{t("receive.gstin")}</Label><Input id="rc-gstin" value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} /></div>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><span><span className="font-medium">{t("receive.sync")}</span><span className="block text-xs text-muted-foreground">{t("receive.syncHint")}</span></span><Switch checked={sync} onCheckedChange={setSync} /></label>
        {err ? <p role="alert" className="text-sm text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{t("cancel")}</Button><Button disabled={!any || bad || busy} onClick={() => void submit()} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}{t("receive.confirm")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

export function OrdersPanel({ canEdit, money, locale, reloadKey, onChanged, composeOpen, onComposeClose, prefill }: { canEdit: boolean; money: (n: number) => string; locale: string; reloadKey: number; onChanged: () => void; composeOpen: boolean; onComposeClose: () => void; prefill: import("./PoComposer").PoDraftLine[] }) {
  const t = useTranslations("InventoryHub");
  const [status, setStatus] = useState<"" | PurchaseOrder["status"]>("");
  const [open, setOpen] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [composeLocal, setComposeLocal] = useState(false);
  const list = usePaged<PurchaseOrder>("/api/inventory/purchase-orders", { limit: "30", status: status || undefined }, reloadKey);
  const { items, error, loading } = list;
  const cursor = list.hasMore;

  const act = async (po: PurchaseOrder, action: "send" | "cancel" | "reopen") => {
    try {
      await api(`/api/inventory/purchase-orders/${po.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      toast.success(t(`po.action.${action}`));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("po.failed"));
    }
  };
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const sel = "h-9 rounded-lg border bg-background px-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t("po.status")}><option value="">{t("po.allStatus")}</option>{(["DRAFT", "SENT", "PARTIAL", "DELIVERED", "CANCELLED"] as const).map((s) => <option key={s} value={s}>{t(`po.statusName.${s}`)}</option>)}</select>
        {canEdit ? <Button size="sm" className="ms-auto gap-1.5" onClick={() => setComposeLocal(true)}><Plus className="h-4 w-4" />{t("po.new")}</Button> : null}
      </div>
      {error && items.length === 0 ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center text-sm">{error}</div>
        : loading && items.length === 0 ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        : items.length === 0 ? <div className="rounded-3xl border border-dashed p-8 text-center"><InventoryArt variant="empty" className="mx-auto max-w-[220px]" /><p className="mt-3 font-medium">{t("po.empty")}</p></div>
        : (
          <ul className="space-y-2">
            {items.map((po) => {
              const ordered = po.items.reduce((s, i) => s + i.quantity, 0);
              const got = po.items.reduce((s, i) => s + i.receivedQuantity, 0);
              const pct = ordered ? Math.round((got / ordered) * 100) : 0;
              const isOpen = open === po.id;
              const canReceive = canEdit && (po.status === "SENT" || po.status === "PARTIAL" || po.status === "DRAFT");
              return (
                <li key={po.id} className="rounded-2xl border bg-card">
                  <button type="button" className="flex w-full items-center gap-3 p-3 text-start" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : po.id)}>
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{po.poNumber} · {po.supplier}</p><p className="text-xs text-muted-foreground">{money(Number(po.totalAmount))}{po.expectedDate ? ` · ${t("po.expectedOn", { date: dateFmt.format(new Date(po.expectedDate)) })}` : ""}</p>
                      {po.status !== "DRAFT" && po.status !== "CANCELLED" ? <div className="mt-1.5 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div> : null}</div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", TONE[po.status])}>{t(`po.statusName.${po.status}`)}</span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen ? (
                    <div className="space-y-3 border-t p-3">
                      <ul className="divide-y text-sm">{po.items.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{i.product.name}</span><span className="shrink-0 tabular-nums text-muted-foreground">{i.receivedQuantity}/{i.quantity} {i.product.unit} · {money(Number(i.unitPrice))}</span></li>)}</ul>
                      {po.notes ? <p className="text-sm text-muted-foreground">{po.notes}</p> : null}
                      {canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          {po.status === "DRAFT" ? <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void act(po, "send")}><Send className="h-4 w-4" />{t("po.send")}</Button> : null}
                          {canReceive ? <Button size="sm" className="gap-1.5" onClick={() => setReceiving(po)}><PackageCheck className="h-4 w-4" />{t("po.receive")}</Button> : null}
                          {(po.status === "DRAFT" || po.status === "SENT") && got === 0 ? <Button size="sm" variant="ghost" className="gap-1.5 text-rose-600" onClick={() => void act(po, "cancel")}><Ban className="h-4 w-4" />{t("po.cancel")}</Button> : null}
                          {po.status === "CANCELLED" ? <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void act(po, "reopen")}><Undo2 className="h-4 w-4" />{t("po.reopen")}</Button> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
            {cursor ? <li className="pt-1 text-center"><Button variant="outline" size="sm" onClick={() => void list.loadMore()} disabled={list.moreBusy}>{list.moreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("loadMore")}</Button></li> : null}
          </ul>
        )}
      <ReceiveDialog po={receiving} onClose={() => setReceiving(null)} onDone={onChanged} />
      <PoComposer open={composeOpen || composeLocal} initialLines={composeOpen ? prefill : EMPTY} money={money} onClose={() => { setComposeLocal(false); onComposeClose(); }} onDone={onChanged} />
    </div>
  );
}
