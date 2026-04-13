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
  t: (key: string, fallback: string) => string;
  onOpenPayModal: (invoice: RecentInvoiceRow) => void;
  onResendEmail: (invoice: RecentInvoiceRow) => void;
  resending: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 transition-opacity">
      {isPaidInvoiceStatus(invoice.status) === false && (
        <Button variant="outline" size="sm" onClick={() => onOpenPayModal(invoice)} aria-label={`Log payment for ${invoice.invoiceNumber}`}>
          <Banknote className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t("log_pay", "Log pay")}</span>
        </Button>
      )}
      <Button variant="outline" size="icon" onClick={() => onResendEmail(invoice)} disabled={resending} title={t("actions.resend_invoice_title", "Resend invoice")} aria-label={`Resend email for ${invoice.invoiceNumber}`}>
        <Send className={`w-3.5 h-3.5 ${resending ? "animate-pulse" : ""}`} />
      </Button>
      <Button variant="secondary" size="icon" asChild title={t("actions.download_pdf_title", "Download PDF")}>
        <a href={getBustedUrl(invoice.pdfPath, invoice.updatedAt)} target="_blank" rel="noopener noreferrer" aria-label={`Download PDF for ${invoice.invoiceNumber}`}>
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  );
}
