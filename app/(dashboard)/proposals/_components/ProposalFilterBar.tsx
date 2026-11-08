"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProposalDisplayStatus } from "@/lib/proposals/status";
import { STATUS_ORDER, STATUS_STYLES } from "./proposal-utils";
import type { ProposalFilters } from "./use-proposals-data";

type Props = {
  filters: ProposalFilters;
  statusCounts: Record<ProposalDisplayStatus, number> | null;
  clientName: string | null;
  onChange: (patch: Partial<ProposalFilters>) => void;
};

export function ProposalFilterBar({ filters, statusCounts, clientName, onChange }: Props) {
  const t = useTranslations("ProposalsHub");
  const [search, setSearch] = useState(filters.q);
  const lastPushed = useRef(filters.q);

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
  const hasFilters = Boolean(filters.q || filters.status.length || filters.clientId || filters.archived);
  const toggle = (status: ProposalDisplayStatus) =>
    onChange({ status: filters.status.includes(status) ? filters.status.filter((s) => s !== status) : [...filters.status, status], page: 1 });

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("filters.search")} aria-label={t("filters.search")} className="h-10 rounded-xl ps-9" />
        </div>
        <button type="button" aria-pressed={filters.archived} onClick={() => onChange({ archived: !filters.archived, page: 1 })} className={cn(chip(filters.archived), "h-10 justify-center rounded-xl")}>
          <Archive className="size-4" aria-hidden />
          {t("filters.archived")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filters.status")}>
        <button type="button" onClick={() => onChange({ status: [], page: 1 })} aria-pressed={filters.status.length === 0} className={chip(filters.status.length === 0)}>
          {t("filters.all")}
          {total !== null && <span className="tabular-nums opacity-70">{total}</span>}
        </button>
        {STATUS_ORDER.map((status) => {
          const active = filters.status.includes(status);
          const count = statusCounts?.[status];
          if (!active && !count && (status === "EXPIRED" || status === "DECLINED" || status === "REVISION_REQUESTED")) return null;
          return (
            <button key={status} type="button" onClick={() => toggle(status)} aria-pressed={active} className={chip(active)}>
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
              onChange({ q: "", status: [], clientId: "", archived: false, page: 1 });
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
