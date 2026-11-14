"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, BookmarkPlus, Download, ExternalLink, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { ReportChart } from "../_components/ReportChart";
import { SaveViewDialog } from "../_components/SaveViewDialog";
import { api, ApiError, PERIODS, type Cell, type Col, type PeriodKey, type ReportMeta, type ReportResult, type Row, type ViewRow } from "../_components/shared";

export default function ReportViewer({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = use(params);
  const t = useTranslations("ReportingCenter");
  const { fCurrency, currency, locale } = useFormat();
  const router = useRouter();
  const sp = useSearchParams();
  const period = (PERIODS as string[]).includes(sp.get("period") ?? "") ? (sp.get("period") as PeriodKey) : "this_fy";
  const from = sp.get("from"), to = sp.get("to"), compare = sp.get("compare") === "1", viewId = sp.get("view");

  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const label = useCallback((k: string) => (t.has(`label.${k}`) ? t(`label.${k}`) : k), [t]);
  const cellText = useCallback((k: string, v: unknown) => (typeof v === "string" && (k === "status" || k === "paymentStatus") && t.has(`value.${v}`) ? t(`value.${v}`) : v == null ? "" : String(v)), [t]);
  const compact = useMemo(() => (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v), [locale, currency]);
  const money = useCallback((v: number) => fCurrency(v), [fCurrency]);
  const fmt = useCallback((c: Col, v: Cell) => {
    if (v == null || v === "") return "—";
    if (typeof v === "number") return c.format === "currency" ? money(v) : c.format === "percent" ? `${v}%` : v.toLocaleString(locale);
    return c.format === "date" ? new Date(v).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : cellText(c.key, v);
  }, [money, locale, cellText]);

  useEffect(() => {
    let off = false;
    Promise.all([api<{ reports: ReportMeta[] }>("/api/reporting/catalog"), api<{ views: ViewRow[] }>("/api/reporting/views")]).then(([c, v]) => { if (!off) { setMeta(c.reports.find((r) => r.id === reportId) ?? null); setViews(v.views); } }).catch(() => undefined);
    return () => { off = true; };
  }, [reportId]);

  useEffect(() => {
    let off = false;
    api<ReportResult>("/api/reporting/run", { method: "POST", body: JSON.stringify({ reportId, period, from, to, compare }) })
      .then((r) => { if (!off) { setResult(r); setError(null); } })
      .catch((e) => { if (!off) setError({ message: e instanceof Error ? e.message : "", code: e instanceof ApiError ? e.code : "" }); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [reportId, period, from, to, compare, tick]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    setLoading(true);
    router.replace(`/reporting/${reportId}?${next.toString()}`, { scroll: false });
  };

  const rows = useMemo(() => {
    if (!result) return [] as Row[];
    const s = q.trim().toLowerCase();
    let list = s ? result.rows.filter((r) => result.columns.some((c) => typeof r[c.key] === "string" && cellText(c.key, r[c.key]).toLowerCase().includes(s))) : result.rows;
    if (sort) list = [...list].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? "")); return sort.dir === "asc" ? d : -d; });
    return list;
  }, [result, q, sort, cellText]);

  const view = views.find((v) => v.id === viewId) ?? null;
  const title = meta ? t(`reports.${meta.id}.title`) : reportId;
  const delta = (k: { key: string; value: number; upGood?: boolean }) => {
    const prev = result?.previous?.find((p) => p.key === k.key);
    if (!prev) return null;
    const diff = k.value - prev.value; const pct = prev.value !== 0 ? (diff / Math.abs(prev.value)) * 100 : null;
    const good = k.upGood == null || diff === 0 ? null : (diff > 0) === k.upGood;
    return { pct, diff, good };
  };

  const download = async (format: "xlsx" | "csv") => {
    setExporting(true);
    try {
      const labels = Object.fromEntries([...(result?.columns ?? []).map((c) => [c.key, label(c.key)]), ["total", t("total")]]);
      const res = await fetch("/api/reporting/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, format, period, from, to, labels }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t("exportFailed"));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = `${reportId}-${new Date().toISOString().slice(0, 10)}.${format}`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("exportFailed")); } finally { setExporting(false); }
  };

  const removeView = async () => {
    if (!view) return;
    try { await api(`/api/reporting/views/${view.id}`, { method: "DELETE" }); toast.success(t("deleted")); router.replace(`/reporting/${reportId}`); setViews((v) => v.filter((x) => x.id !== view.id)); } catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); }
  };

  return (
    <DashboardPageShell
      title={title} description={meta ? t(`reports.${meta.id}.desc`) : undefined}
      breadcrumb={<Link href="/reporting" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t("allReports")}</Link>}
      pageActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); setTick((n) => n + 1); }} disabled={loading}>{loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}{t("refresh")}</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={exporting || !result}><Download className="mr-1.5 h-4 w-4" />{t("export")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void download("xlsx")}>Excel (.xlsx)</DropdownMenuItem><DropdownMenuItem onClick={() => void download("csv")}>CSV</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <Button size="sm" onClick={() => setSaveOpen(true)} disabled={!result}><BookmarkPlus className="mr-1.5 h-4 w-4" />{view ? t("updateView") : t("saveView")}</Button>
          {view ? <Button size="icon" variant="ghost" onClick={() => void removeView()} aria-label={t("deleteView")}><Trash2 className="h-4 w-4" /></Button> : null}
        </div>
      }
    >
      <div className="space-y-5">
        {meta?.period === "range" ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5" role="group" aria-label={t("period")}>
              {PERIODS.map((p) => <button key={p} type="button" aria-pressed={p === period} onClick={() => setParam({ period: p })} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", p === period ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}>{t(`period_${p}`)}</button>)}
            </div>
            {period === "custom" ? <div className="flex items-center gap-2"><Input type="date" value={from ?? ""} onChange={(e) => setParam({ from: e.target.value })} aria-label={t("from")} className="w-40" /><span className="text-muted-foreground">→</span><Input type="date" value={to ?? ""} onChange={(e) => setParam({ to: e.target.value })} aria-label={t("to")} className="w-40" /></div> : null}
            {meta.comparable ? <label className="flex items-center gap-2 text-sm"><Switch checked={compare} onCheckedChange={(v) => setParam({ compare: v ? "1" : null })} />{t("compare")}</label> : null}
          </div>
        ) : meta ? <p className="text-sm text-muted-foreground">{t("asOfToday")} · {result ? new Date(result.generatedAt).toLocaleString(locale) : ""}</p> : null}

        {error && !result ? <div className="rounded-2xl border border-rose-500/30 p-8 text-center"><p className="font-medium">{error.code === "REPORT_NOT_FOUND" ? t("notFound") : t("loadFailed")}</p><Button className="mt-3" variant="outline" onClick={() => { setLoading(true); setTick((n) => n + 1); }}>{t("retry")}</Button></div>
        : !result ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div>
        : (
          <div className={cn("space-y-5", loading && "opacity-70 transition-opacity")}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {result.kpis.map((k) => { const d = delta(k); return (
                <div key={k.key} className="rounded-2xl border bg-card p-4 shadow-xs">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label(k.key)}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{k.format === "currency" ? money(k.value) : k.format === "percent" ? `${k.value}%` : k.value.toLocaleString(locale)}</p>
                  {d ? <p className={cn("mt-0.5 flex items-center gap-1 text-xs tabular-nums", d.good == null ? "text-muted-foreground" : d.good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{d.diff >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{d.pct == null ? t("newVsPrev") : `${Math.abs(Math.round(d.pct))}%`} {t("vsPrevious")}</p> : null}
                </div>); })}
            </div>

            {result.chart && result.rows.length ? <section className="rounded-3xl border bg-card p-4 sm:p-5"><ReportChart spec={result.chart} rows={result.rows} compact={compact} label={(v) => cellText(result.chart!.labelKey, v)} seriesLabel={label} other={t("other")} /></section> : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{t("rowCount", { count: rows.length })}</p>
                <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchRows")} className="h-9 pl-9" aria-label={t("searchRows")} /></div>
              </div>
              {rows.length === 0 ? <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">{t("emptyRows")}</div> : (
                <div className="overflow-x-auto rounded-2xl border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40"><tr>
                      {result.columns.map((c) => <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground", c.format === "text" || c.format === "date" ? "text-left" : "text-right")}><button type="button" onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === "asc" ? { key: c.key, dir: "desc" } : null) : { key: c.key, dir: "asc" }))} className="inline-flex items-center gap-1 hover:text-foreground">{label(c.key)}{sort?.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}</button></th>)}
                      <th className="w-8" />
                    </tr></thead>
                    <tbody className="divide-y">
                      {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          {result.columns.map((c) => <td key={c.key} className={cn("px-4 py-2.5", c.format === "text" || c.format === "date" ? "text-left" : "text-right tabular-nums")}>{fmt(c, r[c.key] ?? null)}</td>)}
                          <td className="px-2">{typeof r._href === "string" ? <Link href={r._href} aria-label={t("open")} className="text-muted-foreground hover:text-foreground"><ArrowUpRight className="h-4 w-4" /></Link> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                    {result.totals ? <tfoot className="border-t-2 bg-muted/40 font-semibold"><tr>{result.columns.map((c, i) => <td key={c.key} className={cn("px-4 py-2.5", c.format === "text" || c.format === "date" ? "text-left" : "text-right tabular-nums")}>{i === 0 ? t("total") : fmt(c, result.totals![c.key] ?? null)}</td>)}<td /></tr></tfoot> : null}
                  </table>
                </div>
              )}
              {result.truncated ? <p className="text-xs text-amber-600 dark:text-amber-400">{t("truncated")}</p> : null}
              {result.notes.length ? <ul className="space-y-1 text-xs text-muted-foreground">{result.notes.map((n) => <li key={n} className="flex gap-1.5"><ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-0" />{t(`note.${n}`)}</li>)}</ul> : null}
            </section>
          </div>
        )}
      </div>
      {saveOpen && result ? <SaveViewDialog key={view?.id ?? "new"} open={saveOpen} onOpenChange={setSaveOpen} reportId={reportId} params={{ period, from, to, compare }} existing={view} defaultName={title} onSaved={(v) => { setViews((cur) => [v, ...cur.filter((x) => x.id !== v.id)]); router.replace(`/reporting/${reportId}?${sp.toString().replace(/&?view=[^&]*/, "")}&view=${v.id}`); }} /> : null}
    </DashboardPageShell>
  );
}
