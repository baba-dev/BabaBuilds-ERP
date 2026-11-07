"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAYMENT_METHODS, type InvoiceListItemDto } from "@/lib/invoices/types";
import { formatMoney, newIdempotencyKey, readApiError, todayInputValue } from "./income-utils";

type Common = { locale: string; onDone: () => void };

/* ───────────────────────── Record payment ───────────────────────── */

export function RecordPaymentDialog({ invoice, locale, onDone, onClose }: Common & { invoice: InvoiceListItemDto | null; onClose: () => void }) {
  const t = useTranslations("Income.payment");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [tds, setTds] = useState(false);
  const [tdsRate, setTdsRate] = useState("10");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per open dialog: a retry of the same submit is safe, a second genuine payment is not dropped.
  const idempotencyKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!invoice) return;
    idempotencyKey.current = newIdempotencyKey();
    setAmount(Number(invoice.balance).toFixed(2));
    setDate(todayInputValue());
    setMethod("BANK_TRANSFER");
    setReference("");
    setNotes("");
    setTds(false);
    setError(null);
  }, [invoice]);

  const balance = useMemo(() => Number(invoice?.balance ?? 0), [invoice]);
  if (!invoice) return null;

  const value = Number(amount);
  const invalid = !(value > 0) || value > balance + 0.005;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { amount: value, receivedAt: date, method, reference: reference || null, notes: notes || null };
      if (tds) {
        body.withholdingRatePercent = Number(tdsRate) || 0;
        body.withholdingDeductedAt = date;
      }
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readApiError(res, t("failed")));
        return;
      }
      toast.success(t("success"));
      onDone();
      onClose();
    } catch {
      setError(t("failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { number: invoice.invoiceNumber, balance: formatMoney(invoice.balance, invoice.currency, locale) })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <div className="flex items-end justify-between">
              <Label htmlFor="pay-amount">{t("amount")}</Label>
              <button type="button" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setAmount(balance.toFixed(2))}>
                {t("fullBalance")}
              </button>
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{invoice.currency}</span>
              <Input id="pay-amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={balance} required value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 ps-12 text-base font-semibold tabular-nums" aria-invalid={value > balance + 0.005 || undefined} autoFocus />
            </div>
            {value > balance + 0.005 && <p className="text-xs font-medium text-rose-600">{t("exceeds", { balance: formatMoney(balance, invoice.currency, locale) })}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">{t("date")}</Label>
              <Input id="pay-date" type="date" required max={todayInputValue()} value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">{t("method")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="pay-method" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`methods.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">{t("reference")}</Label>
            <Input id="pay-ref" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder={t("referencePlaceholder")} />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={tds} onChange={(e) => setTds(e.target.checked)} className="mt-1 size-4 accent-indigo-600" />
            <span>
              {t("withholding")}
              <span className="block text-xs text-muted-foreground">{t("withholdingHint")}</span>
            </span>
          </label>
          {tds && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-tds">{t("withholdingRate")}</Label>
              <Input id="pay-tds" type="number" min="0" max="100" step="0.1" value={tdsRate} onChange={(e) => setTdsRate(e.target.value)} className="h-10 w-28" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pay-notes">{t("notes")}</Label>
            <Textarea id="pay-notes" value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="primary-action" disabled={invalid || submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Reason dialogs (void / reverse) ───────────────────────── */

function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  placeholder,
  destructive,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  placeholder: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<string | null>;
}) {
  const t = useTranslations("Income.reason");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3 || submitting) return;
    setSubmitting(true);
    const failure = await onConfirm(reason.trim());
    setSubmitting(false);
    if (failure) setError(failure);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason-text">{t("label")}</Label>
            <Textarea id="reason-text" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder={placeholder} autoFocus required />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "primary-action"} disabled={reason.trim().length < 3 || submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VoidInvoiceDialog({ invoice, onDone, onClose }: Pick<Common, "onDone"> & { invoice: InvoiceListItemDto | null; onClose: () => void }) {
  const t = useTranslations("Income.void");
  return (
    <ReasonDialog
      open={Boolean(invoice)}
      title={t("title", { number: invoice?.invoiceNumber ?? "" })}
      description={t("description")}
      confirmLabel={t("confirm")}
      placeholder={t("placeholder")}
      destructive
      onClose={onClose}
      onConfirm={async (reason) => {
        if (!invoice) return null;
        try {
          const res = await fetch(`/api/invoices/${invoice.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
          if (!res.ok) return await readApiError(res, t("failed"));
          const payload = (await res.json().catch(() => ({}))) as { creditNoteNumber?: string };
          toast.success(t("success", { number: payload.creditNoteNumber ?? "" }));
          onDone();
          onClose();
          return null;
        } catch {
          return t("failed");
        }
      }}
    />
  );
}

export function ReversePaymentDialog({ target, onDone, onClose }: Pick<Common, "onDone"> & { target: { invoiceId: string; paymentId: string } | null; onClose: () => void }) {
  const t = useTranslations("Income.reverse");
  return (
    <ReasonDialog
      open={Boolean(target)}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      placeholder={t("placeholder")}
      onClose={onClose}
      onConfirm={async (reason) => {
        if (!target) return null;
        try {
          const res = await fetch(`/api/invoices/${target.invoiceId}/payments/${target.paymentId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
          });
          if (!res.ok) return await readApiError(res, t("failed"));
          toast.success(t("success"));
          onDone();
          onClose();
          return null;
        } catch {
          return t("failed");
        }
      }}
    />
  );
}

/* ───────────────────────── Delete (never-sent invoices only) ───────────────────────── */

export function DeleteInvoiceDialog({ invoice, onDone, onClose }: Pick<Common, "onDone"> & { invoice: InvoiceListItemDto | null; onClose: () => void }) {
  const t = useTranslations("Income.delete");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!invoice) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readApiError(res, t("failed")));
        return;
      }
      toast.success(t("success"));
      onDone();
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <AlertDialog open={Boolean(invoice)} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { number: invoice?.invoiceNumber ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
