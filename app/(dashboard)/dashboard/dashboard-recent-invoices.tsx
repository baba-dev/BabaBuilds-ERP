"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Banknote, Download, FileText, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { getBustedUrl } from "@/lib/cache-buster";
import { INVOICE_STATUS, isPaidInvoiceStatus, toInvoiceStatus } from "@/lib/invoice-status";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTES, invoiceRoute } from "./dashboard-routes";
import { formatShortDate } from "./dashboard-format";
import { EmptyNote, Panel, PanelLink, focusRing, toneChipClass, type Tone } from "./dashboard-ui";
import type { RecentInvoiceRow } from "./types";

type DisplayStatus = "paid" | "partial" | "overdue" | "pending" | "void";

function displayStatus(row: RecentInvoiceRow, now: number): DisplayStatus {
  const status = toInvoiceStatus(row.status);
  if (status === INVOICE_STATUS.PAID) return "paid";
  if (String(row.status).toUpperCase() === "VOID") return "void";
  if (row.dueDate && new Date(row.dueDate).getTime() < now && row.totalAmount - row.amountReceived > 0) return "overdue";
  return status === INVOICE_STATUS.PARTIALLY_PAID ? "partial" : "pending";
}

const STATUS_TONE: Record<DisplayStatus, Tone> = { paid: "positive", partial: "warning", overdue: "critical", pending: "neutral", void: "neutral" };

function InvoiceStatusChip({ row, now }: { row: RecentInvoiceRow; now: number }) {
  const t = useTranslations("DashboardHome");
  const status = displayStatus(row, now);
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", toneChipClass[STATUS_TONE[status]])}>{t(`invoices.status.${status}`)}</span>;
}

function InvoiceActions({
  row,
  now,
  resending,
  onResend,
  onRecordPayment,
}: {
  row: RecentInvoiceRow;
  now: number;
  resending: boolean;
  onResend: (invoice: RecentInvoiceRow) => void;
  onRecordPayment: (invoice: RecentInvoiceRow) => void;
}) {
  const t = useTranslations("DashboardHome");
  const status = displayStatus(row, now);
  const open = !isPaidInvoiceStatus(row.status) && status !== "void";
  return (
    <div className="flex items-center justify-end gap-1">
      {open ? (
        <Button size="sm" variant="outline" className="h-9 gap-1.5 px-2.5 text-xs md:h-8" onClick={() => onRecordPayment(row)}>
          <Banknote className="h-3.5 w-3.5" aria-hidden />
          {t("invoices.recordPayment")}
        </Button>
      ) : null}
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 text-muted-foreground hover:text-foreground md:h-8 md:w-8"
        onClick={() => onResend(row)}
        disabled={resending || status === "void"}
        aria-label={t("invoices.resend", { invoice: row.invoiceNumber })}
        title={t("invoices.resend", { invoice: row.invoiceNumber })}
      >
        {resending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
      </Button>
      {row.pdfPath ? (
        <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-foreground md:h-8 md:w-8" asChild>
          <a href={getBustedUrl(row.pdfPath)} target="_blank" rel="noopener noreferrer" aria-label={t("invoices.download", { invoice: row.invoiceNumber })} title={t("invoices.download", { invoice: row.invoiceNumber })}>
            <Download className="h-4 w-4" aria-hidden />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

export function DashboardRecentInvoices({
  invoices,
  locale,
  onRecordPayment,
}: {
  invoices: RecentInvoiceRow[];
  locale: string;
  onRecordPayment: (invoice: RecentInvoiceRow) => void;
}) {
  const t = useTranslations("DashboardHome");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const resend = async (invoice: RecentInvoiceRow) => {
    setResendingId(invoice.id);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/resend`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(t("invoices.resent", { invoice: invoice.invoiceNumber }));
    } catch {
      toast.error(t("invoices.resendFailed"));
    } finally {
      setResendingId(null);
    }
  };

  return (
    <Panel
      labelledBy="dash-invoices"
      title={t("invoices.title")}
      description={t("invoices.description")}
      action={<PanelLink href={DASHBOARD_ROUTES.invoices}>{t("common.viewAll")}</PanelLink>}
      bodyClassName="px-0 pb-1 pt-2 sm:px-0 sm:pb-2"
    >
      {invoices.length === 0 ? (
        <EmptyNote
          icon={FileText}
          title={t("invoices.emptyTitle")}
          hint={t("invoices.emptyHint")}
          action={
            <Button asChild size="sm">
              <Link href={DASHBOARD_ROUTES.newInvoice}>{t("actions.newInvoice")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Narrow panel (phones, tablets beside the sidebar): one card per invoice. The switch follows the panel's width, not the screen's. */}
          <ul className="divide-y divide-border/60 @2xl:hidden">
            {invoices.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <Link href={invoiceRoute(row.id)} className={cn("flex items-start justify-between gap-3 rounded-lg", focusRing)}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{row.clientName}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {row.invoiceNumber} · {formatShortDate(row.invoiceDate, locale)}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.totalAmount, row.currency, locale)}</span>
                  </span>
                </Link>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <InvoiceStatusChip row={row} now={now} />
                  <InvoiceActions row={row} now={now} resending={resendingId === row.id} onResend={resend} onRecordPayment={onRecordPayment} />
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto @2xl:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-start text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-5 py-2 text-start font-medium">{t("invoices.col.invoice")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("invoices.col.client")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("invoices.col.date")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("invoices.col.status")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("invoices.col.amount")}</th>
                  <th scope="col" className="px-5 py-2 text-end font-medium"><span className="sr-only">{t("invoices.col.actions")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {invoices.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-2.5">
                      <Link href={invoiceRoute(row.id)} className={cn("whitespace-nowrap rounded font-medium text-foreground hover:underline", focusRing)}>
                        {row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-muted-foreground">{row.clientName}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{formatShortDate(row.invoiceDate, locale)}</td>
                    <td className="px-3 py-2.5"><InvoiceStatusChip row={row} now={now} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-end font-semibold tabular-nums text-foreground">{formatCurrency(row.totalAmount, row.currency, locale)}</td>
                    <td className="px-5 py-1.5"><InvoiceActions row={row} now={now} resending={resendingId === row.id} onResend={resend} onRecordPayment={onRecordPayment} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
