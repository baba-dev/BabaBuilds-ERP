"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportEntityKey, ImportExecutionMode, ImportPreview, MappingSuggestion } from "@/lib/imports/core/types";
import { IMPORT_ADAPTERS } from "@/lib/imports/adapters/entity-adapters";
import { cn } from "@/lib/utils";

const entities = Object.values(IMPORT_ADAPTERS);
const STEPS = ["entity", "upload", "mapping", "preview", "result"] as const;
type HistoryRow = { id: string; entityKey: string; fileName: string; status: string; importedCount: number; failedCount: number; createdAt: string };
const card = "rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm";

export function ImportManagerClient() {
  const t = useTranslations("ImportManagerHub");
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [entity, setEntity] = useState<ImportEntityKey | null>(null);
  const [sourceMode, setSourceMode] = useState<"template" | "arbitrary">("template");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<MappingSuggestion[]>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportExecutionMode>("create_only");
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const selected = entity ? IMPORT_ADAPTERS[entity] : null;
  const required = useMemo(() => selected?.fields.filter((f) => f.required) ?? [], [selected]);
  const mappedTargets = new Set(mappings.map((m) => m.targetField).filter(Boolean));
  const missingRequired = required.filter((f) => !mappedTargets.has(f.key));

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/imports/history", { cache: "no-store" });
    if (res.ok) setHistory(((await res.json()) as { history: HistoryRow[] }).history ?? []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount; state is set after the awaited response
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function call<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? t("error"));
    return data;
  }
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : t("error"));

  async function parse() {
    if (!file || !entity) return;
    setLoading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("entity", entity); fd.append("sourceMode", sourceMode);
      const d = await call<{ parsed: { headers: string[]; rows: string[][] }; mappingSuggestions: MappingSuggestion[]; aiNotice: string | null }>("/api/imports/parse", { method: "POST", body: fd });
      setHeaders(d.parsed.headers); setRows(d.parsed.rows); setMappings(d.mappingSuggestions); setAiNotice(d.aiNotice); setStep(2);
    } catch (e) { fail(e); } finally { setLoading(false); }
  }
  async function runPreview() {
    if (!entity) return;
    setLoading(true);
    try {
      const d = await call<{ preview: ImportPreview; previewRunId: string }>("/api/imports/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, sourceMode, fileName: file?.name || "upload.csv", headers, rows, mappings, aiUsed: !aiNotice }) });
      setPreview(d.preview); setRunId(d.previewRunId); setStep(3);
    } catch (e) { fail(e); } finally { setLoading(false); }
  }
  async function execute() {
    if (!runId) return;
    setLoading(true);
    try {
      const d = await call<{ summary: Record<string, number> }>("/api/imports/execute", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ previewRunId: runId, mode }) });
      setResult(d.summary); setStep(4); await loadHistory(); toast.success(t("done"));
    } catch (e) { fail(e); } finally { setLoading(false); }
  }
  function restart() { setStep(0); setEntity(null); setFile(null); setHeaders([]); setRows([]); setMappings([]); setPreview(null); setRunId(null); setResult(null); }

  return (
    <div className="space-y-6 pb-8">
      <ol className="flex gap-1.5 overflow-x-auto" aria-label={t("title")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", i === step ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100" : i < step ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-border/70 text-muted-foreground")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px]", i < step ? "bg-emerald-500 text-white" : "bg-muted")}>{i < step ? "✓" : i + 1}</span>{t(`steps.${s}`)}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("steps.entity")}>
          {entities.map((e) => (
            <button key={e.entity} type="button" onClick={() => { setEntity(e.entity); setStep(1); }} className={cn(card, "text-start transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500")}>
              <FileSpreadsheet className="mb-2 h-5 w-5 text-amber-600" />
              <p className="font-black">{t(`entity.${e.entity}`)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t(`entity.${e.entity}_desc`)}</p>
            </button>
          ))}
        </section>
      )}

      {step === 1 && selected && entity && (
        <section className={cn(card, "space-y-4")}>
          <h2 className="font-black">{t(`entity.${entity}`)}</h2>
          <div className="flex flex-wrap gap-2">
            {(["template", "arbitrary"] as const).map((m) => <Button key={m} type="button" variant={sourceMode === m ? "default" : "outline"} onClick={() => setSourceMode(m)} className={sourceMode === m ? "bg-amber-600 text-white hover:bg-amber-500" : ""}>{t(`source.${m}`)}</Button>)}
            <Button type="button" variant="ghost" onClick={() => window.open(`/api/imports/templates?entity=${entity}`, "_blank")}><Download className="me-1.5 h-4 w-4" />{t("downloadTemplate")}</Button>
          </div>
          <label className="block rounded-xl border border-dashed border-amber-400/50 p-5 text-sm">
            <span className="font-semibold">{t("chooseFile")}</span>
            <input type="file" accept=".csv,.xlsx" className="mt-2 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />{t("back")}</Button>
            <Button onClick={() => void parse()} disabled={!file || loading} className="bg-amber-600 text-white hover:bg-amber-500"><UploadCloud className="me-1.5 h-4 w-4" />{loading ? t("reading") : t("readFile")}</Button>
          </div>
        </section>
      )}

      {step === 2 && selected && (
        <section className={cn(card, "space-y-4")}>
          <h2 className="font-black">{t("mappingTitle")}</h2>
          <p className={cn("rounded-lg border p-3 text-sm", aiNotice ? "border-amber-300/50 bg-amber-50/70 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200" : "border-emerald-300/40 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200")}>{aiNotice ?? t("aiOn")}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {headers.map((h, idx) => {
              const current = mappings.find((m) => m.sourceHeader === h)?.targetField ?? "";
              return (
                <label key={h + idx} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{h}</span><span className="block truncate text-xs text-muted-foreground">{rows[0]?.[idx] ?? ""}</span></span>
                  <select value={current} onChange={(e) => setMappings((prev) => prev.map((m) => (m.sourceHeader === h ? { ...m, targetField: e.target.value || null, source: "manual" } : m)))} className="h-9 w-44 rounded-lg border border-input bg-transparent px-2 text-sm">
                    <option value="">{t("ignore")}</option>
                    {selected.fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          {missingRequired.length > 0 ? <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />{t("missingRequired", { fields: missingRequired.map((f) => f.label).join(", ") })}</p> : <p className="text-xs text-muted-foreground">{t("required", { fields: required.map((f) => f.label).join(", ") })}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />{t("back")}</Button>
            <Button onClick={() => void runPreview()} disabled={loading || missingRequired.length > 0} className="bg-amber-600 text-white hover:bg-amber-500">{t("validate")}<ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" /></Button>
          </div>
        </section>
      )}

      {step === 3 && preview && (
        <section className={cn(card, "space-y-4")}>
          <h2 className="font-black">{t("previewTitle")}</h2>
          <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
            {(["parsed", "ready", "warnings", "errors", "duplicates", "skipped"] as const).map((k) => (
              <div key={k} className={cn("rounded-xl border border-border/70 p-2", k === "errors" && preview.counts.errors > 0 && "border-rose-400/60 bg-rose-500/5")}>
                <dt className="text-[11px] text-muted-foreground">{t(`count.${k}`)}</dt><dd className="text-lg font-black tabular-nums">{preview.counts[k]}</dd>
              </div>
            ))}
          </dl>
          <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur"><tr><th className="p-2 text-start">{t("row")}</th><th className="p-2 text-start">{t("history.status")}</th><th className="p-2 text-start">·</th></tr></thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r) => {
                  const err = r.issues.some((i) => i.severity === "error");
                  const warn = !err && r.issues.length > 0;
                  return (
                    <tr key={r.rowNumber} className="border-t border-border/60 align-top">
                      <td className="p-2 tabular-nums">{r.rowNumber}</td>
                      <td className={cn("p-2 font-semibold", err ? "text-rose-600" : warn ? "text-amber-600" : "text-emerald-600")}>{err ? t("statusError") : warn ? t("statusWarning") : t("statusReady")}</td>
                      <td className="p-2 text-muted-foreground">{r.issues.map((i) => i.message).join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 50 && <p className="text-xs text-muted-foreground">{t("firstRows", { count: 50 })}</p>}
          {preview.counts.errors > 0 ? (
            <p className="flex items-center gap-2 text-sm text-rose-600"><AlertTriangle className="h-4 w-4" />{t("fixErrors")}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(["create_only", "upsert"] as const).map((m) => <Button key={m} type="button" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)} className={mode === m ? "bg-amber-600 text-white hover:bg-amber-500" : ""}>{t(`mode.${m}`)}</Button>)}
              </div>
              <p className="text-xs text-muted-foreground">{t(`mode.${mode}_hint`)}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />{t("back")}</Button>
            <Button onClick={() => void execute()} disabled={loading || preview.counts.errors > 0} className="bg-amber-600 text-white hover:bg-amber-500">{loading ? t("running") : t("run")}</Button>
          </div>
        </section>
      )}

      {step === 4 && result && (
        <section className={cn(card, "space-y-4")}>
          <h2 className="flex items-center gap-2 font-black"><CheckCircle2 className="h-5 w-5 text-emerald-500" />{t("done")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {(["imported", "updated", "skipped", "failed"] as const).map((k) => <div key={k} className="rounded-xl border border-border/70 p-3"><dt className="text-[11px] text-muted-foreground">{t(`result.${k}`)}</dt><dd className="text-2xl font-black tabular-nums">{result[k] ?? 0}</dd></div>)}
          </dl>
          {Number(result.failed ?? 0) > 0 && runId && <a className="text-sm font-semibold text-amber-700 underline" href={`/api/imports/history/${runId}/errors.csv`}>{t("errorCsv")}</a>}
          <div><Button onClick={restart} className="bg-amber-600 text-white hover:bg-amber-500">{t("another")}</Button></div>
        </section>
      )}

      <section className={card} aria-labelledby="im-history">
        <h2 id="im-history" className="mb-3 text-sm font-black">{t("history.title")}</h2>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">{t("history.empty")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground"><th className="p-2 text-start">{t("history.what")}</th><th className="p-2 text-start">{t("history.file")}</th><th className="p-2 text-start">{t("history.when")}</th><th className="p-2 text-start">{t("history.counts")}</th><th className="p-2 text-start">{t("history.status")}</th></tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id} className="border-t border-border/60"><td className="p-2">{h.entityKey in IMPORT_ADAPTERS ? t(`entity.${h.entityKey}`) : h.entityKey}</td><td className="max-w-48 truncate p-2">{h.fileName}</td><td className="p-2">{new Date(h.createdAt).toLocaleString(locale)}</td><td className="p-2 tabular-nums">{h.importedCount} / {h.failedCount}</td><td className="p-2">{h.status}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
