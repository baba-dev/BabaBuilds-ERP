import 'server-only';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as any;

type ColumnMeta = { key: string; label: string; format?: 'currency' | 'date' | 'percent' | 'number' | 'text' };

export function buildReportWorkbook(params: {
  reportTitle: string;
  workspaceName: string;
  generatedAt: Date;
  rows: Record<string, unknown>[];
  columns: ColumnMeta[];
}) {
  const wsData = [
    [params.workspaceName],
    [params.reportTitle],
    [`Generated: ${params.generatedAt.toISOString()}`],
    [],
    params.columns.map((c) => c.label),
    ...params.rows.map((row) => params.columns.map((col) => row[col.key] ?? '')),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!autofilter'] = { ref: `A5:${String.fromCharCode(64 + params.columns.length)}5` };
  ws['!freeze'] = { xSplit: 0, ySplit: 5 } as never;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}

export function buildReportFilename(presetId: string, generatedAt: Date) {
  const stamp = generatedAt.toISOString().slice(0, 10);
  return `${presetId.replace(/[^a-z0-9_-]/gi, '_')}_${stamp}.xlsx`;
}
