"use client";

import { Button } from "@/components/ui/button";
import { Banknote, Download, Send } from "lucide-react";
import { isPaidInvoiceStatus } from "@/lib/invoice-status";
import { getBustedUrl } from "@/lib/cache-buster";
import type { RecentInvoiceRow } from "./types";

export function TableActions({
  invoice,
  t,
  onOpenPayModal,
  onResendEmail,
  resending,
}: {
  invoice: RecentInvoiceRow;
  t: (key: string, values?: Record<string, string>) => string;
  onOpenPayModal: (invoice: RecentInvoiceRow) => void;
  onResendEmail: (invoice: RecentInvoiceRow) => void;
  resending: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 opactiy-100 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity">
      {isPaidInvoiceStatus(invoice.status) === false && (
        <Button variant="outline" size="sm" onClick={() => onOpenPayModal(invoice)} className="bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-400 border-zinc-200 dark:border-zinc-700 transition-colors text-xs font-bold uppercase tracking-wider h-8 active:scale-95" aria-label={`Log payment for ${invoice.invoiceNumber}`}>
          <Banknote className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t('log_pay')}</span>
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => onResendEmail(invoice)} disabled={resending} className="bg-white dark:bg-zinc-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-400 border-zinc-200 dark:border-zinc-700 transition-colors w-8 h-8 p-0 flex justify-center active:scale-95" title={t("actions.resend_invoice_title")} aria-label={`Resend email for ${invoice.invoiceNumber}`}>
        <Send className={`w-3.5 h-3.5 ${resending ? 'animate-pulse text-indigo-400' : ''}`} />
      </Button>
      <Button variant="secondary" size="sm" asChild title={t("actions.download_pdf_title")} className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 w-8 h-8 p-0 flex justify-center active:scale-95 transition-colors">
        <a href={getBustedUrl(invoice.pdfPath, invoice.updatedAt)} target="_blank" rel="noopener noreferrer" aria-label={t("actions.download_pdf_aria", { invoiceNumber: invoice.invoiceNumber })}>
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  );
}
