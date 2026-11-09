"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, Loader2, Paperclip, Pencil, Plus, Receipt, Search, Tag, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { RecordDocumentsDialog } from "@/components/documents/RecordDocumentsDialog";
import { useFormat } from "@/hooks/use-format";
import { PRESET_CATEGORIES } from "@/lib/expenses/categories";
import { cn } from "@/lib/utils";
import { ExpenseSheet } from "./_components/ExpenseSheet";
import { api, monthLabel, money, PERIODS, shortDate, type ExpenseRow, type Period, type Summary } from "./_components/shared";

type ListResponse = { data: ExpenseRow[]; meta: { currentPage: number; totalPages: number; totalRecords: number }; filteredTotal: number };
type Sort = "date" | "amount" | "vendor";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "good" && "text-emerald-600 dark:text-emerald-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "bad" && "text-rose-600 dark:text-rose-400")}>{value}</p>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export default function ExpensesPage() {
  const t = useTranslations("ExpensesLedger");
  const tc = useTranslations("Expenses");
  const { locale, countryCode } = useFormat();
  const isIndia = countryCode === "IN";
  const [period, setPeriod] = useState<Period>("this_fy");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [meta, setMeta] = useState({ currentPage: 1, totalPages: 1, totalRecords: 0 });
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [receipt, setReceipt] = useState("");
  const [sort, setSort] = useState<Sort>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [metaData, setMetaData] = useState<{ categories: string[]; vendors: string[] }>({ categories: [], vendors: [] });
  const [supplierState, setSupplierState] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => { const h = setTimeout(() => { setDebounced(q); setPage(1); }, 250); return () => clearTimeout(h); }, [q]);

  const filterParams = useMemo(() => {
    const p = new URLSearchParams({ period });
    if (debounced) p.set("q", debounced);
    if (category) p.set("category", category);
    if (status) p.set("status", status);
    if (receipt) p.set("receipt", receipt);
    return p;
  }, [period, debounced, category, status, receipt]);

  const loadSummary = useCallback(async () => {
    const r = await api<{ data: Summary }>(`/api/expenses/summary?period=${period}`);
    if (!r.ok) { setSummaryError(true); return; }
    setSummaryError(false); setSummary(r.data.data);
  }, [period]);

  const loadList = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const p = new URLSearchParams(filterParams);
    p.set("sort", sort); p.set("dir", dir); p.set("page", String(page)); p.set("limit", "20");
    const r = await api<ListResponse>(`/api/expenses?${p}`);
    if (id !== reqId.current) return;
    if (!r.ok) { setError(r.data.error ?? tRef.current("loadFailed")); setLoading(false); return; }
    setError(null); setRows(r.data.data); setMeta(r.data.meta); setFilteredTotal(r.data.filteredTotal); setLoading(false);
  }, [filterParams, sort, dir, page]);

  const loadMeta = useCallback(async () => { const r = await api<{ data: { categories: string[]; vendors: string[] } }>("/api/expenses/meta"); if (r.ok) setMetaData(r.data.data); }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { setSelected(new Set()); }, [filterParams, sort, dir, page]);
  useEffect(() => {
    if (!isIndia) return;
    api<{ stateCode?: string | null }>("/api/gst/settings").then((r) => { if (r.ok) setSupplierState(r.data.stateCode ?? null); });
  }, [isIndia]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "n") { e.preventDefault(); setEditing(null); setSheetOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refresh = () => { void loadList(); void loadSummary(); void loadMeta(); };
  const currency = summary?.currency ?? "INR";
  const m = (n: number) => money(n, currency, locale);
  const catLabel = (value: string) => { const p = PRESET_CATEGORIES.find((c) => c.value === value); return p ? tc(`cat_${p.key}` as never) : value; };
  const allCats = useMemo(() => [...PRESET_CATEGORIES.map((c) => c.value as string), ...metaData.categories], [metaData.categories]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const filtersOn = Boolean(debounced || category || status || receipt);

  async function bulk(action: "MARK_PAID" | "SET_CATEGORY" | "DELETE", ids: string[], value?: string) {
    setBusy(true);
    const r = await api("/api/expenses/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action, value }) });
    setBusy(false); setConfirmDelete(null);
    if (!r.ok) { toast.error(r.data.error ?? t("toast.failed")); return; }
    toast.success(action === "DELETE" ? t("toast.deleted", { count: ids.length }) : t("toast.updated2", { count: ids.length }));
    setSelected(new Set()); refresh();
  }

  const sortBy = (s: Sort) => { if (sort === s) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setSort(s); setDir(s === "vendor" ? "asc" : "desc"); } setPage(1); };
  const SortIcon = ({ s }: { s: Sort }) => (sort === s ? (dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null);

  const delta = summary && summary.prevTotal !== null && summary.prevTotal > 0 ? ((summary.total - summary.prevTotal) / summary.prevTotal) * 100 : null;
  const maxMonth = Math.max(1, ...(summary?.monthly.map((x) => x.amount) ?? [1]));
  const exportHref = `/api/expenses/export?${filterParams}`;
  const overdueBills = summary?.unpaid.items.filter((i) => i.ageDays > 45).length ?? 0;

  return (
    <DashboardPageShell
      title={tc("title")}
      description={t("subtitle")}
      icon={<Receipt className="size-6 text-accent-strong" aria-hidden />}
      animated={false}
      primaryAction={<Button onClick={() => { setEditing(null); setSheetOpen(true); }}><Plus className="mr-2 size-4" aria-hidden />{t("add")}<kbd className="ml-2 hidden rounded border bg-background/20 px-1 text-[10px] md:inline">N</kbd></Button>}
      secondaryActions={<Button variant="outline" asChild><a href={exportHref}><Download className="mr-2 size-4" aria-hidden />{t("export")}</a></Button>}
    >
      <div role="tablist" aria-label={t("period.label")} className="flex gap-1.5 overflow-x-auto pb-1">
        {PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={period === p} onClick={() => { setPeriod(p); setPage(1); }}
            className={cn("whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors", period === p ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}>{t(`period.${p}` as never)}</button>
        ))}
      </div>

      {summaryError && <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm"><span>{t("summaryFailed")}</span><Button size="sm" variant="outline" onClick={() => void loadSummary()}>{t("retry")}</Button></div>}

      <section aria-label={t("summary")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary ? (
          <>
            <Stat label={t("stats.spend")} value={m(summary.total)} sub={delta === null ? t("stats.entries", { count: summary.count }) : <span className={delta > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>{delta > 0 ? "▲" : "▼"} {t("stats.vsPrev", { pct: Math.abs(Math.round(delta)) })}</span>} />
            <Stat label={t("stats.netOfCredit")} value={m(summary.netOfCredit)} sub={isIndia ? t("stats.creditClaimable", { amount: m(summary.itcClaimable) }) : t("stats.entries", { count: summary.count })} />
            <Stat label={t("stats.margin")} value={summary.margin === null ? "—" : `${summary.margin}%`} tone={summary.margin === null ? undefined : summary.margin < 0 ? "bad" : summary.margin < 20 ? "warn" : "good"} sub={t("stats.revenue", { amount: m(summary.revenue) })} />
            <Stat label={t("stats.unpaid")} value={m(summary.unpaid.amount)} tone={overdueBills > 0 ? "bad" : summary.unpaid.count > 0 ? "warn" : "good"} sub={t("stats.unpaidCount", { count: summary.unpaid.count })} />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}
      </section>

      {summary && summary.count > 0 && (
        <section className="grid gap-4 lg:grid-cols-3" aria-label={t("insights")}>
          <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold">{t("byCategory")}</h2>
            <ul className="space-y-2.5">
              {summary.byCategory.slice(0, 6).map((c) => (
                <li key={c.category}>
                  <button type="button" className="group block w-full text-start" onClick={() => { setCategory(c.category); setPage(1); }} aria-label={t("filterBy", { name: catLabel(c.category) })}>
                    <div className="mb-1 flex items-center justify-between text-sm"><span className="truncate font-medium group-hover:underline">{catLabel(c.category)}</span><span className="tabular-nums text-muted-foreground">{m(c.amount)} · {Math.round(c.share)}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.max(2, c.share)}%` }} /></div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">{t("last6")}</h2>
            <div className="flex h-24 items-end gap-2" role="img" aria-label={t("last6")}>
              {summary.monthly.map((x) => (<div key={x.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><div className="w-full rounded-t bg-indigo-500/80" style={{ height: `${Math.max(4, (x.amount / maxMonth) * 80)}%` }} title={m(x.amount)} /><span className="text-[10px] text-muted-foreground">{monthLabel(x.month, locale)}</span></div>))}
            </div>
            {summary.topVendors.length > 0 && (<><h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("topVendors")}</h3><ul className="space-y-1 text-sm">{summary.topVendors.slice(0, 3).map((v) => <li key={v.vendor} className="flex justify-between gap-2"><span className="truncate">{v.vendor}</span><span className="tabular-nums text-muted-foreground">{m(v.amount)}</span></li>)}</ul></>)}
          </div>
        </section>
      )}

      {summary && (summary.unpaid.count > 0 || summary.missingReceipts > 0 || summary.withholdingPending.count > 0) && (
        <section aria-label={t("attention")} className="grid gap-3 md:grid-cols-3">
          {summary.unpaid.count > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 md:col-span-2">
              <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="size-4 text-amber-600" aria-hidden />{t("billsDue")}</h2><button type="button" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => { setStatus("unpaid"); setPeriod("all"); setPage(1); }}>{t("seeAll")}</button></div>
              <ul className="divide-y">
                {summary.unpaid.items.slice(0, 4).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0"><span className="font-medium">{b.vendor}</span><span className="block truncate text-xs text-muted-foreground">{b.invoiceNo ? `${b.invoiceNo} · ` : ""}{t("ageDays", { count: b.ageDays })}{b.msme === "MICRO" || b.msme === "SMALL" ? ` · ${t("msme")}` : ""}</span></span>
                    <span className="flex items-center gap-2"><span className={cn("tabular-nums", b.ageDays > 45 && "font-semibold text-rose-600 dark:text-rose-400")}>{m(b.amount)}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => void bulk("MARK_PAID", [b.id])}><CheckCircle2 className="mr-1 size-4" aria-hidden />{t("markPaid")}</Button></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-3">
            {summary.missingReceipts > 0 && <button type="button" onClick={() => { setReceipt("without"); setPage(1); }} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-start hover:bg-muted/50"><Paperclip className="size-5 text-muted-foreground" aria-hidden /><span className="text-sm"><span className="font-semibold tabular-nums">{summary.missingReceipts}</span> {t("missingReceipts")}</span></button>}
            {summary.withholdingPending.count > 0 && <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm"><FileText className="size-5 text-muted-foreground" aria-hidden /><span>{t("tdsPending", { amount: m(summary.withholdingPending.amount) })}</span></div>}
          </div>
        </section>
      )}

      <section aria-label={t("ledger")} className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("search")} className="h-11 ps-9 pe-9" />
            {q && <button type="button" aria-label={t("clearSearch")} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setQ("")}><X className="size-4" aria-hidden /></button>}
          </div>
          <label className="sr-only" htmlFor="f-cat">{tc("category")}</label>
          <select id="f-cat" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("allCategories")}</option>{allCats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
          <label className="sr-only" htmlFor="f-status">{t("payment")}</label>
          <select id="f-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("anyPayment")}</option><option value="paid">{t("paid")}</option><option value="unpaid">{t("unpaid")}</option></select>
          <label className="sr-only" htmlFor="f-receipt">{t("receipt")}</label>
          <select id="f-receipt" value={receipt} onChange={(e) => { setReceipt(e.target.value); setPage(1); }} className="h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t("anyReceipt")}</option><option value="with">{t("withReceipt")}</option><option value="without">{t("withoutReceipt")}</option></select>
          {filtersOn && <Button variant="ghost" onClick={() => { setQ(""); setCategory(""); setStatus(""); setReceipt(""); setPage(1); }}>{t("clearFilters")}</Button>}
        </div>

        {selected.size > 0 && (
          <div role="region" aria-label={t("bulk.bar")} className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 p-2.5 shadow-lg backdrop-blur">
            <span className="px-2 text-sm font-medium">{t("bulk.selected", { count: selected.size })}</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulk("MARK_PAID", [...selected])}><CheckCircle2 className="mr-1.5 size-4" aria-hidden />{t("markPaid")}</Button>
            <label className="sr-only" htmlFor="bulk-cat">{t("bulk.setCategory")}</label>
            <select id="bulk-cat" className="h-8 rounded-md border border-input bg-background px-2 text-sm" value="" disabled={busy} onChange={(e) => { if (e.target.value) void bulk("SET_CATEGORY", [...selected], e.target.value); }}><option value="">{t("bulk.setCategory")}</option>{allCats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
            <Button size="sm" variant="outline" className="text-rose-600" disabled={busy} onClick={() => setConfirmDelete([...selected])}><Trash2 className="mr-1.5 size-4" aria-hidden />{tc("actions.delete")}</Button>
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSelected(new Set())}>{t("bulk.clear")}</Button>
          </div>
        )}

        {error ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void loadList()}>{t("retry")}</Button></div>
        ) : !loading && meta.totalRecords === 0 && !filtersOn && period === "all" ? (
          <div className="grid place-items-center rounded-3xl border border-dashed p-12 text-center">
            <div className="max-w-sm space-y-3"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600"><Receipt className="size-7" aria-hidden /></div><h2 className="text-lg font-semibold">{t("empty.title")}</h2><p className="text-sm text-muted-foreground">{t("empty.body")}</p><Button onClick={() => { setEditing(null); setSheetOpen(true); }}><Plus className="mr-2 size-4" aria-hidden />{t("add")}</Button></div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="hidden grid-cols-[32px_110px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_120px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
              <Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} aria-label={t("selectAll")} />
              <button type="button" className="flex items-center gap-1 text-start uppercase" onClick={() => sortBy("date")}>{tc("col_date")}<SortIcon s="date" /></button>
              <button type="button" className="flex items-center gap-1 text-start uppercase" onClick={() => sortBy("vendor")}>{tc("col_vendor")}<SortIcon s="vendor" /></button>
              <span>{tc("col_category")}</span>
              <button type="button" className="flex items-center justify-end gap-1 uppercase" onClick={() => sortBy("amount")}>{t("col.amount")}<SortIcon s="amount" /></button>
              <span className="text-end">{tc("col_actions")}</span>
            </div>
            <ul>
              {loading && rows.length === 0 ? Array.from({ length: 6 }).map((_, i) => <li key={i} className="border-b p-4 last:border-0"><Skeleton className="h-10 w-full" /></li>) : rows.map((e) => (
                <li key={e.id} className={cn("relative grid items-center gap-x-3 gap-y-1.5 border-b px-4 py-3 last:border-0 hover:bg-muted/40 lg:grid-cols-[32px_110px_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_120px]", selected.has(e.id) && "bg-indigo-500/5")}>
                  <Checkbox className="absolute end-3 top-3 lg:static" checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} aria-label={t("select", { name: e.vendor })} />
                  <span className="text-sm text-muted-foreground">{shortDate(e.date, locale)}</span>
                  <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="truncate font-medium">{e.vendor}</span>{e.paymentStatus === "UNPAID" && <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">{t("unpaid")}</Badge>}{e.itcStatus === "ELIGIBLE" && <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-300">{t("credit")}</Badge>}</span>{(e.description || e.vendorInvoiceNo) && <span className="block truncate text-xs text-muted-foreground">{[e.vendorInvoiceNo, e.description].filter(Boolean).join(" · ")}</span>}</span>
                  <span><Badge variant="secondary" className="max-w-full truncate font-normal">{catLabel(e.category)}</Badge></span>
                  <span className="font-medium tabular-nums lg:text-end">{m(e.amount)}{e.gstAmount > 0 && <span className="block text-xs font-normal text-muted-foreground">{t("incGst", { amount: m(e.gstAmount) })}</span>}</span>
                  <span className="flex justify-end gap-0.5">
                    {e.receiptUrl && <Button variant="ghost" size="icon" className="size-8" asChild><a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" aria-label={`${tc("actions.view_receipt")}: ${e.vendor}`}><FileText className="size-4" aria-hidden /></a></Button>}
                    <RecordDocumentsDialog targetType="EXPENSE" targetId={e.id} />
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`${tc("actions.edit")}: ${e.vendor}`} onClick={() => { setEditing(e); setSheetOpen(true); }}><Pencil className="size-4" aria-hidden /></Button>
                    <Button variant="ghost" size="icon" className="size-8 text-rose-600" aria-label={`${tc("actions.delete")}: ${e.vendor}`} onClick={() => setConfirmDelete([e.id])}><Trash2 className="size-4" aria-hidden /></Button>
                  </span>
                </li>
              ))}
            </ul>
            {rows.length === 0 && !loading && <p className="p-10 text-center text-sm text-muted-foreground">{t("noResults")}</p>}
            {rows.length > 0 && <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-sm"><span className="text-muted-foreground">{t("shown", { count: meta.totalRecords })}</span><span className="font-semibold tabular-nums">{t("filteredTotal", { amount: m(filteredTotal) })}</span></div>}
          </div>
        )}

        {meta.totalPages > 1 && (
          <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{tc("page_of", { current: meta.currentPage, total: meta.totalPages })}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" aria-label={tc("previous")} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></Button>
              <Button variant="outline" size="icon" aria-label={tc("next")} disabled={page >= meta.totalPages || loading} onClick={() => setPage((p) => p + 1)}>{loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />}</Button>
            </div>
          </nav>
        )}
      </section>

      <ExpenseSheet open={sheetOpen} onOpenChange={setSheetOpen} expense={editing} isIndia={isIndia} supplierState={supplierState} currency={currency} locale={locale} extraCategories={metaData.categories} vendors={metaData.vendors} onSaved={refresh} />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("confirm.title", { count: confirmDelete?.length ?? 0 })}</AlertDialogTitle><AlertDialogDescription>{t("confirm.body")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{tc("cancel")}</AlertDialogCancel><AlertDialogAction disabled={busy} className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => confirmDelete && void bulk("DELETE", confirmDelete)}>{tc("confirm_delete")}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardPageShell>
  );
}
