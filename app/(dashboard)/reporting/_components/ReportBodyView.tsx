"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, CircleAlert, Info, Lightbulb, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReportChart } from "./ReportChart";
import { TRANSLATED_KEYS, type Cell, type Col, type Kpi, type Lineage, type ReportResult, type Row } from "./shared";

function Spark({ values, good }: { values: number[]; good: boolean | null }) {
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${16 - ((v - lo) / span) * 14}`).join(" ");
  return <svg viewBox="0 0 60 18" className="h-5 w-16" aria-hidden><polyline points={pts} fill="none" strokeWidth={1.6} strokeLinejoin="round" className={cn(good == null ? "stroke-muted-foreground" : good ? "stroke-emerald-500" : "stroke-rose-500")} /></svg>;
}

/** Everything under the filters of a report, shared by the workspace viewer and the read-only share page. */
export function ReportBodyView({ result, locale, lineage, money, compact, showDrill = true }: { result: ReportResult; locale: string; lineage?: Lineage; money: (n: number) => string; compact: (n: number) => string; showDrill?: boolean }) {
  const t = useTranslations("ReportingCenter");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [showLineage, setShowLineage] = useState(false);

  const label = (k: string) => (t.has(`label.${k}`) ? t(`label.${k}`) : k);
  const cellText = (k: string, v: unknown) => (typeof v === "string" && TRANSLATED_KEYS.has(k) && t.has(`value.${v}`) ? t(`value.${v}`) : v == null ? "" : String(v));
  const fmt = (c: Col, v: Cell) => {
    if (v == null || v === "") return "—";
    if (typeof v === "number") return c.format === "currency" ? money(v) : c.format === "percent" ? `${v}%` : v.toLocaleString(locale);
    return c.format === "date" ? new Date(v).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : cellText(c.key, v);
  };
  const kfmt = (k: Kpi, v: number) => (k.format === "currency" ? money(v) : k.format === "percent" ? `${v}%` : v.toLocaleString(locale));

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list: Row[] = s ? result.rows.filter((r) => result.columns.some((c) => typeof r[c.key] === "string" && cellText(c.key, r[c.key]).toLowerCase().includes(s))) : result.rows;
    if (sort) list = [...list].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? "")); return sort.dir === "asc" ? d : -d; });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, q, sort]);

  const delta = (k: Kpi) => {
    const prev = result.previous?.find((p) => p.key === k.key);
    if (!prev) return null;
    const diff = k.value - prev.value, pct = prev.value !== 0 ? (diff / Math.abs(prev.value)) * 100 : null;
    return { pct, diff, good: k.upGood == null || diff === 0 ? null : (diff > 0) === k.upGood };
  };
  const insightText = (i: ReportResult["insights"][number]) => t(`insight.${i.code}`, { ...i.params, kpi: i.params.kpi ? label(String(i.params.kpi)) : "" });
  const qualityText = (qi: ReportResult["quality"][number]) => t(`quality.${qi.code}`, { count: qi.count, amount: qi.amount != null ? money(qi.amount) : "" });
  const cmpLabel = result.compareMode === "yoy" ? t("vsLastYear") : t("vsPrevious");

  return (
    <div className="space-y-5">
      {result.quality.length ? (
        <ul className="space-y-2">
          {result.quality.map((qi) => (
            <li key={qi.code} className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span className="flex-1">{qualityText(qi)}</span>{showDrill ? <Link href={qi.href} className="shrink-0 text-xs underline underline-offset-2">{t("fixIt")}</Link> : null}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {result.kpis.map((k) => { const d = delta(k); return (
          <div key={k.key} className="rounded-2xl border bg-card p-4 shadow-xs">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label(k.key)}</p>
            <div className="mt-1 flex items-end justify-between gap-2"><p className="text-xl font-semibold tabular-nums sm:text-2xl">{kfmt(k, k.value)}</p>{k.spark && k.spark.length > 2 ? <Spark values={k.spark} good={k.upGood == null ? null : (k.spark[k.spark.length - 1]! >= k.spark[0]!) === k.upGood} /> : null}</div>
            {d ? <p className={cn("mt-0.5 flex items-center gap-1 text-xs tabular-nums", d.good == null ? "text-muted-foreground" : d.good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{d.diff >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{d.pct == null ? t("newVsPrev") : `${Math.abs(Math.round(d.pct))}%`} {cmpLabel}</p> : null}
          </div>); })}
      </div>

      {result.insights.length ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-amber-500" />{t("whatStandsOut")}</h2>
          <ul className="space-y-1.5 text-sm">{result.insights.map((i, idx) => <li key={idx} className="flex gap-2"><span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", i.tone === "bad" ? "bg-rose-500" : i.tone === "warn" ? "bg-amber-500" : i.tone === "good" ? "bg-emerald-500" : "bg-sky-500")} />{insightText(i)}</li>)}</ul>
        </section>
      ) : null}

      {result.chart && result.rows.length ? <section className="rounded-3xl border bg-card p-4 sm:p-5"><ReportChart spec={result.chart} rows={result.rows} compact={compact} label={(v) => cellText(result.chart!.labelKey, v)} seriesLabel={label} other={t("other")} /></section> : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t("rowCount", { count: rows.length })}</p>
          <div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchRows")} className="h-9 pl-9" aria-label={t("searchRows")} /></div>
        </div>
        {rows.length === 0 ? <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">{t("emptyRows")}</div> : (
          <>
            <ul className="space-y-2 sm:hidden">
              {rows.map((r, i) => (
                <li key={i} className="rounded-2xl border bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2"><p className="font-medium">{fmt(result.columns[0]!, r[result.columns[0]!.key] ?? null)}</p>{showDrill && typeof r._href === "string" ? <Link href={r._href} aria-label={t("open")}><ArrowUpRight className="h-4 w-4 text-muted-foreground" /></Link> : null}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">{result.columns.slice(1).map((c) => <div key={c.key} className="min-w-0"><dt className="truncate text-[11px] text-muted-foreground">{label(c.key)}</dt><dd className="truncate tabular-nums">{fmt(c, r[c.key] ?? null)}</dd></div>)}</dl>
                </li>
              ))}
              {result.totals ? <li className="rounded-2xl border-2 bg-muted/40 p-3 text-sm font-semibold"><p>{t("total")}</p><dl className="mt-1 grid grid-cols-2 gap-x-3">{result.columns.slice(1).filter((c) => result.totals![c.key] != null).map((c) => <div key={c.key}><dt className="truncate text-[11px] font-normal text-muted-foreground">{label(c.key)}</dt><dd className="tabular-nums">{fmt(c, result.totals![c.key] ?? null)}</dd></div>)}</dl></li> : null}
            </ul>
            <div className="hidden overflow-x-auto rounded-2xl border bg-card sm:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40"><tr>
                  {result.columns.map((c) => <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground", c.format === "text" || c.format === "date" ? "text-left" : "text-right")}><button type="button" onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === "asc" ? { key: c.key, dir: "desc" } : null) : { key: c.key, dir: "asc" }))} className="inline-flex items-center gap-1 hover:text-foreground">{label(c.key)}{sort?.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}</button></th>)}
                  <th className="w-8" />
                </tr></thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      {result.columns.map((c) => <td key={c.key} className={cn("px-4 py-2.5", c.format === "text" || c.format === "date" ? "text-left" : "text-right tabular-nums")}>{fmt(c, r[c.key] ?? null)}</td>)}
                      <td className="px-2">{showDrill && typeof r._href === "string" ? <Link href={r._href} aria-label={t("open")} className="text-muted-foreground hover:text-foreground"><ArrowUpRight className="h-4 w-4" /></Link> : null}</td>
                    </tr>
                  ))}
                </tbody>
                {result.totals ? <tfoot className="border-t-2 bg-muted/40 font-semibold"><tr>{result.columns.map((c, i) => <td key={c.key} className={cn("px-4 py-2.5", c.format === "text" || c.format === "date" ? "text-left" : "text-right tabular-nums")}>{i === 0 ? t("total") : fmt(c, result.totals![c.key] ?? null)}</td>)}<td /></tr></tfoot> : null}
              </table>
            </div>
          </>
        )}
        {result.truncated ? <p className="text-xs text-amber-600 dark:text-amber-400">{t("truncated")}</p> : null}
        {result.notes.length ? <ul className="space-y-1 text-xs text-muted-foreground">{result.notes.map((n) => <li key={n} className="flex gap-1.5"><Info className="mt-0.5 h-3 w-3 shrink-0" />{t(`note.${n}`)}</li>)}</ul> : null}
      </section>

      {lineage && (lineage.sources.length || lineage.rules.length) ? (
        <section className="rounded-2xl border bg-card">
          <button type="button" onClick={() => setShowLineage((v) => !v)} aria-expanded={showLineage} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"><span>{t("howCalculated")}</span><ChevronDown className={cn("h-4 w-4 transition-transform", showLineage && "rotate-180")} /></button>
          {showLineage ? (
            <div className="space-y-3 border-t px-4 py-3 text-sm">
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("dataFrom")}</p><p className="mt-1 flex flex-wrap gap-1.5">{lineage.sources.map((s) => <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-xs">{t.has(`source.${s}`) ? t(`source.${s}`) : s}</span>)}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("rulesApplied")}</p><ul className="mt-1 list-disc space-y-1 pl-5">{lineage.rules.map((r) => <li key={r}>{t(`rule.${r}`)}</li>)}</ul></div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
