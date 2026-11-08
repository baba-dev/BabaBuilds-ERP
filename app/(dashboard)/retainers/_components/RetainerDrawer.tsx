"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Gauge, Mail, Sparkles, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RetainerDetailDto } from "@/lib/retainers/types";
import { RetainerStatusBadge } from "./RetainerStatusBadge";
import { availableActions, formatDate, formatDateTime, formatMoney, type RetainerRowAction } from "./retainer-utils";
import { useJson } from "./use-retainers-data";

type Props = {
  retainerId: string | null; locale: string; reloadToken: number; onClose: () => void;
  onAction: (a: RetainerRowAction, r: RetainerDetailDto) => void; onRemoveUsage: (retainerId: string, usageId: string) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-0.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{children}</dd></div>;
}

const HEADLINE: RetainerRowAction[] = ["billNow", "resume", "edit", "addUsage"];
const SECONDARY: RetainerRowAction[] = ["pause", "cancel", "delete"];

export function RetainerDrawer({ retainerId, locale, reloadToken, onClose, onAction, onRemoveUsage }: Props) {
  const t = useTranslations("RetainersHub");
  const { data, error, loading, reload } = useJson<{ data: RetainerDetailDto }>(retainerId ? `/api/retainers/${retainerId}` : null);
  const r = data?.data && data.data.id === retainerId ? data.data : null;
  useEffect(() => {
    if (reloadToken > 0) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the parent signals a mutation
  }, [reloadToken]);

  const money = (v: string) => (r ? formatMoney(v, r.currency, locale) : "");
  const actions = r ? availableActions(r.status, r.cyclesBilled) : [];
  const live = r && (r.status === "ACTIVE" || r.status === "PAUSED");

  return (
    <Sheet open={Boolean(retainerId)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="space-y-3 border-b border-border/70 p-5 pe-12">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
            <span className="min-w-0 break-words">{r ? r.name : t("drawer.loading")}</span>
            {r && <RetainerStatusBadge status={r.displayStatus} />}
          </SheetTitle>
          <SheetDescription>
            {r ? (
              <Link href={`/clients?protocolEntity=client&protocolRecord=${r.clientId}`} className="text-indigo-600 hover:underline dark:text-indigo-400">{r.clientName}</Link>
            ) : " "}
          </SheetDescription>
          {r && (
            <>
              <p className="text-3xl font-bold tabular-nums tracking-tight">
                {money(r.total)} <span className="text-base font-medium text-muted-foreground">/ {t(`frequencyShort.${r.frequency}`)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {HEADLINE.filter((a) => actions.includes(a)).map((a, i) => (
                  <Button key={a} size="sm" variant={i === 0 ? "primary-action" : "outline"} onClick={() => onAction(a, r)}>{t(`actions.${a}`)}</Button>
                ))}
                {SECONDARY.filter((a) => actions.includes(a)).map((a) => (
                  <Button key={a} size="sm" variant="ghost" onClick={() => onAction(a, r)} className={cn(a !== "pause" && "text-rose-600 hover:text-rose-700")}>{t(`actions.${a}`)}</Button>
                ))}
              </div>
            </>
          )}
        </SheetHeader>

        <div className="space-y-6 p-5">
          {error && !r && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          {!r && loading && <div className="space-y-3" aria-busy><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-32 w-full" /></div>}

          {r && (
            <>
              {r.lastError && r.status === "ACTIVE" && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div><p className="font-semibold">{t("drawer.lastErrorTitle")}</p><p className="opacity-90">{r.lastError}</p></div>
                </div>
              )}
              {r.displayStatus === "DUE" && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">{t("drawer.dueNote")}</p>}

              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label={t("drawer.nextBilling")}>{r.status === "ACTIVE" || r.status === "PAUSED" ? formatDate(r.nextBillingDate, locale) : "—"}</Field>
                <Field label={t("drawer.cycles")}>{r.maxCycles ? t("table.cyclesOf", { done: r.cyclesBilled, total: r.maxCycles }) : r.cyclesBilled}</Field>
                <Field label={t("drawer.ends")}>{r.endDate ? formatDate(r.endDate, locale) : t("drawer.noEnd")}</Field>
                <Field label={t("drawer.paymentTerms")}>{t("drawer.days", { count: r.paymentTermsDays })}</Field>
                <Field label={t("drawer.lastBilled")}>{r.lastBilledAt ? formatDateTime(r.lastBilledAt, locale) : "—"}</Field>
                <Field label={t("drawer.delivery")}>
                  <span className="inline-flex items-center gap-1">
                    {r.emailInvoice ? <><Mail className="size-3.5 text-muted-foreground" aria-hidden />{t("drawer.autoEmail")}</> : t("drawer.manualSend")}
                  </span>
                </Field>
              </dl>
              {r.notes && <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{r.notes}</p>}

              <section aria-labelledby="rd-connected" className="space-y-2">
                <h3 id="rd-connected" className="text-sm font-semibold">{t("drawer.connected")}</h3>
                <div className="flex flex-wrap gap-2 text-sm">
                  {r.sourceProposal && <Link href={`/proposals?proposal=${r.sourceProposal.id}`} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-indigo-600 hover:bg-muted dark:text-indigo-400"><Sparkles className="size-3.5" aria-hidden />{t("drawer.origin", { number: r.sourceProposal.proposalNo })}</Link>}
                  <Link href={`/income?source=RETAINER&clientId=${r.clientId}`} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 hover:bg-muted">{t("drawer.allInvoices")} <ExternalLink className="size-3" aria-hidden /></Link>
                  <Link href="/cash-flow" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 hover:bg-muted">{t("drawer.forecast")} <ExternalLink className="size-3" aria-hidden /></Link>
                  <Link href="/services" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 hover:bg-muted">{t("drawer.catalog")} <ExternalLink className="size-3" aria-hidden /></Link>
                </div>
              </section>

              <section aria-labelledby="rd-items" className="space-y-2">
                <h3 id="rd-items" className="text-sm font-semibold">{t("drawer.items")}</h3>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
                  {r.items.map((i) => (
                    <li key={i.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{i.title}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{i.quantity} × {money(i.unitPrice)}{i.taxRatePercent > 0 ? ` · ${i.taxRatePercent}%` : ""}</p>
                      </div>
                      <span className="font-semibold tabular-nums">{money(i.total)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1 pt-1 text-sm tabular-nums">
                  <div className="flex justify-between"><dt className="text-muted-foreground">{t("drawer.subtotal")}</dt><dd>{money(r.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">{t("drawer.tax")}</dt><dd>{money(r.taxAmount)}</dd></div>
                  <div className="flex justify-between text-base font-bold"><dt>{t("drawer.perCycle")}</dt><dd>{money(r.total)}</dd></div>
                </dl>
              </section>

              {live && r.upcoming.length > 0 && (
                <section aria-labelledby="rd-upcoming" className="space-y-2">
                  <h3 id="rd-upcoming" className="text-sm font-semibold">{t("drawer.upcoming")}</h3>
                  <ol className="flex flex-wrap gap-2">
                    {r.upcoming.map((u) => <li key={u.date} className="rounded-lg border border-border/70 px-2.5 py-1.5 text-xs tabular-nums"><span className="font-semibold">{formatDate(u.date, locale)}</span> · {money(u.total)}</li>)}
                  </ol>
                </section>
              )}

              {(r.usage.some((u) => u.status === "PENDING") || r.status === "ACTIVE") && (
                <section aria-labelledby="rd-usage" className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 id="rd-usage" className="text-sm font-semibold">{t("drawer.usage")}</h3>
                    {r.status === "ACTIVE" && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAction("addUsage", r)}><Gauge className="size-3.5" aria-hidden />{t("actions.addUsage")}</Button>}
                  </div>
                  {r.usage.filter((u) => u.status === "PENDING").length === 0 ? <p className="text-sm text-muted-foreground">{t("drawer.noUsage")}</p> : (
                    <ul className="divide-y divide-border/60 rounded-xl border border-border/70 text-sm">
                      {r.usage.filter((u) => u.status === "PENDING").map((u) => (
                        <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0"><span className="block truncate font-medium">{u.description}</span><span className="text-xs text-muted-foreground tabular-nums">{u.quantity} × {money(u.unitPrice)}</span></span>
                          <span className="flex items-center gap-1"><span className="font-semibold tabular-nums">{money(u.total)}</span>
                            <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={t("drawer.removeUsage")} onClick={() => onRemoveUsage(r.id, u.id)}><X className="size-3.5" aria-hidden /></Button></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              <section aria-labelledby="rd-invoices" className="space-y-2">
                <h3 id="rd-invoices" className="text-sm font-semibold">{t("drawer.invoices")}</h3>
                {r.invoices.length === 0 ? <p className="text-sm text-muted-foreground">{t("drawer.noInvoices")}</p> : (
                  <>
                    <p className="text-xs text-muted-foreground">{t("drawer.invoiceTotals", { billed: money(r.invoiceTotals.billed), outstanding: money(r.invoiceTotals.outstanding) })}</p>
                    <ul className="divide-y divide-border/60 rounded-xl border border-border/70 text-sm">
                      {r.invoices.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0">
                            <Link href={`/income?invoice=${i.id}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">{i.invoiceNumber}</Link>
                            <span className="block text-xs text-muted-foreground">{formatDate(i.invoiceDate, locale)}</span>
                          </span>
                          <span className="text-end">
                            <span className="block font-semibold tabular-nums">{formatMoney(i.total, i.currency, locale)}</span>
                            <span className={cn("text-xs", i.overdue ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
                              {i.status === "PAID" ? t("drawer.paid") : i.status === "VOID" ? t("drawer.void") : i.overdue ? t("drawer.overdue", { amount: formatMoney(i.balance, i.currency, locale) }) : t("drawer.due", { amount: formatMoney(i.balance, i.currency, locale) })}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <section aria-labelledby="rd-timeline" className="space-y-3">
                <h3 id="rd-timeline" className="text-sm font-semibold">{t("drawer.timeline")}</h3>
                <ol className="relative space-y-4 border-s border-border/70 ps-5">
                  {r.timeline.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -start-[1.6rem] top-1 size-2.5 rounded-full border-2 border-background bg-indigo-500" aria-hidden />
                      <p className="text-sm font-medium">{t(`event.${e.type}`)}</p>
                      {e.message && <p className="mt-0.5 whitespace-pre-wrap rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm text-muted-foreground">{e.message}</p>}
                      <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, locale)}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
