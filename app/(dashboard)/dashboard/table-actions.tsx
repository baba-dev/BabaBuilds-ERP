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
  t: (key: string, fallback: string, values?: any) => string;
  onOpenPayModal: (invoice: RecentInvoiceRow) => void;
  onResendEmail: (invoice: RecentInvoiceRow) => void;
  resending: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5 px-2 py-1 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 ring-1 ring-black/[0.02] dark:ring-white/[0.02] shadow-xs">
      {isPaidInvoiceStatus(invoice.status) === false && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onOpenPayModal(invoice)} 
          aria-label={`Record payment for ${invoice.invoiceNumber}`} 
          className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-wider bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 border-zinc-200 dark:border-zinc-800 transition-all active:scale-95"
        >
          <Banknote className="w-3.5 h-3.5 mr-1.5 text-zinc-500 dark:text-zinc-400" />
          <span>{t("record_payment", "Record payment")}</span>
        </Button>
      )}
      <div className="flex items-center gap-1 ml-0.5 pl-1.5 border-l border-zinc-200 dark:border-zinc-800">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all" 
          onClick={() => onResendEmail(invoice)} 
          disabled={resending} 
          title={t("actions.resend_invoice_title", "Resend invoice")} 
          aria-label={`Resend email for ${invoice.invoiceNumber}`}
        >
          <Send className={`w-3.5 h-3.5 ${resending ? "animate-pulse" : ""}`} />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all" 
          asChild 
          title={t("actions.download_pdf_title", "Download PDF")}
        >
          <a href={getBustedUrl(invoice.pdfPath, invoice.updatedAt)} target="_blank" rel="noopener noreferrer" aria-label={`Download PDF for ${invoice.invoiceNumber}`}>
            <Download className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}
