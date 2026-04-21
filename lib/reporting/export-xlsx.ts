import 'server-only';
import ExcelJS from 'exceljs';

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

export async function buildReportWorkbook(params: {
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

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  wsData.forEach((row) => worksheet.addRow(row));
  const endCol = colLetter(params.columns.length);
  worksheet.autoFilter = `A${headerRowIndex1Based}:${endCol}${headerRowIndex1Based}`;
  worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIndex1Based }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildReportFilename(presetId: string, generatedAt: Date) {
  const stamp = generatedAt.toISOString().slice(0, 10);
  return `${presetId.replace(/[^a-z0-9_-]/gi, '_')}_${stamp}.xlsx`;
}
