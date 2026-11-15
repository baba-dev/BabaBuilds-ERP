"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { computePosTotals, percentDiscount } from "@/lib/pos/totals";
import { cn } from "@/lib/utils";
import { CartPane } from "./CartPane";
import { CatalogPane } from "./CatalogPane";
import { CustomItemDialog } from "./CustomItemDialog";
import { HeldDialog } from "./HeldDialog";
import { PaymentDialog, type Charge, type Outcome } from "./PaymentDialog";
import { api, type CartLine, type CatalogItem, type ClientOption, type Hold } from "./shared";
import { TodayPanel } from "./TodayPanel";

type Props = { clients: ClientOption[]; canCheckout: boolean; canCreateCustomItems: boolean; canApplyDiscounts: boolean; currencyCode: string; locale: string };

let seq = 0;
const lineKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function PosRegister({ clients, canCheckout, canCreateCustomItems, canApplyDiscounts, currencyCode, locale }: Props) {
  const t = useTranslations("PosRegister");
  const [view, setView] = useState<"register" | "today">("register");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState("");
  const [discountMode, setDiscountMode] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [discountInput, setDiscountInput] = useState("");
  const [chargesGst, setChargesGst] = useState(true);
  const [tick, setTick] = useState(0);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [custom, setCustom] = useState(false);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [showHolds, setShowHolds] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const attempt = useRef<string | null>(null);

  const money = useCallback((n: number) => formatCurrency(n, currencyCode, locale), [currencyCode, locale]);

  const subtotalForDiscount = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const discountValue = Number(discountInput) || 0;
  const discount = discountMode === "PERCENT" ? percentDiscount(subtotalForDiscount, discountValue) : Math.min(discountValue, subtotalForDiscount);
  const totals = useMemo(() => computePosTotals(lines.map((l) => ({ unitPrice: l.price, quantity: l.quantity, taxRate: l.taxRate })), canApplyDiscounts ? discount : 0, chargesGst), [lines, discount, chargesGst, canApplyDiscounts]);

  const loadHolds = useCallback(() => { if (!canCheckout) return; api<{ items: Hold[] }>("/api/pos/holds").then((d) => setHolds(d.items)).catch(() => undefined); }, [canCheckout]);
  useEffect(() => { loadHolds(); }, [loadHolds]);

  const add = useCallback((item: CatalogItem) => {
    if (item.type === "PRODUCT" && (item.stock ?? 0) <= 0) { toast.warning(t("outOfStockToast", { name: item.name })); return; }
    setLines((prev) => {
      const ex = prev.find((l) => l.id === item.id && l.type === item.type);
      if (ex) {
        if (item.type === "PRODUCT" && ex.quantity + 1 > (item.stock ?? 0)) { toast.warning(t("stockLimit", { count: item.stock ?? 0, name: item.name })); return prev; }
        return prev.map((l) => (l === ex ? { ...l, quantity: l.quantity + 1, stock: item.stock } : l));
      }
      return [...prev, { key: lineKey(), id: item.id, type: item.type, name: item.name, price: item.price, quantity: 1, taxRate: item.taxRate, stock: item.stock, description: item.description ?? undefined }];
    });
    attempt.current = null;
  }, [t]);

  const setQty = (key: string, qty: number) => {
    setLines((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      let q = Math.max(1, Math.floor(qty));
      if (l.type === "PRODUCT" && l.stock !== undefined && q > l.stock) { toast.warning(t("stockLimit", { count: l.stock, name: l.name })); q = Math.max(1, l.stock); }
      return { ...l, quantity: q };
    }));
    attempt.current = null;
  };
  const remove = (key: string) => { setLines((p) => p.filter((l) => l.key !== key)); attempt.current = null; };
  const reset = useCallback(() => { setLines([]); setClientId(""); setDiscountInput(""); attempt.current = null; }, []);

  const hold = async (silent = false) => {
    if (lines.length === 0) return;
    try {
      await api("/api/pos/holds", { method: "POST", body: JSON.stringify({ label: clients.find((c) => c.id === clientId)?.name, clientId: clientId || null, discount: totals.discount, total: totals.total, cart: lines.map(({ key: _k, ...rest }) => rest) }) });
      if (!silent) { toast.success(t("heldToast")); reset(); }
      loadHolds();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("holdFailed"));
      throw e;
    }
  };

  const resume = async (h: Hold) => {
    try {
      if (lines.length > 0) await hold(true);
      await api(`/api/pos/holds/${h.id}`, { method: "DELETE" });
      setLines(h.cart.lines.map((l) => ({ ...l, key: lineKey() })));
      setClientId(h.clientId ?? "");
      setDiscountMode("AMOUNT");
      setDiscountInput(h.cart.discount ? String(h.cart.discount) : "");
      attempt.current = null;
      setShowHolds(false);
      loadHolds();
    } catch (e) {
      if (e instanceof Error) toast.error(e.message);
    }
  };
  const discard = async (h: Hold) => {
    try { await api(`/api/pos/holds/${h.id}`, { method: "DELETE" }); loadHolds(); } catch (e) { toast.error(e instanceof Error ? e.message : t("holdFailed")); }
  };

  const charge = async (c: Charge) => {
    setBusy(true); setPayError(null);
    attempt.current ??= crypto.randomUUID();
    try {
      const res = await api<{ message: string; invoice?: { id: string; invoiceNumber: string }; change?: number | null }>("/api/pos/checkout", {
        method: "POST",
        body: JSON.stringify({
          action: c.action, clientId: clientId || undefined, payment: c.payment, idempotencyKey: attempt.current, ...(canApplyDiscounts && totals.discount > 0 ? { discount: totals.discount } : {}),
          items: lines.map((l) => (l.type === "CUSTOM" ? { type: "CUSTOM", name: l.name, price: l.price, quantity: l.quantity, taxRate: l.taxRate, ...(l.description ? { description: l.description } : {}) } : { id: l.id, type: l.type, quantity: l.quantity })),
        }),
      });
      setOutcome({ invoiceId: res.invoice?.id ?? null, invoiceNumber: res.invoice?.invoiceNumber ?? null, change: res.change ?? null, message: res.message, total: totals.total, action: c.action });
      setTick((n) => n + 1);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : t("checkoutFailed"));
    } finally {
      setBusy(false);
    }
  };

  const newSale = () => { setOutcome(null); setPaying(false); reset(); setTimeout(() => searchRef.current?.focus(), 50); };

  // "/" jumps to search; Ctrl/Cmd+Enter opens payment.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && lines.length > 0 && canCheckout && !paying) { e.preventDefault(); setPaying(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines.length, canCheckout, paying]);

  const count = lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <div className="space-y-3">
      <div className="flex gap-1" role="tablist">
        {(["register", "today"] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={cn("rounded-full px-4 py-1.5 text-sm transition-colors", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{t(`view.${k}`)}</button>)}
      </div>

      {view === "today" ? <div className="overflow-hidden rounded-2xl border bg-background"><TodayPanel money={money} locale={locale} reloadKey={tick} /></div> : (
        <div className="grid overflow-hidden rounded-2xl border bg-background lg:h-[calc(100dvh-14rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-h-[28rem] flex-col bg-muted/20 lg:min-h-0 lg:border-e"><CatalogPane onAdd={add} onMeta={(m) => setChargesGst(m.chargesGst)} reloadKey={tick} money={money} canCustom={canCreateCustomItems && canCheckout} onCustom={() => setCustom(true)} searchRef={searchRef} /></div>
          <CartPane lines={lines} totals={totals} chargesGst={chargesGst} money={money} clients={clients} clientId={clientId} onClient={(id) => { setClientId(id); attempt.current = null; }}
            canDiscount={canApplyDiscounts && canCheckout} discountMode={discountMode} discountInput={discountInput} onDiscount={(m, v) => { setDiscountMode(m); setDiscountInput(v); attempt.current = null; }}
            canCheckout={canCheckout} holdCount={holds.length} onQty={setQty} onRemove={remove} onHold={() => void hold().catch(() => undefined)} onShowHolds={() => { loadHolds(); setShowHolds(true); }} onClear={reset} onCharge={() => { setPayError(null); setPaying(true); }} />
        </div>
      )}

      {view === "register" && count > 0 ? (
        <>
          <div className="h-16 lg:hidden" aria-hidden />
          <div className="bottom-above-nav fixed inset-x-3 z-40 lg:hidden">
            <Button type="button" className="h-14 w-full justify-between rounded-2xl px-4 text-base font-semibold shadow-xl" onClick={() => document.getElementById("pos-cart")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" aria-hidden />{t("viewOrder", { count })}</span><span className="tabular-nums">{money(totals.total)}</span>
            </Button>
          </div>
        </>
      ) : null}

      <CustomItemDialog open={custom} onClose={() => setCustom(false)} onAdd={(i) => { setLines((p) => [...p, { key: lineKey(), id: `custom-${lineKey()}`, type: "CUSTOM", name: i.name, price: i.price, quantity: 1, taxRate: i.taxRate }]); setCustom(false); attempt.current = null; }} />
      <HeldDialog open={showHolds} holds={holds} money={money} locale={locale} onClose={() => setShowHolds(false)} onResume={(h) => void resume(h)} onDiscard={(h) => void discard(h)} />
      <PaymentDialog open={paying} total={totals.total} money={money} hasClient={Boolean(clientId)} busy={busy} error={payError} outcome={outcome} onClose={() => setPaying(false)} onConfirm={(c) => void charge(c)} onNewSale={newSale} />
    </div>
  );
}
