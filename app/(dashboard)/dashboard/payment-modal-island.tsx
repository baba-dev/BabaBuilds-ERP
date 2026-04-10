"use client";

import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { typography } from "@/lib/ui/typography";
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
  t: ReturnType<typeof useTranslations>;
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
      <DialogContent className="dark:bg-zinc-900 dark:border-zinc-800 p-0 overflow-hidden sm:max-w-md">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 dark:text-zinc-50 font-bold tracking-tight text-xl">{t('log_remittance')}</DialogTitle>
            <DialogDescription className={cn(typography.bodyCopy, "font-medium mt-1.5")}>
              {t.rich('record_actual_amount', { currency, invoiceNumber: selectedInvoice?.invoiceNumber ?? "-", b: (chunks: ReactNode) => <b>{chunks}</b>, strong: (chunks: ReactNode) => <strong className="text-zinc-700 dark:text-zinc-300">{chunks}</strong> })}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit}>
          <div className="space-y-6 p-6">
            <div className="space-y-2">
              <Label htmlFor="amount-received" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider flex items-center gap-2">{t('actual_received', { currency })}</Label>
              <div className="relative group">
                <span className="absolute left-3.5 top-2.5 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-zinc-100 font-bold text-sm transition-colors">{currencySymbol}</span>
                <Input id="amount-received" type="number" step="0.01" className="pl-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold h-11 transition-all focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500 dark:focus-visible:ring-emerald-500/20" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} required />
              </div>
              <div className="flex justify-between items-center mt-2 px-1">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest">{t('billed_amount')}</p>
                <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{fCurrency(selectedInvoiceBilled)}</p>
              </div>
              <div className="mt-1 px-1 space-y-1 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                <p>Already received: {fCurrency(selectedInvoiceReceived)}</p>
                <p>Remaining due: {fCurrency(selectedInvoiceRemaining)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-received" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('date_credited')}</Label>
              <Input id="date-received" type="date" value={dateReceived} onChange={(e) => setDateReceived(e.target.value)} required className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark] font-medium h-11 transition-all focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500" />
            </div>
          </div>

          <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">{t("cancel")}</Button>
            <Button type="submit" disabled={isSubmittingPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 border-none text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-emerald-500/20 transition-all active:scale-95">
              {isSubmittingPayment ? <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-spin" /> {t('processing')}</span> : t('stamp_paid')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
