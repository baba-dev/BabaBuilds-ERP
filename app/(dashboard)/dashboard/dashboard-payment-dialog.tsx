"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RecentInvoiceRow } from "./types";

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function PaymentForm({ invoice, locale, onClose, onRecorded }: { invoice: RecentInvoiceRow; locale: string; onClose: () => void; onRecorded: () => void }) {
  const t = useTranslations("DashboardHome");
  const remaining = Math.max(0, Math.round((invoice.totalAmount - invoice.amountReceived) * 100) / 100);
  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  // One key per open dialog: a double tap or a retry after a dropped connection cannot record the payment twice.
  const [idempotencyKey] = useState(() => `dash:${invoice.id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  // Amounts on an invoice are in the invoice's own currency, which is not always the workspace currency.
  const fmt = (value: number) => formatCurrency(value, invoice.currency, locale);
  const parsed = Number(amount);
  const invalid = !Number.isFinite(parsed) || parsed <= 0 || parsed > remaining + 0.005;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ amountReceived: parsed, dateReceived: date }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string } | null;
        const message = typeof body?.error === "string" ? body.error : body?.error?.message;
        throw new Error(message || t("payment.failed"));
      }
      toast.success(t("payment.recorded", { invoice: invoice.invoiceNumber }));
      onRecorded();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("payment.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("payment.billed")}</dt>
          <dd className="mt-0.5 truncate font-semibold tabular-nums text-foreground">{fmt(invoice.totalAmount)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("payment.received")}</dt>
          <dd className="mt-0.5 truncate font-semibold tabular-nums text-foreground">{fmt(invoice.amountReceived)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">{t("payment.remaining")}</dt>
          <dd className="mt-0.5 truncate font-semibold tabular-nums text-foreground">{fmt(remaining)}</dd>
        </div>
      </dl>

      <div className="space-y-1.5">
        <Label htmlFor="dash-pay-amount">{t("payment.amount", { currency: invoice.currency })}</Label>
        <Input
          id="dash-pay-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max={remaining}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={invalid}
          aria-describedby={invalid ? "dash-pay-amount-error" : undefined}
          className="h-11 text-base tabular-nums"
          required
        />
        {invalid ? (
          <p id="dash-pay-amount-error" className="text-xs text-rose-600 dark:text-rose-400">
            {t("payment.amountError", { amount: fmt(remaining) })}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dash-pay-date">{t("payment.date")}</Label>
        <Input id="dash-pay-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="h-11 text-base" required />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" className="h-11 sm:h-9" disabled={invalid || saving}>
          {saving ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
          {t("payment.submit")}
        </Button>
      </div>
    </form>
  );
}

export function DashboardPaymentDialog({
  invoice,
  locale,
  onClose,
  onRecorded,
}: {
  invoice: RecentInvoiceRow | null;
  locale: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const t = useTranslations("DashboardHome");
  return (
    <Dialog open={invoice !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("payment.title")}</DialogTitle>
          <DialogDescription>{invoice ? t("payment.description", { invoice: invoice.invoiceNumber, client: invoice.clientName }) : ""}</DialogDescription>
        </DialogHeader>
        {/* Keyed by invoice so the amount and date start fresh for each one. */}
        {invoice ? <PaymentForm key={invoice.id} invoice={invoice} locale={locale} onClose={onClose} onRecorded={onRecorded} /> : null}
      </DialogContent>
    </Dialog>
  );
}
