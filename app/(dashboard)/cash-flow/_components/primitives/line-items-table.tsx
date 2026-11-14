"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowUpDown, ExternalLink, Filter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SnapshotLineItem } from "../types";
import { CashFlowHelp } from "./help";
import { labelForClassification, sourceRecordHref, sumLineItems, toneForVariance } from "./utils";
import { cashFlowTypography, dt } from "../cash-flow-typography";

type SortKey = "expectedDate" | "amount" | "confidence";
type SortDir = "asc" | "desc";

function safeDateLabel(iso: string) {
  try {
    return format(new Date(iso), "dd MMM yyyy");
  } catch {
    return "—";
  }
}

function confidenceLabel(conf: number | null) {
  if (conf == null || !Number.isFinite(conf)) return "—";
  return `${Math.round(conf * 100)}%`;
}

function confidenceTone(conf: number | null): "default" | "secondary" | "outline" {
  if (conf == null || !Number.isFinite(conf)) return "default";
  if (conf >= 0.8) return "secondary";
  return "outline";
}

export function CashFlowLineItemsTable({
  items,
  directionLabel,
  currencyFormatter,
  defaultLowConfidenceThreshold = 0.6,
  enableSourceLinks = true,
  defaultQuery = "",
  defaultLowConfidenceOnly = false,
  defaultClassification = "ALL",
  defaultSelectedItemId = null,
  rowTone,
  onPlanChange,
  className,
}: {
  items: SnapshotLineItem[];
  directionLabel: string;
  currencyFormatter: (n: number) => string;
  defaultLowConfidenceThreshold?: number;
  enableSourceLinks?: boolean;
  defaultQuery?: string;
  defaultLowConfidenceOnly?: boolean;
  defaultClassification?: SnapshotLineItem["classification"] | "ALL";
  defaultSelectedItemId?: string | null;
  rowTone?: (item: SnapshotLineItem) => "default" | "muted" | "warning" | "danger" | "success";
  onPlanChange?: (itemId: string, next: { status: "open" | "deferred" | "resolved" }) => void;
  className?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [lowConfidenceOnly, setLowConfidenceOnly] = useState(defaultLowConfidenceOnly);
  const [classification, setClassification] = useState<SnapshotLineItem["classification"] | "ALL">(defaultClassification);
  const [sortKey, setSortKey] = useState<SortKey>("expectedDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<SnapshotLineItem | null>(null);

  // If deep-linked, open the sheet for the requested item once it is available.
  // Adjusting state during render (guarded) avoids an extra effect pass.
  const [appliedDeepLinkId, setAppliedDeepLinkId] = useState<string | null>(null);
  if (defaultSelectedItemId && defaultSelectedItemId !== appliedDeepLinkId) {
    const found = items.find((i) => i.id === defaultSelectedItemId);
    if (found) {
      setAppliedDeepLinkId(defaultSelectedItemId);
      setSelected(found);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (classification !== "ALL" && i.classification !== classification) return false;
      if (lowConfidenceOnly) {
        const conf = i.confidence ?? 1;
        if (!(Number.isFinite(conf) && conf < defaultLowConfidenceThreshold)) return false;
      }
      if (!q) return true;
      const hay = `${i.title ?? ""} ${i.sourceType ?? ""} ${i.explanation ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, lowConfidenceOnly, classification, defaultLowConfidenceThreshold]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "amount") return (Number(a.amount ?? 0) - Number(b.amount ?? 0)) * dir;
      if (sortKey === "confidence") return (Number(a.confidence ?? 0) - Number(b.confidence ?? 0)) * dir;
      return (new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime()) * dir;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const byClass = new Map<string, number>();
    for (const i of items) {
      byClass.set(i.classification, (byClass.get(i.classification) ?? 0) + Number(i.amount ?? 0));
    }
    return { total: sumLineItems(items), byClass };
  }, [items]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  const activeFiltersCount =
    (query.trim() ? 1 : 0) + (lowConfidenceOnly ? 1 : 0) + (classification !== "ALL" ? 1 : 0);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{directionLabel}</Badge>
          <Badge variant="outline" className="text-zinc-500">
            {sorted.length} items
          </Badge>
          <Badge variant="outline" className="border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200">
            Total {currencyFormatter(totals.total)}
          </Badge>
          <CashFlowHelp label="Classification">
            How we interpret cash timing. Actual is observed cash movement. Committed is contractual or approved. Expected is planned.
            Predicted is probabilistic. Manual is user-entered.
          </CashFlowHelp>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, source, explanation…"
              className="h-9 w-[260px] pl-9"
            />
          </div>
          <Button
            type="button"
            variant={lowConfidenceOnly ? "secondary" : "outline"}
            size="sm"
            className="h-9 gap-2"
            onClick={() => setLowConfidenceOnly((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            Risk
          </Button>
          {activeFiltersCount ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-2 text-zinc-500"
              onClick={() => {
                setQuery("");
                setLowConfidenceOnly(false);
                setClassification("ALL");
              }}
            >
              <X className="h-4 w-4" />
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "ACTUAL", "COMMITTED", "EXPECTED", "PREDICTED", "MANUAL"] as const).map((c) => (
          <Button
            key={c}
            type="button"
            variant={classification === c ? "secondary" : "outline"}
            size="sm"
            className="h-8"
            onClick={() => setClassification(c)}
          >
            {c === "ALL" ? "All" : labelForClassification(c)}
            {c !== "ALL" ? (
              <span className="ml-2 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {currencyFormatter(totals.byClass.get(c) ?? 0)}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <Table className="[&_th]:px-4 [&_td]:px-4">
          <TableHeader>
            <TableRow className="bg-zinc-50/60 dark:bg-zinc-900/60">
              <TableHead className="w-[36%]">Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="select-none">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                  onClick={() => toggleSort("expectedDate")}
                >
                  Expected
                  <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400" />
                </button>
              </TableHead>
              <TableHead className="select-none text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                  onClick={() => toggleSort("amount")}
                >
                  Amount
                  <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400" />
                </button>
              </TableHead>
              <TableHead className="select-none text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                  onClick={() => toggleSort("confidence")}
                >
                  Confidence
                  <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400" />
                </button>
              </TableHead>
              <TableHead>Class</TableHead>
              <TableHead className="w-[1%] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-zinc-500">
                  No items match these filters.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((i) => {
                const amount = Number(i.amount ?? 0);
                const tone = toneForVariance(amount >= 0 ? 1 : -1);
                const href = enableSourceLinks ? sourceRecordHref(i) : null;
                const planTone = rowTone?.(i) ?? "default";
                const rowClass =
                  planTone === "muted"
                    ? "opacity-60"
                    : planTone === "warning"
                      ? "bg-amber-50/40 dark:bg-amber-950/10"
                      : planTone === "danger"
                        ? "bg-rose-50/40 dark:bg-rose-950/10"
                        : planTone === "success"
                          ? "bg-emerald-50/40 dark:bg-emerald-950/10"
                          : "";
                return (
                  <TableRow
                    key={i.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 focus-within:bg-zinc-50/60 dark:focus-within:bg-zinc-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      rowClass,
                    )}
                    onClick={() => setSelected(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(i);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open details for ${i.title}`}
                    data-state={selected?.id === i.id ? "selected" : undefined}
                  >
                    <TableCell className="py-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{i.title}</div>
                        {i.explanation ? (
                          <div className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {i.explanation}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                      <div className="font-medium">{i.sourceType}</div>
                      {i.sourceId ? <div className="text-[11px] opacity-80">#{i.sourceId}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {safeDateLabel(i.expectedDate)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      <span
                        className={cn(
                          tone === "positive"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : tone === "danger"
                              ? "text-rose-700 dark:text-rose-400"
                              : "text-zinc-900 dark:text-zinc-100",
                        )}
                      >
                        {currencyFormatter(amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={confidenceTone(i.confidence)} className="tabular-nums">
                        {confidenceLabel(i.confidence)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{labelForClassification(i.classification)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {onPlanChange ? (
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-zinc-500"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onPlanChange(i.id, { status: "deferred" });
                            }}
                          >
                            Defer
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-zinc-500"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onPlanChange(i.id, { status: "resolved" });
                            }}
                          >
                            Resolve
                          </Button>
                        </div>
                      ) : null}
                      {href ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-400 hover:text-indigo-600"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(href, "_self");
                          }}
                          aria-label="Open source record"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(v) => (v ? null : setSelected(null))}>
        <SheetContent className="sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{selected.title}</SheetTitle>
                <SheetDescription>
                  {directionLabel} · {labelForClassification(selected.classification)} · Expected {safeDateLabel(selected.expectedDate)}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 p-3">
                    <div className={dt(cashFlowTypography.labelUpperStrong)}>Amount</div>
                    <div className={dt("mt-1", cashFlowTypography.value2xlLight)}>{currencyFormatter(Number(selected.amount ?? 0))}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 p-3">
                    <div className={dt(cashFlowTypography.labelUpperStrong)}>Confidence</div>
                    <div className={dt("mt-1", cashFlowTypography.value2xlLight)}>{confidenceLabel(selected.confidence)}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Source</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{selected.sourceType}</div>
                  {selected.sourceId ? (
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Record id: {selected.sourceId}</div>
                  ) : null}
                  {enableSourceLinks && sourceRecordHref(selected) ? (
                    <div className="mt-2">
                      <Button variant="outline" size="sm" className="h-8 gap-2" asChild>
                        <a href={sourceRecordHref(selected) ?? "#"}>
                          Open source <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Explanation</div>
                  <div className="mt-1 text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
                    {selected.explanation ?? "No explanation provided for this line item."}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

