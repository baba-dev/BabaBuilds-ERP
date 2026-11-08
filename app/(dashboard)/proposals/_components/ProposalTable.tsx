"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProposalListItemDto } from "@/lib/proposals/types";
import { ProposalStatusBadge } from "./ProposalStatusBadge";
import { ProposalActionsMenu } from "./ProposalActionsMenu";
import { formatDate, formatMoney, initials, timeAgo, type ProposalRowAction } from "./proposal-utils";
import type { ProposalFilters, ProposalSort } from "./use-proposals-data";

type Props = {
  rows: ProposalListItemDto[];
  loading: boolean;
  refreshing: boolean;
  locale: string;
  filters: ProposalFilters;
  activeId: string | null;
  page: number;
  totalPages: number;
  totalRecords: number;
  limit: number;
  onSort: (field: ProposalSort) => void;
  onAction: (action: ProposalRowAction, row: ProposalListItemDto) => void;
  onPage: (page: number) => void;
  onClientFilter: (clientId: string) => void;
};

function ValidityCell({ row, locale }: { row: ProposalListItemDto; locale: string }) {
  const t = useTranslations("ProposalsHub.table");
  const open = ["SENT", "VIEWED", "REVISION_REQUESTED"].includes(row.status);
  let hint: string | null = null;
  let tone = "text-muted-foreground";
  if (open) {
    if (row.daysToExpiry < 0) {
      hint = t("expiredAgo", { days: Math.abs(row.daysToExpiry) });
      tone = "font-semibold text-orange-700 dark:text-orange-400";
    } else if (row.daysToExpiry === 0) {
      hint = t("expiresToday");
      tone = "font-semibold text-amber-700 dark:text-amber-400";
    } else {
      hint = t("expiresIn", { days: row.daysToExpiry });
      if (row.daysToExpiry <= 7) tone = "font-semibold text-amber-700 dark:text-amber-400";
    }
  }
  return (
    <div className="leading-tight">
      <div className="tabular-nums">{formatDate(row.validUntil, locale)}</div>
      {hint && <div className={cn("text-xs", tone)}>{hint}</div>}
    </div>
  );
}

function ActivityCell({ row, locale }: { row: ProposalListItemDto; locale: string }) {
  const t = useTranslations("ProposalsHub.table");
  if (row.status === "DRAFT") return <span className="text-xs text-muted-foreground">{t("notSent")}</span>;
  if (row.viewCount === 0) return <span className="text-xs text-muted-foreground">{t("notViewed")}</span>;
  return (
    <div className="leading-tight">
      <div className="inline-flex items-center gap-1 text-sm">
        <Eye className="size-3.5 text-muted-foreground" aria-hidden />
        {t("views", { count: row.viewCount })}
      </div>
      {row.lastViewedAt && <div className="text-xs text-muted-foreground">{timeAgo(row.lastViewedAt, locale)}</div>}
    </div>
  );
}

function SortHeader({ field, label, filters, onSort, className }: { field: ProposalSort; label: string; filters: ProposalFilters; onSort: Props["onSort"]; className?: string }) {
  const t = useTranslations("ProposalsHub.table");
  const active = filters.sort === field;
  const Icon = !active ? ArrowUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-3 text-start font-medium", className)}>
      <button type="button" onClick={() => onSort(field)} aria-label={t("sortBy", { column: label })} className="inline-flex items-center gap-1 rounded-md uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
        <Icon className={cn("size-3.5", active ? "text-foreground" : "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

export function ProposalTable(props: Props) {
  const { rows, loading, refreshing, locale, filters, activeId, page, totalPages, totalRecords, limit, onSort, onAction, onPage, onClientFilter } = props;
  const t = useTranslations("ProposalsHub.table");
  const from = totalRecords === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(totalRecords, page * limit);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className={cn("hidden overflow-x-auto transition-opacity md:block", refreshing && "opacity-60")} aria-busy={loading || refreshing}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortHeader field="proposalNo" label={t("proposal")} filters={filters} onSort={onSort} className="ps-4" />
              <th scope="col" className="px-3 py-3 text-start font-medium">{t("client")}</th>
              <SortHeader field="totalAmount" label={t("value")} filters={filters} onSort={onSort} className="text-end" />
              <SortHeader field="validUntil" label={t("validUntil")} filters={filters} onSort={onSort} />
              <th scope="col" className="px-3 py-3 text-start font-medium">{t("activity")}</th>
              <SortHeader field="status" label={t("status")} filters={filters} onSort={onSort} />
              <th scope="col" className="pe-4"><span className="sr-only">{t("actions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading && rows.length === 0
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={row.id} data-active={activeId === row.id || undefined} className={cn("group transition-colors hover:bg-muted/40 data-[active]:bg-indigo-500/5", row.archived && "text-muted-foreground")}>
                    <td className="max-w-[18rem] px-3 py-3 ps-4">
                      <button type="button" onClick={() => onAction("open", row)} className="block max-w-full truncate rounded-md text-start font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={row.title}>
                        {row.title}
                      </button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="tabular-nums">{row.proposalNo}</span>
                        {row.revision > 1 && <span>{t("revision", { n: row.revision })}</span>}
                        {row.optionalCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Paperclip className="size-3" aria-hidden />
                            {t("optional", { count: row.optionalCount })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-700 dark:text-indigo-300" aria-hidden>
                          {initials(row.clientName)}
                        </span>
                        <button type="button" onClick={() => onClientFilter(row.clientId)} className="max-w-[11rem] truncate rounded-md text-start font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={row.clientName}>
                          {row.clientName}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums">
                      <div className="font-semibold">{formatMoney(row.totalAmount, row.currency, locale)}</div>
                      <div className="text-xs text-muted-foreground">{t("items", { count: row.itemCount })}</div>
                    </td>
                    <td className="px-3 py-3">
                      <ValidityCell row={row} locale={locale} />
                    </td>
                    <td className="px-3 py-3">
                      <ActivityCell row={row} locale={locale} />
                    </td>
                    <td className="px-3 py-3">
                      <ProposalStatusBadge status={row.displayStatus} />
                    </td>
                    <td className="pe-4">
                      <ProposalActionsMenu row={row} onAction={onAction} />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <ul className={cn("divide-y divide-border/60 transition-opacity md:hidden", refreshing && "opacity-60")}>
        {loading && rows.length === 0
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="p-4">
                <Skeleton className="h-20 w-full" />
              </li>
            ))
          : rows.map((row) => (
              <li key={row.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => onAction("open", row)} className="block max-w-full truncate text-start font-semibold hover:underline">
                      {row.title}
                    </button>
                    <p className="truncate text-sm text-muted-foreground">
                      {row.clientName} · <span className="tabular-nums">{row.proposalNo}</span>
                    </p>
                  </div>
                  <ProposalStatusBadge status={row.displayStatus} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("value")}</p>
                    <p className="font-semibold tabular-nums">{formatMoney(row.totalAmount, row.currency, locale)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("validUntil")}</p>
                    <ValidityCell row={row} locale={locale} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <ActivityCell row={row} locale={locale} />
                  <ProposalActionsMenu row={row} onAction={onAction} />
                </div>
              </li>
            ))}
      </ul>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-sm text-muted-foreground sm:flex-row">
        <span aria-live="polite">{t("range", { from, to, total: totalRecords })}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} className="gap-1 rounded-lg">
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t("previous")}
          </Button>
          <span className="tabular-nums">{t("page", { page, pages: totalPages })}</span>
          <Button type="button" variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => onPage(page + 1)} className="gap-1 rounded-lg">
            {t("next")}
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
