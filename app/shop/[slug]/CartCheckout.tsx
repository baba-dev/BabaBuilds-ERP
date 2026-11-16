"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GST_STATES } from "@/lib/gst/states";
import { computePosTotals } from "@/lib/pos/totals";

export type CartProduct = { id: string; name: string; price: number; taxRate: number; currentStock: number; sku: string };
export type CartEntry = { product: CartProduct; quantity: number };

type Step = "cart" | "details" | "processing" | "success" | "refund";

/** The basket and checkout: review items, enter delivery details, pay with the shop's gateway. */
export function CartCheckout({ lines, currency, chargesGst, slug, accent, onQty, onRemove, onClose, onPaid }: {
  lines: CartEntry[]; currency: string; chargesGst: boolean; slug: string; accent: string;
  onQty: (id: string, qty: number) => void; onRemove: (id: string) => void; onClose: () => void; onPaid: () => void;
}) {
  const [step, setStep] = useState<Step>("cart");
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "", address: "", note: "", state: "", gstin: "" });
  const [loading, setLoading] = useState(false);
  const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
  const totals = useMemo(() => computePosTotals(lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity, taxRate: l.product.taxRate })), 0, chargesGst), [lines, chargesGst]);
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/shop/${slug}/order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
          buyerName: buyer.name, buyerEmail: buyer.email, buyerPhone: buyer.phone || undefined, buyerNote: buyer.note || undefined, shippingAddress: buyer.address,
          buyerStateCode: buyer.state || undefined, buyerGstin: buyer.gstin || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to start checkout."); setLoading(false); return; }

      if (data.gateway === "STRIPE") { window.location.href = data.sessionUrl; return; }

      setStep("processing");
      const rzp = new window.Razorpay!({
        key: data.keyId, amount: data.amount, currency: data.currency, order_id: data.rpOrderId, name: data.shopName, description: `${count} item${count === 1 ? "" : "s"}`,
        prefill: data.prefill, theme: { color: accent },
        handler: async (response: RazorpaySuccessResponse) => {
          const verify = await fetch(`/api/shop/${slug}/verify`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shopOrderId: data.orderId, razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }),
          });
          const v = await verify.json().catch(() => ({}));
          if (verify.ok) { setStep("success"); onPaid(); }
          else if (v.refundDue) setStep("refund");
          else { toast.error("We could not confirm your payment. If you were charged, please contact the shop."); setStep("details"); }
        },
        modal: { ondismiss: () => setStep("details") },
      });
      rzp.open();
      setLoading(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const addressOk = buyer.address.trim().length >= 10;
  const field = "text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400";
  return (
    <Dialog open onOpenChange={(o) => { if (!o && step !== "processing") onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-[520px]">
        {step === "success" ? (
          <div className="space-y-4 p-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40"><Check className="h-8 w-8 text-emerald-600" /></div>
            <h2 className="text-2xl font-extrabold tracking-tight">Order placed</h2>
            <p className="text-sm text-zinc-500">Thank you! We have emailed you a confirmation and will send tracking details when your order ships.</p>
            <Button onClick={onClose} className="px-8 text-white" style={{ background: accent }}>Continue shopping</Button>
          </div>
        ) : step === "refund" ? (
          <div className="space-y-4 p-10 text-center">
            <h2 className="text-xl font-extrabold tracking-tight">We are sorry — an item sold out</h2>
            <p className="text-sm text-zinc-500">Your payment went through, but one of the items sold out a moment before we could confirm it. You will be refunded in full, and we have emailed you the details.</p>
            <Button onClick={onClose} variant="outline">Close</Button>
          </div>
        ) : step === "processing" ? (
          <div className="space-y-4 p-10 text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin" style={{ color: accent }} /><p className="text-sm font-semibold text-zinc-600">Confirming your payment…</p></div>
        ) : (
          <>
            <div className="border-b bg-zinc-50/80 px-6 pb-4 pt-6 dark:bg-zinc-900/40">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">{step === "details" ? <button type="button" aria-label="Back to basket" onClick={() => setStep("cart")}><ArrowLeft className="h-4 w-4" /></button> : <ShoppingBag className="h-5 w-5" />}{step === "cart" ? `Your basket (${count})` : "Delivery and payment"}</DialogTitle>
                <DialogDescription>{step === "cart" ? "Check your items before you pay." : "Where should we send it?"}</DialogDescription>
              </DialogHeader>
            </div>

            {step === "cart" ? (
              <div className="space-y-4 p-6">
                {lines.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">Your basket is empty.</p> : (
                  <ul className="divide-y">
                    {lines.map((l) => (
                      <li key={l.product.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.product.name}</p><p className="text-xs text-zinc-500">{fmt(l.product.price)}{chargesGst && l.product.taxRate > 0 ? ` + ${l.product.taxRate}% GST` : ""}</p></div>
                        <div className="flex items-center rounded-lg border">
                          <button type="button" aria-label={`One less ${l.product.name}`} className="h-9 w-9 text-zinc-600 hover:bg-zinc-100" onClick={() => (l.quantity <= 1 ? onRemove(l.product.id) : onQty(l.product.id, l.quantity - 1))}><Minus className="mx-auto h-3.5 w-3.5" /></button>
                          <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{l.quantity}</span>
                          <button type="button" aria-label={`One more ${l.product.name}`} disabled={l.quantity >= l.product.currentStock} className="h-9 w-9 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40" onClick={() => onQty(l.product.id, l.quantity + 1)}><Plus className="mx-auto h-3.5 w-3.5" /></button>
                        </div>
                        <span className="w-20 text-right text-sm font-semibold tabular-nums">{fmt(l.product.price * l.quantity)}</span>
                        <button type="button" aria-label={`Remove ${l.product.name}`} className="text-zinc-400 hover:text-rose-600" onClick={() => onRemove(l.product.id)}><Trash2 className="h-4 w-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="space-y-1 border-t pt-3 text-sm">
                  <div className="flex justify-between text-zinc-500"><dt>Subtotal</dt><dd className="tabular-nums">{fmt(totals.subtotal)}</dd></div>
                  {chargesGst ? <div className="flex justify-between text-zinc-500"><dt>GST</dt><dd className="tabular-nums">{fmt(totals.tax)}</dd></div> : null}
                  <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{fmt(totals.total)}</dd></div>
                </dl>
                <Button className="h-11 w-full text-white" style={{ background: accent }} disabled={lines.length === 0} onClick={() => setStep("details")}>Continue</Button>
              </div>
            ) : (
              <form onSubmit={pay} className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1.5"><Label className={field}>Full name <span className="text-rose-500">*</span></Label><Input required value={buyer.name} maxLength={120} onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} className="h-10" autoComplete="name" /></div>
                  <div className="space-y-1.5"><Label className={field}>Email <span className="text-rose-500">*</span></Label><Input type="email" required value={buyer.email} onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} placeholder="you@example.com" className="h-10" autoComplete="email" /></div>
                  <div className="space-y-1.5"><Label className={field}>Phone</Label><Input value={buyer.phone} maxLength={24} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} className="h-10" autoComplete="tel" /></div>
                  <div className="col-span-2 space-y-1.5"><Label className={field}>Delivery address <span className="text-rose-500">*</span></Label><Textarea required rows={3} value={buyer.address} maxLength={400} onChange={(e) => setBuyer((b) => ({ ...b, address: e.target.value }))} placeholder="House / street, area, city, PIN code" autoComplete="street-address" /></div>
                  <div className="space-y-1.5"><Label className={field}>Delivery state</Label>
                    <select value={buyer.state} onChange={(e) => setBuyer((b) => ({ ...b, state: e.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select state</option>{GST_STATES.map((st) => <option key={st.code} value={st.code}>{st.name}</option>)}</select></div>
                  <div className="space-y-1.5"><Label className={field}>GSTIN (optional)</Label><Input value={buyer.gstin} maxLength={15} onChange={(e) => setBuyer((b) => ({ ...b, gstin: e.target.value.toUpperCase() }))} placeholder="For a GST invoice" className="h-10" /></div>
                  <div className="col-span-2 space-y-1.5"><Label className={field}>Note to the seller</Label><Textarea rows={2} value={buyer.note} maxLength={500} onChange={(e) => setBuyer((b) => ({ ...b, note: e.target.value }))} /></div>
                </div>
                <Button type="submit" disabled={loading || !addressOk} className="h-11 w-full text-white" style={{ background: accent }}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ${fmt(totals.total)}`}</Button>
                <p className="text-[11px] leading-relaxed text-zinc-500">By continuing, you agree to our <a className="underline" href="/terms">Terms</a>, <a className="underline" href="/privacy">Privacy Policy</a> and <a className="underline" href="/refund-cancellation">Refund &amp; Cancellation Policy</a>.</p>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
