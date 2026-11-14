"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Banknote, BellRing, Download, ExternalLink, Send, Ban, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { RecordDocumentsDialog } from "@/components/documents/RecordDocumentsDialog";
import { getBustedUrl } from "@/lib/cache-buster";
import { cn } from "@/lib/utils";
import type { InvoiceDetailDto } from "@/lib/invoices/types";
import { StatusBadge } from "./StatusBadge";
import { InvoiceGstPanel } from "./InvoiceGstPanel";
import { formatMoney } from "./income-utils";
import { useJson } from "./use-income-data";
import type { RowAction } from "./RowActionsMenu";

type Props = {
  invoiceId: string | null;
  locale: string;
  baseCurrency: string;
  reloadToken: number;
  onClose: () => void;
  onAction: (action: RowAction, row: InvoiceDetailDto) => void;
  onReversePayment: (invoiceId: string, paymentId: string) => void;
};

function dateTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function dateOnly(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export function InvoiceDrawer({ invoiceId, locale, baseCurrency, reloadToken, onClose, onAction, onReversePayment }: Props) {
  const t = useTranslations("Income.drawer");
  const tt = useTranslations("Income");
  const { data, error, loading, reload } = useJson<{ data: InvoiceDetailDto }>(invoiceId ? `/api/invoices/${invoiceId}` : null);
  const invoice = data?.data && data.data.id === invoiceId ? data.data : null;

  useEffect(() => {
    if (reloadToken > 0) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the parent signals a mutation
  }, [reloadToken]);

  const money = (v: string) => (invoice ? formatMoney(v, invoice.currency, locale) : "");
  const open = invoice && (invoice.status === "PENDING" || invoice.status === "PARTIALLY_PAID");

  return (
    <Sheet open={Boolean(invoiceId)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="space-y-3 border-b border-border/70 p-5 pe-12">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
            {invoice ? invoice.invoiceNumber : t("loading")}
            {invoice && <StatusBadge status={invoice.displayStatus} />}
          </SheetTitle>
          <SheetDescription>{invoice ? invoice.clientName : " "}</SheetDescription>
          {invoice && (
            <>
              <p className="text-3xl font-bold tabular-nums tracking-tight">{money(invoice.grandTotal)}</p>
              <div className="flex flex-wrap gap-2">
                {open && (
                  <Button size="sm" variant="primary-action" onClick={() => onAction("pay", invoice)} className="gap-1.5">
                    <Banknote className="size-4" aria-hidden /> {tt("actions.recordPayment")}
                  </Button>
                )}
                {invoice.status !== "VOID" && (
                  <Button size="sm" variant="outline" onClick={() => onAction("send", invoice)} className="gap-1.5">
                    <Send className="size-4" aria-hidden /> {tt("actions.sendInvoice")}
                  </Button>
                )}
                {open && (
                  <Button size="sm" variant="outline" onClick={() => onAction("remind", invoice)} className="gap-1.5">
                    <BellRing className="size-4" aria-hidden /> {tt("actions.sendReminder")}
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild className="gap-1.5">
                  <a href={getBustedUrl(invoice.pdfPath, invoice.createdAt)} target="_blank" rel="noopener noreferrer">
                    <Download className="size-4" aria-hidden /> {tt("actions.download")}
                  </a>
                </Button>
                <RecordDocumentsDialog targetType="INVOICE" targetId={invoice.id} />
              </div>
            </>
          )}
        </SheetHeader>

        <div className="space-y-6 p-5">
          {error && !invoice && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {!invoice && loading && (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {invoice && (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label={t("issued")}>{dateOnly(invoice.invoiceDate, locale)}</Field>
                <Field label={t("due")}>
                  {invoice.dueDate ? dateOnly(invoice.dueDate, locale) : "—"}
                  {invoice.daysOverdue ? <span className="ms-1 text-xs font-semibold text-rose-600 dark:text-rose-400">({tt("table.daysLate", { days: invoice.daysOverdue })})</span> : null}
                </Field>
                <Field label={t("source")}>
                  {invoice.sourceProposalId || invoice.retainerId ? (
                    <Link href={invoice.retainerId ? `/retainers?retainer=${invoice.retainerId}` : `/proposals?proposal=${invoice.sourceProposalId}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400">
                      {tt(`source.${invoice.source}`)} <ExternalLink className="size-3" aria-hidden />
                    </Link>
                  ) : (
                    tt(`source.${invoice.source}`)
                  )}
                </Field>
                <Field label={t("period")}>{invoice.billingMonth}</Field>
                <Field label={t("currency")}>
                  {invoice.currency}
                  {invoice.currency !== baseCurrency && <span className="block text-xs font-normal text-muted-foreground">1 {invoice.currency} = {invoice.exchangeRate} {baseCurrency}</span>}
                </Field>
                <Field label={t("sent")}>{invoice.sentAt ? dateTime(invoice.sentAt, locale) : t("notSent")}</Field>
              </dl>

              {invoice.status === "VOID" && (
                <div className="rounded-xl border border-zinc-500/30 bg-zinc-500/10 p-3 text-sm">
                  <p className="font-semibold">{t("voided")}</p>
                  <p className="text-muted-foreground">{invoice.voidReason}</p>
                  {invoice.creditNotes.map((c) => (
                    <p key={c.id} className="mt-1 text-xs tabular-nums">
                      {c.creditNoteNumber} · {money(c.amount)} · {dateOnly(c.issuedAt, locale)}
                    </p>
                  ))}
                </div>
              )}

              <section aria-labelledby="drawer-items">
                <h3 id="drawer-items" className="mb-2 text-sm font-semibold">{t("items")}</h3>
                <div className="overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-start font-medium">{t("description")}</th>
                        <th className="px-3 py-2 text-end font-medium">{t("qty")}</th>
                        <th className="px-3 py-2 text-end font-medium">{t("amount")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {invoice.items.length === 0 && (
                        <tr>
                          <td className="px-3 py-2 text-muted-foreground" colSpan={3}>{invoice.serviceDescription}</td>
                        </tr>
                      )}
                      {invoice.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-end tabular-nums">{item.quantity}</td>
                          <td className="px-3 py-2 text-end tabular-nums">{money(item.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <dl className="space-y-1 border-t border-border/70 bg-muted/20 px-3 py-2 text-sm">
                    <div className="flex justify-between"><dt className="text-muted-foreground">{t("subtotal")}</dt><dd className="tabular-nums">{money(invoice.subtotal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">{t("tax")} ({invoice.taxRate}%)</dt><dd className="tabular-nums">{money(invoice.taxAmount)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>{t("total")}</dt><dd className="tabular-nums">{money(invoice.grandTotal)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted-foreground">{t("received")}</dt><dd className="tabular-nums text-emerald-700 dark:text-emerald-400">{money(invoice.amountReceived)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt>{t("balance")}</dt><dd className={cn("tabular-nums", Number(invoice.balance) > 0 && "text-amber-700 dark:text-amber-400")}>{money(invoice.balance)}</dd></div>
                  </dl>
                </div>
              </section>

              {invoice.currency ? <InvoiceGstPanel invoiceId={invoice.id} locale={locale} /> : null}

              <section aria-labelledby="drawer-payments">
                <h3 id="drawer-payments" className="mb-2 text-sm font-semibold">{t("payments")}</h3>
                {invoice.payments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t("noPayments")}</p>
                ) : (
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
                    {invoice.payments.map((p) => (
                      <li key={p.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className={cn("font-semibold tabular-nums", p.reversedAt && "text-muted-foreground line-through")}>{money(p.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {dateOnly(p.receivedAt, locale)} · {tt(`payment.methods.${p.method}` as never)}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </p>
                          {p.notes && <p className="mt-0.5 text-xs text-muted-foreground">{p.notes}</p>}
                          {p.reversedAt && <p className="mt-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">{t("reversed", { reason: p.reversalReason ?? "" })}</p>}
                        </div>
                        {!p.reversedAt && p.id !== "unattributed" && invoice.status !== "VOID" && (
                          <Button type="button" size="sm" variant="ghost" className="shrink-0 gap-1 text-xs" onClick={() => onReversePayment(invoice.id, p.id)}>
                            <Undo2 className="size-3.5" aria-hidden /> {t("reverse")}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="drawer-timeline">
                <h3 id="drawer-timeline" className="mb-2 text-sm font-semibold">{t("timeline")}</h3>
                <ol className="relative space-y-4 border-s border-border ps-4">
                  {invoice.events.length === 0 && <li className="text-sm text-muted-foreground">{t("noEvents")}</li>}
                  {invoice.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-indigo-500 ring-4 ring-background" aria-hidden />
                      <p className="text-sm font-medium">{tt(`events.${e.type}` as never)}</p>
                      {e.message && <p className="text-xs text-muted-foreground">{e.message}</p>}
                      <p className="text-xs text-muted-foreground">{dateTime(e.createdAt, locale)}</p>
                    </li>
                  ))}
                </ol>
              </section>

              {invoice.status !== "VOID" && (
                <div className="border-t border-border/70 pt-4">
                  <Button type="button" variant="ghost" className="gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400" onClick={() => onAction("void", invoice)}>
                    <Ban className="size-4" aria-hidden /> {tt("actions.void")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
