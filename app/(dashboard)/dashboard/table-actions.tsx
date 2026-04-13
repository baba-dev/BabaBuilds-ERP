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
    <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity duration-200">
      {isPaidInvoiceStatus(invoice.status) === false && (
        <Button variant="outline" size="sm" onClick={() => onOpenPayModal(invoice)} aria-label={`Record payment for ${invoice.invoiceNumber}`} className="h-8 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors bg-white dark:bg-zinc-950 font-medium tracking-wide">
          <Banknote className="w-3.5 h-3.5 sm:mr-1.5 text-zinc-500 dark:text-zinc-400" /> <span className="hidden sm:inline">{t("log_payment", "Record payment")}</span>
        </Button>
      )}
      <Button variant="outline" size="icon" className="h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors bg-white dark:bg-zinc-950" onClick={() => onResendEmail(invoice)} disabled={resending} title={t("actions.resend_invoice_title", "Resend invoice")} aria-label={`Resend email for ${invoice.invoiceNumber}`}>
        <Send className={`w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 ${resending ? "animate-pulse" : ""}`} />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400" asChild title={t("actions.download_pdf_title", "Download PDF")}>
        <a href={getBustedUrl(invoice.pdfPath, invoice.updatedAt)} target="_blank" rel="noopener noreferrer" aria-label={`Download PDF for ${invoice.invoiceNumber}`}>
          <Download className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}
