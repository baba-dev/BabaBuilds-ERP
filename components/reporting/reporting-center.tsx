'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Preset = { id: string; title: string; description: string; category: string; columns: Array<{ key: string; label: string }> };

export function ReportingCenter({ initialPresetId }: { initialPresetId?: string }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [presetId, setPresetId] = useState(initialPresetId ?? '');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/reporting/presets')
      .then((res) => res.json())
      .then((data: { presets?: Preset[] }) => setPresets(data.presets ?? []));
  }, []);

  const runReport = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch('/api/reporting/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId, filters: { fromDate: fromDate ? new Date(fromDate).toISOString() : undefined, toDate: toDate ? new Date(toDate).toISOString() : undefined } }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? 'Failed to run report');
      setRows([]);
    } else {
      setRows(body.rows ?? []);
    }
    setLoading(false);
  };

  const downloadReport = async () => {
    const res = await fetch('/api/reporting/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId, filters: { fromDate: fromDate ? new Date(fromDate).toISOString() : undefined, toDate: toDate ? new Date(toDate).toISOString() : undefined } }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presetId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/80 dark:border-amber-900/50 dark:from-amber-950/30 dark:via-zinc-950 dark:to-orange-950/20">
        <CardHeader>
          <CardTitle className="text-amber-900 dark:text-amber-200">Reporting Center</CardTitle>
          <CardDescription>Run curated finance and compliance reports with export-ready output.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <select className="h-10 rounded-md border bg-background px-3" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            <option value="">Select preset</option>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.title}</option>)}
          </select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={runReport} disabled={!presetId || loading} className="bg-amber-600 hover:bg-amber-700">{loading ? 'Running…' : 'Run report'}</Button>
            <Button variant="outline" onClick={downloadReport} disabled={!presetId}>Download</Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!error && rows.length === 0 && <p className="text-sm text-zinc-500">No rows yet. Choose a preset and run a report.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-amber-50 dark:bg-amber-950/30">
              <tr>{Object.keys(rows[0]).map((k) => <th className="px-3 py-2 text-left" key={k}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-t">{Object.entries(row).map(([k, v]) => <td key={k} className="px-3 py-2">{String(v ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
