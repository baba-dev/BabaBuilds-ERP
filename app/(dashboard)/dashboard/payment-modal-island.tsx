"use client";

import { Activity } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { RecentInvoiceRow } from "./types";

export function PaymentModalIsland({
  open,
  onOpenChange,
  onSubmit,
  t,
  currency,
  currencySymbol,
  amountReceived,
  setAmountReceived,
  dateReceived,
  setDateReceived,
  isSubmittingPayment,
  selectedInvoice,
  selectedInvoiceBilled,
  selectedInvoiceReceived,
  selectedInvoiceRemaining,
  fCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  t: (key: string, fallback: string) => string;
  currency: string;
  currencySymbol: string;
  amountReceived: string;
  setAmountReceived: (value: string) => void;
  dateReceived: string;
  setDateReceived: (value: string) => void;
  isSubmittingPayment: boolean;
  selectedInvoice: RecentInvoiceRow | null;
  selectedInvoiceBilled: number;
  selectedInvoiceReceived: number;
  selectedInvoiceRemaining: number;
  fCurrency: (value: number) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("log_remittance", "Log payment")}</DialogTitle>
          <DialogDescription>
            Record remittance for invoice <strong>{selectedInvoice?.invoiceNumber ?? "-"}</strong> in {currency}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount-received">{t("actual_received", "Amount received")} ({currency})</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500 text-sm">{currencySymbol}</span>
              <Input id="amount-received" type="number" step="0.01" className="pl-8" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} required />
            </div>
            <p className="text-xs text-zinc-500">Billed: {fCurrency(selectedInvoiceBilled)} · Already received: {fCurrency(selectedInvoiceReceived)} · Remaining: {fCurrency(selectedInvoiceRemaining)}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date-received">{t("date_credited", "Date credited")}</Label>
            <Input id="date-received" type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} required />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel", "Cancel")}</Button>
            <Button type="submit" disabled={isSubmittingPayment}>
              {isSubmittingPayment ? <span className="inline-flex items-center gap-1"><Activity className="w-4 h-4 animate-spin" />{t("processing", "Processing")}</span> : t("stamp_paid", "Mark paid")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
