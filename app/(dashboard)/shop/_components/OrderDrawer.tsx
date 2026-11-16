"use client";

import { useState } from "react";
import { Ban, CheckCircle2, ExternalLink, Loader2, PackageCheck, Receipt, Trash2, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type Order } from "./shared";
import { StatusPill } from "./StatusPill";

type Panel = null | "ship" | "refund" | "delete";

/** One order in full: who, what, where, how it was paid, and what to do next. */
export function OrderDrawer({ order, canManage, money, locale, onClose, onChanged }: { order: Order | null; canManage: boolean; money: (n: number, cur: string) => string; locale: string; onClose: () => void; onChanged: () => void }) {
  return (
    <Sheet open={Boolean(order)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {order ? <Body key={order.id} order={order} canManage={canManage} money={money} locale={locale} onClose={onClose} onChanged={onChanged} /> : <SheetHeader><SheetTitle>&nbsp;</SheetTitle></SheetHeader>}
      </SheetContent>
    </Sheet>
  );
}

function Body({ order, canManage, money, locale, onClose, onChanged }: { order: Order; canManage: boolean; money: (n: number, cur: string) => string; locale: string; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("ShopHub");
  const [panel, setPanel] = useState<Panel>(null);
  const [courier, setCourier] = useState(order.courier ?? "");
  const [tracking, setTracking] = useState(order.trackingRef ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(order.internalNote ?? "");
  const [busy, setBusy] = useState(false);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const when = (d: string | null) => (d ? fmt.format(new Date(d)) : null);

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await api(`/api/shop/orders/${order.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(ok);
      setPanel(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("order.failed"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/shop/orders/${order.id}`, { method: "DELETE" });
      toast.success(t("order.deleted"));
      onChanged(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("order.failed"));
    } finally {
      setBusy(false);
    }
  };

  const s = order.status;
  const paidIn = s === "PAID" || s === "SHIPPED" || s === "FULFILLED" || s === "REFUND_DUE";
  const timeline = [
    [t("order.t.placed"), when(order.createdAt)], [t("order.t.paid"), when(order.paidAt)], [t("order.t.shipped"), when(order.shippedAt)], [t("order.t.delivered"), when(order.fulfilledAt)], [t("order.t.refunded"), when(order.refundedAt)],
  ].filter(([, w]) => w) as [string, string][];

  return (
    <>
      <SheetHeader><SheetTitle className="flex items-center gap-2">#{order.id.slice(-8).toUpperCase()} <StatusPill status={s} /></SheetTitle></SheetHeader>
      <div className="space-y-5 px-4 pb-6">
        {s === "REFUND_DUE" ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm">{t("order.refundDueNote")}</p> : null}

        <section className="rounded-xl border p-3 text-sm">
          <p className="font-medium">{order.buyerName}</p>
          <p className="text-muted-foreground">{order.buyerEmail}{order.buyerPhone ? ` · ${order.buyerPhone}` : ""}</p>
          {order.buyerGstin ? <p className="text-xs text-muted-foreground">GSTIN {order.buyerGstin}</p> : null}
          {order.shippingAddress ? <p className="mt-2 whitespace-pre-line">{order.shippingAddress}</p> : null}
          {order.buyerNote ? <p className="mt-2 rounded-lg bg-muted/60 p-2 text-xs"><span className="font-medium">{t("order.buyerNote")}:</span> {order.buyerNote}</p> : null}
        </section>

        <section>
          <ul className="divide-y rounded-xl border text-sm">
            {order.items.map((i, idx) => <li key={`${i.productName}-${idx}`} className="flex items-center justify-between gap-3 p-2.5"><span className="min-w-0 truncate">{i.productName} <span className="text-muted-foreground">× {i.quantity}</span></span><span className="tabular-nums">{money(Number(i.lineTotal ?? Number(i.unitPrice) * i.quantity), order.currency)}</span></li>)}
          </ul>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><dt>{t("order.subtotal")}</dt><dd className="tabular-nums">{money(Number(order.subtotal), order.currency)}</dd></div>
            {Number(order.taxTotal) > 0 ? <div className="flex justify-between text-muted-foreground"><dt>GST</dt><dd className="tabular-nums">{money(Number(order.taxTotal), order.currency)}</dd></div> : null}
            <div className="flex justify-between border-t pt-1 font-semibold"><dt>{t("order.total")}</dt><dd className="tabular-nums">{money(Number(order.amount), order.currency)}</dd></div>
          </dl>
        </section>

        <section className="space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">{t("order.payment")}</p>
          <p>{order.gateway ?? "—"}{order.razorpayPaymentId || order.stripePaymentIntentId ? ` · ${order.razorpayPaymentId ?? order.stripePaymentIntentId}` : ""}</p>
          {order.linkedInvoice ? <Link href="/income" className="inline-flex items-center gap-1.5 text-primary hover:underline"><Receipt className="h-4 w-4" />{t("order.invoice", { number: order.linkedInvoice.invoiceNumber })}<ExternalLink className="h-3 w-3" /></Link> : paidIn ? <p className="text-xs text-muted-foreground">{t("order.noInvoice")}</p> : null}
          {order.trackingRef ? <p className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-muted-foreground" />{order.courier ? `${order.courier} · ` : ""}{order.trackingRef}</p> : null}
        </section>

        {timeline.length > 0 ? <ol className="space-y-1 border-s ps-3 text-xs text-muted-foreground">{timeline.map(([k, w]) => <li key={k}><span className="font-medium text-foreground">{k}</span> · {w}</li>)}</ol> : null}

        {canManage ? (
          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {s === "PAID" ? <Button size="sm" className="gap-1.5" onClick={() => setPanel(panel === "ship" ? null : "ship")}><Truck className="h-4 w-4" />{t("order.ship")}</Button> : null}
              {s === "PAID" || s === "SHIPPED" ? <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => void run({ action: "DELIVER" }, t("order.delivered"))}><PackageCheck className="h-4 w-4" />{t("order.deliver")}</Button> : null}
              {s === "PENDING" || s === "FAILED" ? <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => void run({ action: "MARK_PAID" }, t("order.markedPaid"))}><CheckCircle2 className="h-4 w-4" />{t("order.markPaid")}</Button> : null}
              {["PAID", "SHIPPED", "FULFILLED", "REFUND_DUE"].includes(s) ? <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" onClick={() => setPanel(panel === "refund" ? null : "refund")}><Undo2 className="h-4 w-4" />{t("order.refund")}</Button> : null}
              {s === "PENDING" || s === "FAILED" ? <Button size="sm" variant="ghost" className="gap-1.5 text-rose-600" onClick={() => setPanel(panel === "delete" ? null : "delete")}><Trash2 className="h-4 w-4" />{t("order.delete")}</Button> : null}
            </div>
            {panel === "ship" ? (
              <div className="space-y-2 rounded-xl border p-3">
                <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="sh-c">{t("order.courier")}</Label><Input id="sh-c" value={courier} maxLength={60} onChange={(e) => setCourier(e.target.value)} /></div><div><Label htmlFor="sh-t">{t("order.tracking")}</Label><Input id="sh-t" value={tracking} maxLength={80} onChange={(e) => setTracking(e.target.value)} /></div></div>
                <p className="text-xs text-muted-foreground">{t("order.shipHint")}</p>
                <Button size="sm" disabled={busy} onClick={() => void run({ action: "SHIP", courier: courier || null, trackingRef: tracking || null }, t("order.shipped"))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("order.shipConfirm")}</Button>
              </div>
            ) : null}
            {panel === "refund" ? (
              <div className="space-y-2 rounded-xl border border-rose-500/30 p-3">
                <p className="text-xs text-muted-foreground">{t("order.refundHint")}</p>
                <div><Label htmlFor="rf-r">{t("order.refundReason")}</Label><Input id="rf-r" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></div>
                <Button size="sm" variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void run({ action: "REFUND", reason: reason.trim() }, t("order.refunded"))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("order.refundConfirm")}</Button>
              </div>
            ) : null}
            {panel === "delete" ? (
              <div className="space-y-2 rounded-xl border border-rose-500/30 p-3"><p className="text-sm">{t("order.deleteHint")}</p><Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}><Ban className="me-1.5 h-4 w-4" />{t("order.deleteConfirm")}</Button></div>
            ) : null}
            <div><Label htmlFor="or-note">{t("order.internalNote")}</Label><div className="flex gap-2"><Input id="or-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("order.internalNoteHint")} /><Button size="sm" variant="outline" disabled={busy || note === (order.internalNote ?? "")} onClick={() => void run({ action: "NOTE", note }, t("order.noteSaved"))}>{t("order.save")}</Button></div></div>
          </section>
        ) : order.internalNote ? <p className="rounded-lg bg-muted/60 p-2 text-xs">{order.internalNote}</p> : null}
      </div>
    </>
  );
}
