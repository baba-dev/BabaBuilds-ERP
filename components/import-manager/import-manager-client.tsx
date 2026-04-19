"use client";

import { useMemo, useState } from 'react';
import { ArrowRight, Bot, Download, FileUp, Sparkles, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ImportEntityKey, ImportExecutionMode, ImportPreview, MappingSuggestion } from '@/lib/imports/core/types';
import { IMPORT_ADAPTERS } from '@/lib/imports/adapters/entity-adapters';
import { cn } from '@/lib/utils';

const entities = Object.values(IMPORT_ADAPTERS);
const steps = ['Entity', 'Source', 'Upload', 'Mapping', 'Preview', 'Execute', 'Result'];

export function ImportManagerClient() {
  const [entity, setEntity] = useState<ImportEntityKey | null>(null);
  const [sourceMode, setSourceMode] = useState<'template' | 'arbitrary'>('template');
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<MappingSuggestion[]>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewRunId, setPreviewRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportExecutionMode>('create_only');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);

  const selected = entity ? IMPORT_ADAPTERS[entity] : null;

  const requiredFields = useMemo(() => selected?.fields.filter((f) => f.required).map((f) => f.key) ?? [], [selected]);

  async function loadHistory() {
    const res = await fetch('/api/imports/history', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json() as { history: Array<Record<string, unknown>> };
      setHistory(data.history || []);
    }
  }

  async function onDownloadTemplate() {
    if (!entity) return;
    window.open(`/api/imports/templates?entity=${entity}`, '_blank');
  }

  async function onParse() {
    if (!file || !entity) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity', entity);
      fd.append('sourceMode', sourceMode);
      const res = await fetch('/api/imports/parse', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse file');
      setHeaders(data.parsed.headers);
      setRows(data.parsed.rows);
      setMappings(data.mappingSuggestions);
      setAiNotice(data.aiNotice);
      setStep(4);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  }

  async function onPreview() {
    if (!entity) return;
    setLoading(true);
    try {
      const res = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, sourceMode, fileName: file?.name || 'upload.csv', headers, rows, mappings, aiUsed: !aiNotice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview failed');
      setPreview(data.preview);
      setPreviewRunId(data.previewRunId);
      setStep(5);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }

  async function onExecute() {
    if (!previewRunId) return;
    setLoading(true);
    try {
      const idem = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `import-${Date.now()}`;
      const res = await fetch('/api/imports/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify({ previewRunId, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import execution failed');
      setResult(data.summary);
      setStep(7);
      await loadHistory();
      toast.success('Import completed safely.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import execution failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <Card className="border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-900/60 dark:from-zinc-950 dark:to-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200"><Sparkles className="h-5 w-5" /> Universal Import Manager</CardTitle>
          <CardDescription className="text-amber-700 dark:text-amber-300/90">All imports are preview-first. No write happens until validation and confirmation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setStep(1)} className="bg-amber-600 hover:bg-amber-500 text-white">Start Import</Button>
          <Badge variant="outline" className="border-amber-400/50 text-amber-700 dark:text-amber-300">Secure + Workspace-isolated</Badge>
          <Badge variant="outline" className="border-orange-400/50 text-orange-700 dark:text-orange-300">CSV / XLSX</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Import Steps</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-7">
          {steps.map((s, i) => (
            <div key={s} className={cn('rounded-xl border px-3 py-2 text-xs', step >= i + 1 ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20' : 'border-zinc-200 dark:border-zinc-800')}>
              <div className="font-semibold">{i + 1}. {s}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Select entity</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {entities.map((e) => (
            <button key={e.entity} type="button" onClick={() => { setEntity(e.entity); setStep(2); }} className={cn('rounded-2xl border p-4 text-left transition-all hover:shadow-md', entity === e.entity ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-zinc-200 dark:border-zinc-800')}>
              <p className="font-semibold">{e.label}</p>
              <p className="text-xs text-zinc-500 mt-1">{e.description}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {entity && (
        <Card>
          <CardHeader><CardTitle>Source mode + file</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant={sourceMode === 'template' ? 'default' : 'outline'} className={sourceMode === 'template' ? 'bg-amber-600 hover:bg-amber-500' : ''} onClick={() => setSourceMode('template')}><Download className="h-4 w-4 mr-1" />Template mode</Button>
              <Button variant={sourceMode === 'arbitrary' ? 'default' : 'outline'} className={sourceMode === 'arbitrary' ? 'bg-amber-600 hover:bg-amber-500' : ''} onClick={() => setSourceMode('arbitrary')}><FileUp className="h-4 w-4 mr-1" />Arbitrary file mode</Button>
              <Button variant="outline" onClick={onDownloadTemplate}><Download className="h-4 w-4 mr-1" />Download {selected?.label} template</Button>
            </div>

            <div className="rounded-xl border border-dashed border-amber-400/40 p-4">
              <label className="text-sm font-medium">Upload CSV/XLSX</label>
              <input type="file" accept=".csv,.xlsx" className="mt-2 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Button onClick={onParse} disabled={!file || loading} className="mt-3 bg-amber-600 hover:bg-amber-500 text-white"><UploadCloud className="h-4 w-4 mr-1" />{loading ? 'Parsing...' : 'Parse file'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {headers.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Column mapping</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {aiNotice ? (
              <div className="rounded-lg border border-amber-300/50 bg-amber-50/70 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">{aiNotice}</div>
            ) : (
              <div className="rounded-lg border border-emerald-300/40 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200 flex items-center gap-2"><Bot className="h-4 w-4" />AI-assisted suggestions are active for this workspace.</div>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              {headers.map((h, idx) => {
                const selectedMap = mappings.find((m) => m.sourceHeader === h)?.targetField ?? 'ignore';
                return (
                  <div key={h + idx} className="rounded-xl border p-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{h}</p>
                      <p className="text-xs text-zinc-500">{rows[0]?.[idx] ?? ''}</p>
                    </div>
                    <Select value={selectedMap || 'ignore'} onValueChange={(value) => setMappings((prev) => prev.map((m) => m.sourceHeader === h ? { ...m, targetField: value === 'ignore' ? null : value, source: 'manual' } : m))}>
                      <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">Ignore</SelectItem>
                        {selected?.fields.map((field) => (
                          <SelectItem key={field.key} value={field.key}>{field.label}{field.required ? ' *' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button onClick={onPreview} disabled={loading} className="bg-amber-600 hover:bg-amber-500 text-white">Validate & Preview <ArrowRight className="h-4 w-4 ml-1" /></Button>
              <p className="text-xs text-zinc-500 self-center">Required: {requiredFields.join(', ')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader><CardTitle>Validation preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
              <Badge variant="outline">Parsed {preview.counts.parsed}</Badge>
              <Badge variant="outline">Ready {preview.counts.ready}</Badge>
              <Badge variant="outline">Warnings {preview.counts.warnings}</Badge>
              <Badge variant="outline">Errors {preview.counts.errors}</Badge>
              <Badge variant="outline">Duplicates {preview.counts.duplicates}</Badge>
              <Badge variant="outline">Skipped {preview.counts.skipped}</Badge>
            </div>
            <div className="max-h-64 overflow-auto rounded-xl border">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900"><tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Issues</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r) => (
                    <tr key={r.rowNumber} className="border-t"><td className="p-2">{r.rowNumber}</td><td className="p-2">{r.issues.some((i) => i.severity === 'error') ? 'Error' : r.issues.length ? 'Warning' : 'Ready'}</td><td className="p-2">{r.issues.map((i) => i.message).join('; ') || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={mode} onValueChange={(value) => setMode(value as ImportExecutionMode)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_only">Create only</SelectItem>
                  <SelectItem value="upsert">Upsert</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={onExecute} disabled={loading || preview.counts.errors > 0} className="bg-amber-600 hover:bg-amber-500 text-white">Execute import</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle>Import summary</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-5 text-sm">
            <Badge variant="outline">Imported {String(result.imported ?? 0)}</Badge>
            <Badge variant="outline">Updated {String(result.updated ?? 0)}</Badge>
            <Badge variant="outline">Skipped {String(result.skipped ?? 0)}</Badge>
            <Badge variant="outline">Failed {String(result.failed ?? 0)}</Badge>
            <Badge variant="outline">Rows {String(result.totalRowsParsed ?? 0)}</Badge>
            {Number(result.failed ?? 0) > 0 && previewRunId ? (
              <a className="text-xs underline text-amber-600" href={`/api/imports/history/${previewRunId}/errors.csv`}>
                Download error CSV
              </a>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Import history</CardTitle><Button variant="outline" size="sm" onClick={loadHistory}>Refresh</Button></CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900"><tr><th className="p-2 text-left">Entity</th><th className="p-2 text-left">File</th><th className="p-2 text-left">Mode</th><th className="p-2 text-left">AI</th><th className="p-2 text-left">Counts</th><th className="p-2 text-left">Status</th></tr></thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td className="p-3 text-zinc-500" colSpan={6}>No import runs yet.</td></tr>
                ) : history.map((run, i) => (
                  <tr key={String(run.id ?? i)} className="border-t"><td className="p-2">{String(run.entityKey ?? '')}</td><td className="p-2">{String(run.fileName ?? '')}</td><td className="p-2">{String(run.executionMode ?? run.sourceMode ?? '')}</td><td className="p-2">{run.aiUsed ? 'Yes' : 'No'}</td><td className="p-2">I:{String(run.importedCount ?? 0)} U:{String(run.updatedCount ?? 0)} S:{String(run.skippedCount ?? 0)} F:{String(run.failedCount ?? 0)} <span className="text-zinc-400">({String(run.lastProcessedRow ?? 0)})</span></td><td className="p-2 space-x-2">{String(run.status ?? '')}{Number(run.failedCount ?? 0) > 0 ? <a className="underline text-amber-600" href={`/api/imports/history/${String(run.id)}/errors.csv`}>Errors</a> : null}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
