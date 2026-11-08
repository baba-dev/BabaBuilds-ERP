"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Mail, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RetainerListItemDto } from "@/lib/retainers/types";
import { RetainerStatusBadge } from "./RetainerStatusBadge";
import { RetainerActionsMenu } from "./RetainerActionsMenu";
import { formatDate, formatMoney, initials, type RetainerRowAction } from "./retainer-utils";
import type { RetainerFilters, RetainerSort } from "./use-retainers-data";

type Props = {
  rows: RetainerListItemDto[]; loading: boolean; refreshing: boolean; locale: string; filters: RetainerFilters; activeId: string | null;
  page: number; totalPages: number; totalRecords: number; limit: number;
  onSort: (f: RetainerSort) => void; onAction: (a: RetainerRowAction, r: RetainerListItemDto) => void; onPage: (p: number) => void; onClientFilter: (id: string) => void;
};

function NextCell({ row, locale }: { row: RetainerListItemDto; locale: string }) {
  const t = useTranslations("RetainersHub.table");
  if (row.status === "CANCELLED" || row.status === "COMPLETED") return <span className="text-muted-foreground">—</span>;
  let hint: string | null = null;
  let tone = "text-muted-foreground";
  if (row.status === "PAUSED") hint = t("paused");
  else if (row.daysToNext < 0) { hint = t("overdueBy", { days: Math.abs(row.daysToNext) }); tone = "font-semibold text-amber-700 dark:text-amber-400"; }
  else if (row.daysToNext === 0) { hint = t("today"); tone = "font-semibold text-amber-700 dark:text-amber-400"; }
  else hint = t("inDays", { days: row.daysToNext });
  return (
    <div className="leading-tight">
      <div className="tabular-nums">{formatDate(row.nextBillingDate, locale)}</div>
      {hint && <div className={cn("text-xs", tone)}>{hint}</div>}
    </div>
  );
}

function CyclesCell({ row }: { row: RetainerListItemDto }) {
  const t = useTranslations("RetainersHub.table");
  if (row.maxCycles) return <span className="tabular-nums">{t("cyclesOf", { done: row.cyclesBilled, total: row.maxCycles })}</span>;
  return <span className="tabular-nums">{t("cycles", { count: row.cyclesBilled })}</span>;
}

function SortHeader({ field, label, filters, onSort, className }: { field: RetainerSort; label: string; filters: RetainerFilters; onSort: Props["onSort"]; className?: string }) {
  const t = useTranslations("RetainersHub.table");
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

export function RetainerTable(props: Props) {
  const { rows, loading, refreshing, locale, filters, activeId, page, totalPages, totalRecords, limit, onSort, onAction, onPage, onClientFilter } = props;
  const t = useTranslations("RetainersHub.table");
  const tf = useTranslations("RetainersHub.frequency");
  const from = totalRecords === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(totalRecords, page * limit);

  const nameBlock = (row: RetainerListItemDto) => (
    <>
      <button type="button" onClick={() => onAction("open", row)} className="block max-w-full truncate rounded-md text-start font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={row.name}>
        {row.name}
      </button>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>{t("items", { count: row.itemCount })}</span>
        {row.autoAppendMonth && <span className="inline-flex items-center gap-1"><Sparkles className="size-3 text-violet-500" aria-hidden />{t("smartNaming")}</span>}
        {row.emailInvoice && <span className="inline-flex items-center gap-1"><Mail className="size-3" aria-hidden />{t("autoEmail")}</span>}
        {row.pendingUsageCount > 0 && <span className="font-medium text-indigo-600 dark:text-indigo-400">{t("pendingUsage", { count: row.pendingUsageCount })}</span>}
      </div>
      {row.lastError && row.status === "ACTIVE" && (
        <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300" title={row.lastError}>
          <TriangleAlert className="size-3 shrink-0" aria-hidden /><span className="truncate">{t("billingFailed")}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className={cn("hidden overflow-x-auto transition-opacity md:block", refreshing && "opacity-60")} aria-busy={loading || refreshing}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortHeader field="name" label={t("retainer")} filters={filters} onSort={onSort} className="ps-4" />
              <th scope="col" className="px-3 py-3 text-start font-medium">{t("client")}</th>
              <th scope="col" className="px-3 py-3 text-end font-medium">{t("amount")}</th>
              <SortHeader field="nextBillingDate" label={t("nextBilling")} filters={filters} onSort={onSort} />
              <th scope="col" className="px-3 py-3 text-start font-medium">{t("billed")}</th>
              <SortHeader field="status" label={t("status")} filters={filters} onSort={onSort} />
              <th scope="col" className="pe-4"><span className="sr-only">{t("actions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading && rows.length === 0
              ? Array.from({ length: 6 }, (_, i) => <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>)
              : rows.map((row) => (
                  <tr key={row.id} data-active={activeId === row.id || undefined} className={cn("transition-colors hover:bg-muted/40 data-[active]:bg-indigo-500/5", (row.status === "CANCELLED" || row.status === "COMPLETED") && "text-muted-foreground")}>
                    <td className="max-w-[20rem] px-3 py-3 ps-4">{nameBlock(row)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-700 dark:text-indigo-300" aria-hidden>{initials(row.clientName)}</span>
                        <button type="button" onClick={() => onClientFilter(row.clientId)} className="max-w-[11rem] truncate rounded-md text-start font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={row.clientName}>{row.clientName}</button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums">
                      <div className="font-semibold">{formatMoney(row.total, row.currency, locale)}</div>
                      <div className="text-xs text-muted-foreground">{tf(row.frequency)}</div>
                    </td>
                    <td className="px-3 py-3"><NextCell row={row} locale={locale} /></td>
                    <td className="px-3 py-3 text-sm"><CyclesCell row={row} /></td>
                    <td className="px-3 py-3"><RetainerStatusBadge status={row.displayStatus} /></td>
                    <td className="pe-4"><RetainerActionsMenu row={row} onAction={onAction} /></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <ul className={cn("divide-y divide-border/60 transition-opacity md:hidden", refreshing && "opacity-60")}>
        {loading && rows.length === 0
          ? Array.from({ length: 4 }, (_, i) => <li key={i} className="p-4"><Skeleton className="h-20 w-full" /></li>)
          : rows.map((row) => (
              <li key={row.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">{nameBlock(row)}<p className="mt-1 truncate text-sm text-muted-foreground">{row.clientName}</p></div>
                  <RetainerStatusBadge status={row.displayStatus} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">{tf(row.frequency)}</p><p className="font-semibold tabular-nums">{formatMoney(row.total, row.currency, locale)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("nextBilling")}</p><NextCell row={row} locale={locale} /></div>
                </div>
                <div className="flex items-center justify-between gap-2"><CyclesCell row={row} /><RetainerActionsMenu row={row} onAction={onAction} /></div>
              </li>
            ))}
      </ul>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-sm text-muted-foreground sm:flex-row">
        <span aria-live="polite">{t("range", { from, to, total: totalRecords })}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)} className="gap-1 rounded-lg"><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />{t("previous")}</Button>
          <span className="tabular-nums">{t("page", { page, pages: totalPages })}</span>
          <Button type="button" variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => onPage(page + 1)} className="gap-1 rounded-lg">{t("next")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Button>
        </div>
      </div>
    </div>
  );
}
