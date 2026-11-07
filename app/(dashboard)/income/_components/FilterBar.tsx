"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { INVOICE_SOURCES, type InvoiceDisplayStatus } from "@/lib/invoices/types";
import { STATUS_ORDER, STATUS_STYLES } from "./income-utils";
import type { IncomeFilters } from "./use-income-data";

type Props = {
  filters: IncomeFilters;
  currentFy: string;
  statusCounts: Record<InvoiceDisplayStatus, number> | null;
  currencies: string[];
  clientName: string | null;
  onChange: (patch: Partial<IncomeFilters>) => void;
  exportHref: string;
};

const ALL = "__all__";

function fyOptions(currentFy: string): string[] {
  const start = Number(currentFy.slice(0, 2));
  return Array.from({ length: 5 }, (_, i) => {
    const s = start - i;
    return `${String(s).padStart(2, "0")}-${String(s + 1).padStart(2, "0")}`;
  });
}

export function FilterBar({ filters, currentFy, statusCounts, currencies, clientName, onChange, exportHref }: Props) {
  const t = useTranslations("Income");
  const [search, setSearch] = useState(filters.q);
  const lastPushed = useRef(filters.q);

  // Keep the box in sync when the URL changes from elsewhere (back button, clear filters).
  useEffect(() => {
    if (filters.q !== lastPushed.current) {
      setSearch(filters.q);
      lastPushed.current = filters.q;
    }
  }, [filters.q]);

  useEffect(() => {
    if (search === lastPushed.current) return;
    const timer = window.setTimeout(() => {
      lastPushed.current = search;
      onChange({ q: search.trim(), page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, onChange]);

  const total = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : null;
  const hasFilters = Boolean(filters.q || filters.status.length || filters.source.length || filters.currency || filters.clientId);

  const toggleStatus = (status: InvoiceDisplayStatus) => {
    const next = filters.status.includes(status) ? filters.status.filter((s) => s !== status) : [...filters.status, status];
    onChange({ status: next, page: 1 });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("filters.search")}
            aria-label={t("filters.search")}
            className="h-10 rounded-xl ps-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.fy} onValueChange={(fy) => onChange({ fy, page: 1 })}>
            <SelectTrigger className="h-10 w-[9.5rem] rounded-xl" aria-label={t("filters.period")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allTime")}</SelectItem>
              {fyOptions(currentFy).map((fy) => (
                <SelectItem key={fy} value={fy}>
                  {t("filters.fy", { fy })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.source[0] ?? ALL} onValueChange={(v) => onChange({ source: v === ALL ? [] : [v as (typeof INVOICE_SOURCES)[number]], page: 1 })}>
            <SelectTrigger className="h-10 w-[9.5rem] rounded-xl" aria-label={t("filters.source")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allSources")}</SelectItem>
              {INVOICE_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`source.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currencies.length > 1 && (
            <Select value={filters.currency || ALL} onValueChange={(v) => onChange({ currency: v === ALL ? "" : v, page: 1 })}>
              <SelectTrigger className="h-10 w-[8.5rem] rounded-xl" aria-label={t("filters.currency")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.allCurrencies")}</SelectItem>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button asChild variant="outline" className="h-10 rounded-xl">
            <a href={exportHref} download>
              <Download className="size-4" aria-hidden />
              {t("export")}
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filters.status")}>
        <button
          type="button"
          onClick={() => onChange({ status: [], page: 1 })}
          aria-pressed={filters.status.length === 0}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            filters.status.length === 0 ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {t("filters.all")}
          {total !== null && <span className="ms-1.5 tabular-nums opacity-70">{total}</span>}
        </button>
        {STATUS_ORDER.map((status) => {
          const active = filters.status.includes(status);
          const count = statusCounts?.[status];
          if (status === "VOID" && !active && !count) return null;
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", STATUS_STYLES[status].dot)} aria-hidden />
              {t(`status.${status}`)}
              {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}

        {filters.clientId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-3 py-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {t("filters.client", { name: clientName ?? "…" })}
            <button type="button" aria-label={t("filters.clear")} onClick={() => onChange({ clientId: "", page: 1 })} className="rounded-full p-0.5 hover:bg-indigo-500/20">
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        )}
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onChange({ q: "", status: [], source: [], currency: "", clientId: "", page: 1 });
            }}
            className="ms-auto text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("filters.clear")}
          </button>
        )}
      </div>
    </div>
  );
}

