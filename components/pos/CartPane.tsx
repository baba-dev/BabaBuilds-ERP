"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronsUpDown, Minus, PauseCircle, Percent, Plus, ShoppingBag, Trash2, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PosTotals } from "@/lib/pos/totals";
import type { CartLine, ClientOption, CustomerContext } from "./shared";

type Props = {
  customerCtx: CustomerContext | null;
  lines: CartLine[];
  totals: PosTotals;
  chargesGst: boolean;
  money: (n: number) => string;
  clients: ClientOption[];
  clientId: string;
  onClient: (id: string) => void;
  canDiscount: boolean;
  discountMode: "AMOUNT" | "PERCENT";
  discountInput: string;
  onDiscount: (mode: "AMOUNT" | "PERCENT", value: string) => void;
  canCheckout: boolean;
  holdCount: number;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onHold: () => void;
  onShowHolds: () => void;
  onClear: () => void;
  onCharge: () => void;
};

export function CartPane(p: Props) {
  const t = useTranslations("PosRegister");
  const [picking, setPicking] = useState(false);
  const [clientQ, setClientQ] = useState("");
  const current = p.clients.find((c) => c.id === p.clientId);
  const hits = p.clients.filter((c) => c.name.toLowerCase().includes(clientQ.trim().toLowerCase())).slice(0, 8);
  const count = p.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <div id="pos-cart" className="flex min-h-[28rem] scroll-mt-16 flex-col bg-card lg:min-h-0">
      <div className="space-y-2 border-b p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-4 w-4" />{t("order")}{count > 0 ? <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{count}</span> : null}</h2>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={p.onShowHolds}><PauseCircle className="h-4 w-4" />{t("held")}{p.holdCount > 0 ? <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{p.holdCount}</span> : null}</Button>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setPicking((o) => !o)} aria-expanded={picking} className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 text-sm">
            <span className="flex min-w-0 items-center gap-2"><User className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{current?.name ?? t("walkIn")}</span></span><ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
          {picking ? (
            <div className="absolute z-20 mt-1 w-full rounded-xl border bg-popover p-2 shadow-lg">
              <Input autoFocus value={clientQ} onChange={(e) => setClientQ(e.target.value)} placeholder={t("findCustomer")} className="mb-1 h-9" />
              <ul className="max-h-52 overflow-y-auto">
                <li><button type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-muted" onClick={() => { p.onClient(""); setPicking(false); setClientQ(""); }}>{t("walkIn")}{!p.clientId ? <Check className="h-4 w-4" /> : null}</button></li>
                {hits.map((c) => <li key={c.id}><button type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-start text-sm hover:bg-muted" onClick={() => { p.onClient(c.id); setPicking(false); setClientQ(""); }}><span className="truncate">{c.name}</span>{p.clientId === c.id ? <Check className="h-4 w-4 shrink-0" /> : null}</button></li>)}
              </ul>
            </div>
          ) : null}
        </div>
        {p.customerCtx && p.customerCtx.owed > 0 ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p.customerCtx.overdue > 0 ? t("customerOwesOverdue", { owed: p.money(p.customerCtx.owed), overdue: p.money(p.customerCtx.overdue) }) : t("customerOwes", { owed: p.money(p.customerCtx.owed), count: p.customerCtx.open })}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {p.lines.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><ShoppingBag className="h-10 w-10 opacity-20" />{t("emptyCart")}<span className="text-xs">{t("emptyHint")}</span></div>
        ) : (
          <ul className="space-y-2">
            {p.lines.map((l) => (
              <li key={l.key} className="rounded-xl border bg-background p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{l.name}</p><p className="text-xs text-muted-foreground tabular-nums">{p.money(l.price)}{p.chargesGst && l.taxRate > 0 ? ` · GST ${l.taxRate}%` : ""}</p></div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-rose-600" aria-label={t("remove", { name: l.name })} onClick={() => p.onRemove(l.key)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center rounded-lg border">
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t("less")} onClick={() => p.onQty(l.key, l.quantity - 1)}><Minus className="h-3.5 w-3.5" /></Button>
                    <input aria-label={t("qtyFor", { name: l.name })} inputMode="numeric" value={l.quantity} onChange={(e) => p.onQty(l.key, Number(e.target.value.replace(/\D/g, "")) || 1)} className="h-9 w-12 bg-transparent text-center text-sm tabular-nums outline-none" />
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={t("more")} onClick={() => p.onQty(l.key, l.quantity + 1)}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  <span className="font-semibold tabular-nums">{p.money(l.price * l.quantity)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t p-3 sm:p-4">
        {p.canDiscount && p.lines.length > 0 ? (
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex rounded-lg border text-xs" role="group" aria-label={t("discountType")}>
              {(["AMOUNT", "PERCENT"] as const).map((m) => <button key={m} type="button" aria-pressed={p.discountMode === m} onClick={() => p.onDiscount(m, p.discountInput)} className={cn("px-2.5 py-1.5", p.discountMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{m === "AMOUNT" ? t("amountShort") : "%"}</button>)}
            </div>
            <Input inputMode="decimal" className="h-9" placeholder={t("discount")} aria-label={t("discount")} value={p.discountInput} onChange={(e) => p.onDiscount(p.discountMode, e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        ) : null}
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground"><dt>{t("subtotal")}</dt><dd className="tabular-nums">{p.money(p.totals.subtotal)}</dd></div>
          {p.totals.discount > 0 ? <div className="flex justify-between text-emerald-600"><dt>{t("discount")}</dt><dd className="tabular-nums">−{p.money(p.totals.discount)}</dd></div> : null}
          {p.chargesGst ? <div className="flex justify-between text-muted-foreground"><dt>{t("gst")}</dt><dd className="tabular-nums">{p.money(p.totals.tax)}</dd></div> : null}
          <div className="flex justify-between border-t pt-2 text-xl font-semibold"><dt>{t("total")}</dt><dd className="tabular-nums">{p.money(p.totals.total)}</dd></div>
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={p.lines.length === 0 || !p.canCheckout} onClick={p.onHold} className="gap-1.5"><PauseCircle className="h-4 w-4" />{t("hold")}</Button>
          <Button variant="outline" disabled={p.lines.length === 0} onClick={p.onClear} className="text-rose-600">{t("clear")}</Button>
        </div>
        <Button className="h-14 w-full text-lg font-semibold" disabled={p.lines.length === 0 || !p.canCheckout} onClick={p.onCharge}>{p.canCheckout ? t("charge", { total: p.money(p.totals.total) }) : t("viewOnly")}</Button>
      </div>
    </div>
  );
}
