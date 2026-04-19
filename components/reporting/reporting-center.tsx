'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ChartColumnBig, Download, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';

type PublicPreset = {
  id: string;
  title: string;
  description: string;
  category: string;
  columns: Array<{ key: string; label: string; format?: string }>;
  methodology: string;
  accountingPolicyRefs: string[];
};

type Abilities = {
  canView: boolean;
  canRun: boolean;
  canExport: boolean;
  moduleEnabled: boolean;
};

function parseAttachmentFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const star = contentDisposition.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (star?.[1]) return decodeURIComponent(star[1]);
  const quoted = contentDisposition.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = contentDisposition.match(/filename=([^;\s]+)/i);
  return plain?.[1]?.replace(/^"|"$/g, '') ?? null;
}

export function ReportingCenter({ initialPresetId }: { initialPresetId?: string }) {
  const t = useTranslations('Reporting');
  const router = useRouter();
  const [presets, setPresets] = useState<PublicPreset[]>([]);
  const [abilities, setAbilities] = useState<Abilities | null>(null);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [presetId, setPresetId] = useState(initialPresetId ?? '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<{ durationMs?: number; rowCount?: number; methodology?: string } | null>(null);
  const [activeColumns, setActiveColumns] = useState<PublicPreset['columns']>([]);
  const [error, setError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (initialPresetId) setPresetId(initialPresetId);
  }, [initialPresetId]);

  const loadAbilities = useCallback(async () => {
    const res = await fetch('/api/reporting/abilities');
    if (!res.ok) return;
    const data = (await res.json()) as Abilities;
    setAbilities(data);
  }, []);

  useEffect(() => {
    void loadAbilities();
  }, [loadAbilities]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingPresets(true);
      try {
        const res = await fetch('/api/reporting/presets');
        const data = (await res.json()) as { presets?: PublicPreset[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setError(data.error ?? t('errors.load_failed'));
          return;
        }
        if (!cancelled) {
          setPresets(data.presets ?? []);
          setError(null);
        }
      } catch {
        if (!cancelled) setError(t('errors.load_failed'));
      } finally {
        if (!cancelled) setLoadingPresets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? null,
    [presets, presetId],
  );

  const onSelectPreset = (id: string) => {
    setPresetId(id);
    setRows([]);
    setMeta(null);
    setActiveColumns([]);
    setError(null);
    if (id) router.replace(`/reporting/${id}`);
    else router.replace('/reporting');
  };

  const buildFilters = () => ({
    fromDate: fromDate ? new Date(fromDate).toISOString() : undefined,
    toDate: toDate ? new Date(toDate).toISOString() : undefined,
  });

  const runReport = async () => {
    if (!presetId) return;
    setRunLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reporting/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId, filters: buildFilters() }),
      });
      const body = (await res.json()) as {
        error?: string;
        rows?: Record<string, unknown>[];
        preset?: { columns: PublicPreset['columns']; methodology?: string };
        meta?: { durationMs: number; rowCount: number };
      };
      if (!res.ok) {
        setError(body.error ?? t('errors.run_failed'));
        setRows([]);
        setMeta(null);
        return;
      }
      setRows(body.rows ?? []);
      setActiveColumns(body.preset?.columns ?? selectedPreset?.columns ?? []);
      setMeta({
        ...body.meta,
        methodology: body.preset?.methodology ?? selectedPreset?.methodology,
      });
    } catch {
      setError(t('errors.run_failed'));
      setRows([]);
    } finally {
      setRunLoading(false);
    }
  };

  const downloadReport = async () => {
    if (!presetId) return;
    setExportLoading(true);
    try {
      const res = await fetch('/api/reporting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId, filters: buildFilters() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t('errors.export_failed'));
        return;
      }
      const blob = await res.blob();
      const name =
        parseAttachmentFilename(res.headers.get('Content-Disposition')) ?? `${presetId}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('errors.export_failed'));
    } finally {
      setExportLoading(false);
    }
  };

  const displayColumns = activeColumns.length > 0 ? activeColumns : selectedPreset?.columns ?? [];

  const formatCell = (key: string, v: unknown, format?: string) => {
    if (v === null || v === undefined) return '—';
    if (format === 'currency') return formatCurrency(Number(v));
    if (format === 'date') {
      const d = v instanceof Date ? v : new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
    }
    if (format === 'percent') return `${Number(v).toFixed(2)}%`;
    if (format === 'number') return Number(v).toLocaleString();
    return String(v);
  };

  const needsDateRange = selectedPreset?.id
    ? ['pnl_summary', 'expense_register', 'invoice_register'].includes(selectedPreset.id)
    : false;

  return (
    <div className="space-y-6 max-w-7xl">
      <Card
        className={cn(
          'border-2 border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/80',
          'dark:border-amber-900/50 dark:from-amber-950/30 dark:via-zinc-950 dark:to-orange-950/20',
        )}
      >
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 shadow-lg shadow-amber-500/20 dark:bg-amber-600">
              <ChartColumnBig className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-amber-950 dark:text-amber-100">{t('hero.title')}</CardTitle>
              <CardDescription className="text-zinc-600 dark:text-zinc-400">{t('hero.subtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t('filters.preset')}
            </label>
            {loadingPresets ? (
              <Skeleton className="h-10 w-full rounded-md" />
            ) : (
              <Select value={presetId || undefined} onValueChange={onSelectPreset}>
                <SelectTrigger className="border-amber-200/80 bg-white dark:border-amber-900/40 dark:bg-zinc-950">
                  <SelectValue placeholder={t('filters.preset_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {needsDateRange && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('filters.from')}
                </label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="border-amber-200/80 dark:border-amber-900/40"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('filters.to')}
                </label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="border-amber-200/80 dark:border-amber-900/40"
                />
              </div>
            </>
          )}
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-4">
            <Button
              onClick={() => void runReport()}
              disabled={
                !presetId ||
                runLoading ||
                !abilities?.canRun ||
                (needsDateRange && (!fromDate || !toDate))
              }
              className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
            >
              {runLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {runLoading ? t('actions.running') : t('actions.run')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-amber-300 bg-white hover:bg-amber-50 dark:border-amber-800 dark:bg-zinc-900 dark:hover:bg-amber-950/40"
              onClick={() => void downloadReport()}
              disabled={!presetId || exportLoading || !abilities?.canExport || (needsDateRange && (!fromDate || !toDate))}
            >
              {exportLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t('actions.download')}
            </Button>
            {abilities && !abilities.canRun && abilities.moduleEnabled && (
              <p className="text-xs text-amber-800 dark:text-amber-300">{t('hints.no_run_permission')}</p>
            )}
            {abilities && !abilities.canExport && abilities.moduleEnabled && abilities.canRun && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('hints.no_export_permission')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900 dark:bg-rose-950/40"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="text-sm font-semibold text-rose-900 dark:text-rose-100">{t('errors.title')}</p>
            <p className="text-sm text-rose-800 dark:text-rose-200">{error}</p>
          </div>
        </div>
      )}

      {selectedPreset && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-amber-200/60 dark:border-amber-900/40 lg:col-span-2">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg text-zinc-900 dark:text-zinc-50">{selectedPreset.title}</CardTitle>
                  <CardDescription className="mt-1">{selectedPreset.description}</CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="border-amber-400/40 text-amber-800 dark:border-amber-700 dark:text-amber-300"
                >
                  {selectedPreset.category}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {selectedPreset.methodology}
              {selectedPreset.accountingPolicyRefs?.length > 0 && (
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
                  {t('methodology.policy_refs')}: {selectedPreset.accountingPolicyRefs.join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t('gallery.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant={p.id === presetId ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    p.id === presetId &&
                      'bg-amber-600 hover:bg-amber-700 text-white border-amber-600 dark:bg-amber-600',
                  )}
                  onClick={() => onSelectPreset(p.id)}
                >
                  {p.title}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {meta && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t('meta.line', {
            ms: meta.durationMs ?? 0,
            rows: meta.rowCount ?? rows.length,
          })}
        </p>
      )}

      {rows.length > 0 && displayColumns.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-amber-200/80 dark:border-amber-900/50 shadow-sm dark:shadow-none">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-amber-100/90 dark:bg-amber-950/50 backdrop-blur">
              <tr>
                {displayColumns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-left font-semibold text-amber-950 dark:text-amber-100">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100 dark:divide-amber-900/30 bg-white dark:bg-zinc-950">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-amber-50/50 dark:hover:bg-amber-950/20">
                  {displayColumns.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                      {formatCell(c.key, row[c.key], c.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!runLoading && rows.length === 0 && !error && presetId && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('empty.run_hint')}</p>
      )}
    </div>
  );
}
