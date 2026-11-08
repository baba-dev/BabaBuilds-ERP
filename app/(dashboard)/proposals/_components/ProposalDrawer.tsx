"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Eye, Paperclip, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProposalDetailDto } from "@/lib/proposals/types";
import { ProposalStatusBadge } from "./ProposalStatusBadge";
import { availableActions, formatDate, formatDateTime, formatMoney, type ProposalRowAction } from "./proposal-utils";
import { useJson } from "./use-proposals-data";

type Props = {
  proposalId: string | null;
  locale: string;
  reloadToken: number;
  onClose: () => void;
  onAction: (action: ProposalRowAction, row: ProposalDetailDto) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

const HEADLINE_ACTIONS: ProposalRowAction[] = ["convert", "send", "edit", "viewInvoice", "reopen"];
const SECONDARY_ACTIONS: ProposalRowAction[] = ["copyLink", "preview", "duplicate", "accept", "decline", "archive", "unarchive", "delete"];

export function ProposalDrawer({ proposalId, locale, reloadToken, onClose, onAction }: Props) {
  const t = useTranslations("ProposalsHub");
  const { data, error, loading, reload } = useJson<{ data: ProposalDetailDto }>(proposalId ? `/api/proposals/${proposalId}` : null);
  const p = data?.data && data.data.id === proposalId ? data.data : null;

  useEffect(() => {
    if (reloadToken > 0) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the parent signals a mutation
  }, [reloadToken]);

  const money = (v: string) => (p ? formatMoney(v, p.currency, locale) : "");
  const actions = p ? availableActions(p.displayStatus, p.status, p.archived) : [];
  const declinedOptional = p && ["ACCEPTED", "INVOICED"].includes(p.status) ? p.items.filter((i) => i.isOptional && !i.isSelected) : [];

  return (
    <Sheet open={Boolean(proposalId)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="space-y-3 border-b border-border/70 p-5 pe-12">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
            <span className="min-w-0 break-words">{p ? p.title : t("drawer.loading")}</span>
            {p && <ProposalStatusBadge status={p.displayStatus} />}
          </SheetTitle>
          <SheetDescription>{p ? `${p.proposalNo} · ${p.clientName}` : " "}</SheetDescription>
          {p && (
            <>
              <p className="text-3xl font-bold tabular-nums tracking-tight">{money(p.totalAmount)}</p>
              <div className="flex flex-wrap gap-2">
                {HEADLINE_ACTIONS.filter((a) => actions.includes(a)).map((a, i) => (
                  <Button key={a} size="sm" variant={i === 0 ? "primary-action" : "outline"} onClick={() => onAction(a, p)}>
                    {a === "send" && p.status !== "DRAFT" ? t("actions.sendReminder") : t(`actions.${a}`)}
                  </Button>
                ))}
                {SECONDARY_ACTIONS.filter((a) => actions.includes(a)).map((a) => (
                  <Button key={a} size="sm" variant="ghost" onClick={() => onAction(a, p)} className={cn(a === "delete" || a === "decline" ? "text-rose-600 hover:text-rose-700" : "")}>
                    {t(`actions.${a}`)}
                  </Button>
                ))}
              </div>
            </>
          )}
        </SheetHeader>

        <div className="space-y-6 p-5">
          {error && !p && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
          {!p && loading && (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {p && (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label={t("drawer.validUntil")}>{formatDate(p.validUntil, locale)}</Field>
                <Field label={t("drawer.created")}>{formatDate(p.dateCreated, locale)}</Field>
                <Field label={t("drawer.revision")}>{p.revision}</Field>
                <Field label={t("drawer.views")}>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3.5 text-muted-foreground" aria-hidden /> {p.viewCount}
                  </span>
                </Field>
                <Field label={t("drawer.lastViewed")}>{p.lastViewedAt ? formatDateTime(p.lastViewedAt, locale) : "—"}</Field>
                <Field label={t("drawer.invoice")}>
                  {p.invoice ? (
                    <a className="text-indigo-600 hover:underline dark:text-indigo-400" href={`/income?invoice=${p.invoice.id}`}>
                      {p.invoice.invoiceNumber}
                    </a>
                  ) : (
                    "—"
                  )}
                </Field>
              </dl>

              {p.status === "ACCEPTED" || p.status === "INVOICED" ? (
                <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-300">
                  {t("drawer.acceptedBy", { name: p.acceptedByName ?? "—", date: p.acceptedAt ? formatDateTime(p.acceptedAt, locale) : "—" })}
                </p>
              ) : null}
              {p.declineReason && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-800 dark:text-rose-300">
                  <span className="font-semibold">{t("drawer.declineReason")}: </span>
                  {p.declineReason}
                </p>
              )}

              <section aria-labelledby="pd-items" className="space-y-2">
                <h3 id="pd-items" className="text-sm font-semibold">{t("drawer.items")}</h3>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
                  {p.items.map((i) => {
                    const out = i.isOptional && !i.isSelected && ["ACCEPTED", "INVOICED"].includes(p.status);
                    return (
                      <li key={i.id} className={cn("flex items-start justify-between gap-3 px-3 py-2.5 text-sm", out && "opacity-60")}>
                        <div className="min-w-0">
                          <p className={cn("font-medium", out && "line-through")}>{i.title}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {i.quantity} × {money(i.unitPrice)}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {i.isOptional && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                                <Paperclip className="size-3" aria-hidden /> {out ? t("drawer.declinedByClient") : t("drawer.optional")}
                              </span>
                            )}
                            {i.isRecurring && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                                <Repeat className="size-3" aria-hidden /> {t("drawer.recurring")}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={cn("font-semibold tabular-nums", out && "line-through")}>{money(i.total)}</span>
                      </li>
                    );
                  })}
                </ul>
                <dl className="space-y-1 pt-1 text-sm tabular-nums">
                  <div className="flex justify-between"><dt className="text-muted-foreground">{t("drawer.subtotal")}</dt><dd>{money(p.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">{t("drawer.tax", { rate: p.taxRatePercent })}</dt><dd>{money(p.estimatedTax)}</dd></div>
                  <div className="flex justify-between text-base font-bold"><dt>{t("drawer.total")}</dt><dd>{money(p.totalAmount)}</dd></div>
                </dl>
                {declinedOptional.length > 0 && <p className="text-xs text-muted-foreground">{t("drawer.optionalNote", { count: declinedOptional.length })}</p>}
              </section>

              {p.milestones.length > 0 && (
                <section aria-labelledby="pd-milestones" className="space-y-2">
                  <h3 id="pd-milestones" className="text-sm font-semibold">{t("drawer.milestones")}</h3>
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/70 text-sm">
                    {p.milestones.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.title}</span>
                          {m.dueDate && <span className="text-xs text-muted-foreground">{formatDate(m.dueDate, locale)}</span>}
                        </span>
                        <span className="font-semibold tabular-nums">{money(m.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="pd-timeline" className="space-y-3">
                <h3 id="pd-timeline" className="text-sm font-semibold">{t("drawer.timeline")}</h3>
                <ol className="relative space-y-4 border-s border-border/70 ps-5">
                  {p.timeline.map((e) => (
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
