"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RetainerDisplayStatus } from "@/lib/retainers/status";
import { STATUS_ORDER, STATUS_STYLES } from "./retainer-utils";
import type { RetainerFilters } from "./use-retainers-data";

type Props = { filters: RetainerFilters; statusCounts: Record<RetainerDisplayStatus, number> | null; clientName: string | null; onChange: (patch: Partial<RetainerFilters>) => void };
const ALL = "__all__";

export function RetainerFilterBar({ filters, statusCounts, clientName, onChange }: Props) {
  const t = useTranslations("RetainersHub");
  const [search, setSearch] = useState(filters.q);
  const last = useRef(filters.q);
  useEffect(() => {
    if (filters.q !== last.current) {
      setSearch(filters.q);
      last.current = filters.q;
    }
  }, [filters.q]);
  useEffect(() => {
    if (search === last.current) return;
    const timer = window.setTimeout(() => {
      last.current = search;
      onChange({ q: search.trim(), page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, onChange]);

  const total = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : null;
  const hasFilters = Boolean(filters.q || filters.status.length || filters.frequency || filters.clientId);
  const toggle = (s: RetainerDisplayStatus) => onChange({ status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s], page: 1 });
  const chip = (active: boolean) =>
    cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("filters.search")} aria-label={t("filters.search")} className="h-10 rounded-xl ps-9" />
        </div>
        <Select value={filters.frequency || ALL} onValueChange={(v) => onChange({ frequency: v === ALL ? "" : v, page: 1 })}>
          <SelectTrigger className="h-10 w-full rounded-xl sm:w-[10.5rem]" aria-label={t("filters.frequency")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allFrequencies")}</SelectItem>
            {["MONTHLY", "QUARTERLY", "ANNUALLY"].map((f) => <SelectItem key={f} value={f}>{t(`frequency.${f}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filters.status")}>
        <button type="button" onClick={() => onChange({ status: [], page: 1 })} aria-pressed={filters.status.length === 0} className={chip(filters.status.length === 0)}>
          {t("filters.all")}
          {total !== null && <span className="tabular-nums opacity-70">{total}</span>}
        </button>
        {STATUS_ORDER.map((s) => {
          const active = filters.status.includes(s);
          const count = statusCounts?.[s];
          if (!active && !count && (s === "COMPLETED" || s === "CANCELLED" || s === "DUE")) return null;
          return (
            <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={active} className={chip(active)}>
              <span className={cn("size-2 rounded-full", STATUS_STYLES[s].dot)} aria-hidden />
              {t(`status.${s}`)}
              {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}
        {filters.clientId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-3 py-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {t("filters.client", { name: clientName ?? "…" })}
            <button type="button" aria-label={t("filters.clear")} onClick={() => onChange({ clientId: "", page: 1 })} className="rounded-full p-0.5 hover:bg-indigo-500/20"><X className="size-3.5" aria-hidden /></button>
          </span>
        )}
        {hasFilters && (
          <button type="button" onClick={() => { setSearch(""); onChange({ q: "", status: [], frequency: "", clientId: "", page: 1 }); }} className="ms-auto text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t("filters.clear")}
          </button>
        )}
      </div>
    </div>
  );
}
