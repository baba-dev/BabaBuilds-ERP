"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, BookmarkPlus, Download, Loader2, RefreshCw, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { BuilderPanel, DEFAULT_SPEC } from "../_components/BuilderPanel";
import { ReportBodyView } from "../_components/ReportBodyView";
import { SaveViewDialog } from "../_components/SaveViewDialog";
import { ShareDialog } from "../_components/ShareDialog";
import { api, ApiError, PERIODS, type CompareMode, type PeriodKey, type ReportMeta, type ReportResult, type Spec, type ViewRow } from "../_components/shared";

const parseSpec = (raw: string | null): Spec | null => { try { const v = raw ? JSON.parse(raw) : null; return v && typeof v === "object" ? (v as Spec) : null; } catch { return null; } };

export default function ReportViewer({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = use(params);
  const t = useTranslations("ReportingCenter");
  const { fCurrency, currency, locale } = useFormat();
  const router = useRouter();
  const sp = useSearchParams();
  const period = (PERIODS as string[]).includes(sp.get("period") ?? "") ? (sp.get("period") as PeriodKey) : "this_fy";
  const from = sp.get("from"), to = sp.get("to"), viewId = sp.get("view");
  const compare: CompareMode = sp.get("compare") === "yoy" ? "yoy" : sp.get("compare") ? "previous" : "off";
  const isCustom = reportId === "custom";
  const spec = isCustom ? (parseSpec(sp.get("spec")) ?? DEFAULT_SPEC) : null;
  const specKey = spec ? JSON.stringify(spec) : "";

  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [views, setViews] = useState<ViewRow[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const compact = useMemo(() => (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v), [locale, currency]);
  const label = (k: string) => (t.has(`label.${k}`) ? t(`label.${k}`) : k);

  useEffect(() => {
    let off = false;
    Promise.all([api<{ reports: ReportMeta[] }>("/api/reporting/catalog"), api<{ views: ViewRow[] }>("/api/reporting/views")]).then(([c, v]) => { if (!off) { setMeta(c.reports.find((r) => r.id === reportId) ?? null); setViews(v.views); } }).catch(() => undefined);
    return () => { off = true; };
  }, [reportId]);

  useEffect(() => {
    let off = false;
    api<ReportResult>("/api/reporting/run", { method: "POST", body: JSON.stringify({ reportId, period, from, to, compare: compare === "off" ? false : compare, ...(specKey ? { spec: JSON.parse(specKey) } : {}) }) })
      .then((r) => { if (!off) { setResult(r); setError(null); } })
      .catch((e) => { if (!off) { setResult(null); setError({ message: e instanceof Error ? e.message : "", code: e instanceof ApiError ? e.code : "" }); } })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [reportId, period, from, to, compare, specKey, tick]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    setLoading(true);
    router.replace(`/reporting/${reportId}?${next.toString()}`, { scroll: false });
  };

  const view = views.find((v) => v.id === viewId) ?? null;
  const title = isCustom ? t("reports.custom.title") : meta ? t(`reports.${meta.id}.title`) : reportId;
  const money = (v: number) => fCurrency(v);
  const paramsForSave = { period, from, to, compare: compare === "off" ? false : compare, ...(spec ? { spec } : {}) };

  const download = async (format: "xlsx" | "csv" | "pdf") => {
    setExporting(true);
    try {
      const labels = Object.fromEntries([...(result?.columns ?? []).map((c) => [c.key, label(c.key)]), ...(result?.kpis ?? []).map((k) => [k.key, label(k.key)]), ["total", t("total")]]);
      const res = await fetch("/api/reporting/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, format, period, from, to, compare: compare === "off" ? false : compare, labels, title, ...(spec ? { spec } : {}) }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t("exportFailed"));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = `${reportId}-${new Date().toISOString().slice(0, 10)}.${format}`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("exportFailed")); } finally { setExporting(false); }
  };

  const removeView = async () => {
    if (!view) return;
    try { await api(`/api/reporting/views/${view.id}`, { method: "DELETE" }); toast.success(t("deleted")); setViews((v) => v.filter((x) => x.id !== view.id)); router.replace(`/reporting/${reportId}`); } catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); }
  };

  const showPeriod = isCustom || meta?.period === "range";
  return (
    <DashboardPageShell
      title={view?.name ?? title} description={isCustom ? t("reports.custom.desc") : meta ? t(`reports.${meta.id}.desc`) : undefined}
      breadcrumb={<Link href="/reporting" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />{t("allReports")}</Link>}
      pageActions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); setTick((n) => n + 1); }} disabled={loading}>{loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}{t("refresh")}</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" disabled={exporting || !result}><Download className="mr-1.5 h-4 w-4" />{t("export")}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void download("xlsx")}>Excel (.xlsx)</DropdownMenuItem><DropdownMenuItem onClick={() => void download("pdf")}>PDF</DropdownMenuItem><DropdownMenuItem onClick={() => void download("csv")}>CSV</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} disabled={!result}><Share2 className="mr-1.5 h-4 w-4" />{t("share.button")}</Button>
          <Button size="sm" onClick={() => setSaveOpen(true)} disabled={!result}><BookmarkPlus className="mr-1.5 h-4 w-4" />{view ? t("updateView") : t("saveView")}</Button>
          {view ? <Button size="icon" variant="ghost" onClick={() => void removeView()} aria-label={t("deleteView")}><Trash2 className="h-4 w-4" /></Button> : null}
        </div>
      }
    >
      <div className="space-y-5">
        {isCustom && spec ? <BuilderPanel key={specKey} spec={spec} busy={loading} onRun={(s) => setParam({ spec: JSON.stringify(s) })} /> : null}

        {showPeriod ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="inline-flex max-w-full flex-wrap rounded-lg border bg-muted/40 p-0.5" role="group" aria-label={t("period")}>
              {PERIODS.map((p) => <button key={p} type="button" aria-pressed={p === period} onClick={() => setParam({ period: p })} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", p === period ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}>{t(`period_${p}`)}</button>)}
            </div>
            {period === "custom" ? <div className="flex items-center gap-2"><Input type="date" value={from ?? ""} onChange={(e) => setParam({ from: e.target.value })} aria-label={t("from")} className="w-40" /><span className="text-muted-foreground">→</span><Input type="date" value={to ?? ""} onChange={(e) => setParam({ to: e.target.value })} aria-label={t("to")} className="w-40" /></div> : null}
            {(isCustom || meta?.comparable) ? (
              <Select value={compare} onValueChange={(v) => setParam({ compare: v === "off" ? null : v === "yoy" ? "yoy" : "1" })}><SelectTrigger className="w-52" aria-label={t("compare")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="off">{t("compareOff")}</SelectItem><SelectItem value="previous">{t("comparePrevious")}</SelectItem><SelectItem value="yoy">{t("compareYoy")}</SelectItem></SelectContent></Select>
            ) : null}
          </div>
        ) : meta ? <p className="text-sm text-muted-foreground">{t("asOfToday")} · {result ? new Date(result.generatedAt).toLocaleString(locale) : ""}</p> : null}

        {error && !result ? <div className="rounded-2xl border border-rose-500/30 p-8 text-center"><p className="font-medium">{error.code === "REPORT_NOT_FOUND" ? t("notFound") : error.code === "FORBIDDEN" ? t("noAccess") : t("loadFailed")}</p><Button className="mt-3" variant="outline" onClick={() => { setLoading(true); setTick((n) => n + 1); }}>{t("retry")}</Button></div>
        : !result ? <div className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div>
        : <div className={cn(loading && "opacity-70 transition-opacity")}><ReportBodyView result={result} locale={locale} lineage={meta?.lineage} money={money} compact={compact} /></div>}
      </div>
      {saveOpen && result ? <SaveViewDialog key={view?.id ?? "new"} open={saveOpen} onOpenChange={setSaveOpen} reportId={reportId} params={paramsForSave} existing={view} defaultName={title} onSaved={(v) => { setViews((cur) => [v, ...cur.filter((x) => x.id !== v.id)]); const n = new URLSearchParams(sp.toString()); n.set("view", v.id); router.replace(`/reporting/${reportId}?${n.toString()}`); }} /> : null}
      {shareOpen ? <ShareDialog key="share" open={shareOpen} onOpenChange={setShareOpen} reportId={reportId} params={paramsForSave} defaultName={title} /> : null}
    </DashboardPageShell>
  );
}
