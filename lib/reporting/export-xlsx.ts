import 'server-only';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as {
  utils: {
    aoa_to_sheet: (data: unknown[][]) => object;
    book_new: () => object;
    book_append_sheet: (wb: object, ws: object, name: string) => void;
  };
  write: (wb: object, opts: { type: string; bookType: string }) => Buffer;
};

type ColumnMeta = { key: string; label: string; format?: string };

function colLetter(n: number): string {
  if (n <= 0) return 'A';
  let s = '';
  let i = n;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export function buildReportWorkbook(params: {
  reportTitle: string;
  workspaceName: string;
  generatedAt: Date;
  methodology?: string;
  accountingPolicyRefs?: string[];
  rows: Record<string, unknown>[];
  columns: ColumnMeta[];
}) {
  const preamble: unknown[][] = [
    [params.workspaceName],
    [params.reportTitle],
    [`Generated: ${params.generatedAt.toISOString()}`],
  ];
  if (params.methodology?.trim()) {
    preamble.push([`Methodology: ${params.methodology.trim()}`]);
  }
  if (params.accountingPolicyRefs?.length) {
    preamble.push([`Policy refs: ${params.accountingPolicyRefs.join(', ')}`]);
  }
  preamble.push([]);

  const headerRowIndex1Based = preamble.length + 1;
  const wsData: unknown[][] = [
    ...preamble,
    params.columns.map((c) => c.label),
    ...params.rows.map((row) => params.columns.map((col) => row[col.key] ?? '')),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const endCol = colLetter(params.columns.length);
  (ws as { '!autofilter'?: { ref: string } })['!autofilter'] = {
    ref: `A${headerRowIndex1Based}:${endCol}${headerRowIndex1Based}`,
  };
  (ws as { '!freeze'?: { xSplit: number; ySplit: number } })['!freeze'] = {
    xSplit: 0,
    ySplit: headerRowIndex1Based,
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buffer);
}

export function buildReportFilename(presetId: string, generatedAt: Date) {
  const stamp = generatedAt.toISOString().slice(0, 10);
  return `${presetId.replace(/[^a-z0-9_-]/gi, '_')}_${stamp}.xlsx`;
}
