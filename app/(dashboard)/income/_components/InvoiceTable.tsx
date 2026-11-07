"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileText, Link2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InvoiceListItemDto } from "@/lib/invoices/types";
import { StatusBadge } from "./StatusBadge";
import { RowActionsMenu, type RowAction } from "./RowActionsMenu";
import { formatMoney, initials } from "./income-utils";
import type { IncomeFilters } from "./use-income-data";

type Props = {
  rows: InvoiceListItemDto[];
  loading: boolean;
  refreshing: boolean;
  locale: string;
  baseCurrency: string;
  filters: IncomeFilters;
  selected: Set<string>;
  activeId: string | null;
  page: number;
  totalPages: number;
  totalRecords: number;
  limit: number;
  onSort: (field: IncomeFilters["sort"]) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onAction: (action: RowAction, row: InvoiceListItemDto) => void;
  onPage: (page: number) => void;
  onClientFilter: (clientId: string) => void;
};

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

function DueCell({ row, locale }: { row: InvoiceListItemDto; locale: string }) {
  const t = useTranslations("Income.table");
  if (!row.dueDate) return <span className="text-muted-foreground">—</span>;
  const open = row.status === "PENDING" || row.status === "PARTIALLY_PAID";
  let hint: string | null = null;
  if (row.displayStatus === "OVERDUE" && row.daysOverdue) hint = t("daysLate", { days: row.daysOverdue });
  else if (open) {
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const days = Math.round((Date.parse(row.dueDate) - today) / 86_400_000);
    hint = days <= 0 ? t("dueToday") : t("dueIn", { days });
  }
  return (
    <div className="leading-tight">
      <div className="tabular-nums">{formatDate(row.dueDate, locale)}</div>
      {hint && <div className={cn("text-xs", row.displayStatus === "OVERDUE" ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>{hint}</div>}
    </div>
  );
}

function SortHeader({ field, label, filters, onSort, className }: { field: IncomeFilters["sort"]; label: string; filters: IncomeFilters; onSort: Props["onSort"]; className?: string }) {
  const t = useTranslations("Income.table");
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

export function InvoiceTable(props: Props) {
  const { rows, loading, refreshing, locale, baseCurrency, filters, selected, activeId, page, totalPages, totalRecords, limit, onSort, onToggle, onToggleAll, onAction, onPage, onClientFilter } = props;
  const t = useTranslations("Income.table");
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const from = totalRecords === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(totalRecords, page * limit);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      {/* Desktop table */}
      <div className={cn("hidden overflow-x-auto md:block transition-opacity", refreshing && "opacity-60")} aria-busy={loading || refreshing}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 ps-4">
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label={t("selectAll")} className="size-4 rounded border-border accent-indigo-600" />
              </th>
              <SortHeader field="invoiceNumber" label={t("invoice")} filters={filters} onSort={onSort} />
              <SortHeader field="clientName" label={t("client")} filters={filters} onSort={onSort} />
              <SortHeader field="invoiceDate" label={t("issued")} filters={filters} onSort={onSort} />
              <SortHeader field="dueDate" label={t("due")} filters={filters} onSort={onSort} />
              <SortHeader field="amount" label={t("amount")} filters={filters} onSort={onSort} className="text-end" />
              <th scope="col" className="px-3 py-3 text-end font-medium">{t("balance")}</th>
              <SortHeader field="status" label={t("status")} filters={filters} onSort={onSort} />
              <th scope="col" className="pe-4"><span className="sr-only">{t("actions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading && rows.length === 0
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-4 py-3">
                      <Skeleton className="h-9 w-full" />
                    </td>
                  </tr>
                ))
              : rows.map((row) => {
                  const foreign = row.currency !== baseCurrency;
                  const isVoid = row.status === "VOID";
                  return (
                    <tr
                      key={row.id}
                      data-active={activeId === row.id || undefined}
                      className={cn(
                        "group transition-colors hover:bg-muted/40 data-[active]:bg-indigo-500/5",
                        row.displayStatus === "OVERDUE" && "bg-rose-500/[0.03]",
                        isVoid && "text-muted-foreground",
                      )}
                    >
                      <td className="ps-4">
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => onToggle(row.id)} aria-label={t("selectRow", { number: row.invoiceNumber })} className="size-4 rounded border-border accent-indigo-600" />
                      </td>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => onAction("open", row)} className={cn("rounded-md text-start font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isVoid && "line-through")}>
                          {row.invoiceNumber}
                        </button>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {row.source !== "MANUAL" && <SourceTag row={row} />}
                          {row.hasPaymentLink && (
                            <span className="inline-flex items-center gap-1" title={row.paymentLinkGateway ?? undefined}>
                              <Link2 className="size-3" aria-hidden />
                              {t("paymentLink")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-700 dark:text-indigo-300" aria-hidden>
                            {initials(row.clientName)}
                          </span>
                          {row.clientId ? (
                            <button type="button" onClick={() => onClientFilter(row.clientId!)} className="max-w-[12rem] truncate rounded-md text-start font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={row.clientName}>
                              {row.clientName}
                            </button>
                          ) : (
                            <span className="max-w-[12rem] truncate font-medium">{row.clientName}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">{formatDate(row.invoiceDate, locale)}</td>
                      <td className="px-3 py-3">
                        <DueCell row={row} locale={locale} />
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        <div className={cn("font-semibold", isVoid && "line-through")}>{formatMoney(row.grandTotal, row.currency, locale)}</div>
                        {foreign && <div className="text-xs text-muted-foreground">≈ {formatMoney(row.baseGrandTotal, baseCurrency, locale)}</div>}
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums">
                        {isVoid || Number(row.balance) === 0 ? <span className="text-muted-foreground">—</span> : <span className="font-semibold">{formatMoney(row.balance, row.currency, locale)}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.displayStatus} />
                      </td>
                      <td className="pe-4">
                        <RowActionsMenu row={row} onAction={onAction} />
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className={cn("divide-y divide-border/60 md:hidden transition-opacity", refreshing && "opacity-60")}>
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
                    <button type="button" onClick={() => onAction("open", row)} className={cn("font-semibold hover:underline", row.status === "VOID" && "line-through")}>
                      {row.invoiceNumber}
                    </button>
                    <p className="truncate text-sm text-muted-foreground">{row.clientName}</p>
                  </div>
                  <StatusBadge status={row.displayStatus} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("amount")}</p>
                    <p className="font-semibold tabular-nums">{formatMoney(row.grandTotal, row.currency, locale)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("due")}</p>
                    <DueCell row={row} locale={locale} />
                  </div>
                </div>
                <RowActionsMenu row={row} onAction={onAction} />
              </li>
            ))}
      </ul>

      {/* Footer / pagination */}
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

function SourceTag({ row }: { row: InvoiceListItemDto }) {
  const t = useTranslations("Income");
  const label = t(`source.${row.source}`);
  if (row.source === "PROPOSAL" && row.sourceProposalId) {
    return (
      <Link href={`/proposals/${row.sourceProposalId}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400">
        <FileText className="size-3" aria-hidden />
        {label}
      </Link>
    );
  }
  return <span>{label}</span>;
}
