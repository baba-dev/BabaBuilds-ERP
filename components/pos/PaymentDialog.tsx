"use client";

import { useState } from "react";
import { Banknote, Building2, CheckCircle2, CreditCard, FileText, Loader2, Mail, Printer, QrCode, Repeat, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cashSuggestions, changeDue, type PaymentMethod } from "@/lib/pos/totals";
import { toast } from "sonner";
import { api } from "./shared";

const ICON: Record<PaymentMethod, typeof Banknote> = { CASH: Banknote, UPI: QrCode, CARD: CreditCard, BANK_TRANSFER: Building2, OTHER: Wallet };
export type Charge = { action: "PAY_NOW" | "INVOICE" | "PROPOSAL" | "RETAINER"; payment?: { method: PaymentMethod; tendered?: number; reference?: string } };
export type Outcome = { invoiceId: string | null; invoiceNumber: string | null; change: number | null; message: string; total: number; action: Charge["action"] };

export function PaymentDialog({ open, total, money, hasClient, customerEmail, busy, error, outcome, onClose, onConfirm, onNewSale }: {
  open: boolean; total: number; money: (n: number) => string; hasClient: boolean; customerEmail: string; busy: boolean; error: string | null; outcome: Outcome | null;
  onClose: () => void; onConfirm: (c: Charge) => void; onNewSale: () => void;
}) {
  return open ? <Body total={total} money={money} hasClient={hasClient} customerEmail={customerEmail} busy={busy} error={error} outcome={outcome} onClose={onClose} onConfirm={onConfirm} onNewSale={onNewSale} /> : null;
}

function Body({ total, money, hasClient, customerEmail, busy, error, outcome, onClose, onConfirm, onNewSale }: Omit<Parameters<typeof PaymentDialog>[0], "open">) {
  const t = useTranslations("PosRegister");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState(customerEmail);
  const [mailing, setMailing] = useState<"idle" | "sending" | "sent">("idle");
  const sendReceipt = async (id: string) => {
    setMailing("sending");
    try {
      await api(`/api/pos/receipts/${id}/email`, { method: "POST", body: JSON.stringify({ to: email.trim() }) });
      setMailing("sent");
      toast.success(t("emailSent"));
    } catch (e) {
      setMailing("idle");
      toast.error(e instanceof Error ? e.message : t("emailFailed"));
    }
  };
  const given = Number(tendered);
  const change = method === "CASH" && tendered !== "" ? changeDue(total, given) : null;
  const cashShort = method === "CASH" && tendered !== "" && change === null;

  if (outcome) {
    return (
      <Dialog open onOpenChange={(o) => !o && onNewSale()}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <DialogHeader><DialogTitle className="text-xl">{outcome.action === "PAY_NOW" ? t("paid") : t("saved")}</DialogTitle></DialogHeader>
            <p className="text-3xl font-semibold tabular-nums">{money(outcome.total)}</p>
            {outcome.invoiceNumber ? <p className="text-sm text-muted-foreground">{outcome.invoiceNumber}</p> : null}
            {outcome.change !== null && outcome.change > 0 ? <p className="rounded-xl bg-emerald-500/10 px-4 py-2 text-lg font-medium text-emerald-700 dark:text-emerald-300">{t("giveChange", { amount: money(outcome.change) })}</p> : null}
            <div className="flex w-full flex-col gap-2 pt-2">
              {outcome.action === "PAY_NOW" && outcome.invoiceId ? <Button asChild variant="outline" className="gap-1.5"><a href={`/api/pos/receipts/${outcome.invoiceId}`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" />{t("receipt")}</a></Button> : null}
              {outcome.action === "PAY_NOW" && outcome.invoiceId ? (
                <div className="flex gap-2"><Input type="email" inputMode="email" aria-label={t("emailTo")} placeholder={t("emailTo")} value={email} onChange={(e) => { setEmail(e.target.value); setMailing("idle"); }} /><Button variant="outline" className="shrink-0 gap-1.5" disabled={!/^\S+@\S+\.\S+$/.test(email.trim()) || mailing !== "idle"} onClick={() => void sendReceipt(outcome.invoiceId!)}>{mailing === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}{mailing === "sent" ? t("emailDone") : t("emailReceipt")}</Button></div>
              ) : null}
              <Button onClick={onNewSale} autoFocus>{t("newSale")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{t("payment")}</DialogTitle></DialogHeader>
        <div className="rounded-2xl bg-muted/60 p-4 text-center"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("amountDue")}</p><p className="text-4xl font-semibold tabular-nums">{money(total)}</p></div>
        <div className="grid grid-cols-5 gap-1.5" role="tablist" aria-label={t("methodLabel")}>
          {(Object.keys(ICON) as PaymentMethod[]).map((m) => { const Icon = ICON[m]; return <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => setMethod(m)} className={cn("flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] transition-colors", method === m ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted")}><Icon className="h-5 w-5" />{t(`method.${m}`)}</button>; })}
        </div>
        {method === "CASH" ? (
          <div className="space-y-2">
            <Label htmlFor="pay-cash">{t("cashReceived")}</Label>
            <Input id="pay-cash" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))} className="h-12 text-lg" autoFocus />
            <div className="flex flex-wrap gap-1.5">{cashSuggestions(total).map((n) => <Button key={n} type="button" variant="outline" size="sm" onClick={() => setTendered(String(n))}>{money(n)}</Button>)}</div>
            {change !== null ? <p className="text-sm font-medium text-emerald-600">{t("changeDue", { amount: money(change) })}</p> : cashShort ? <p className="text-sm text-rose-600">{t("cashShort")}</p> : null}
          </div>
        ) : (
          <div className="space-y-2"><Label htmlFor="pay-ref">{t("reference")}</Label><Input id="pay-ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder={t("referenceHint")} /></div>
        )}
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        <Button className="h-12 text-base font-semibold" disabled={busy || cashShort} onClick={() => onConfirm({ action: "PAY_NOW", payment: { method, ...(method === "CASH" && tendered !== "" ? { tendered: given } : {}), ...(reference.trim() ? { reference: reference.trim() } : {}) } })}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : t("collect", { amount: money(total) })}
        </Button>
        <div className="border-t pt-3">
          <p className="mb-2 text-xs text-muted-foreground">{hasClient ? t("otherWays") : t("otherWaysNeedCustomer")}</p>
          <div className="grid grid-cols-3 gap-2">
            {([["INVOICE", FileText], ["PROPOSAL", FileText], ["RETAINER", Repeat]] as const).map(([a, Icon]) => <Button key={a} type="button" variant="outline" size="sm" className="h-auto flex-col gap-1 py-2 text-xs" disabled={busy || !hasClient} onClick={() => onConfirm({ action: a })}><Icon className="h-4 w-4" />{t(`action.${a}`)}</Button>)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
