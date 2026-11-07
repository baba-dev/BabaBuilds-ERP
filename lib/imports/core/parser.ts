import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ParsedTabularFile } from '@/lib/imports/core/types';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const allowedMime = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const UploadSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  size: z.number().max(MAX_FILE_BYTES),
});

function sanitizeCell(value: unknown): string {
  const text = String(value ?? '').trim();
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}

function detectHeaderRow(rows: string[][]): number {
  const scan = rows.slice(0, 20);
  let best = 0;
  let score = -1;
  scan.forEach((row, idx) => {
    const nonEmpty = row.filter(Boolean).length;
    const alpha = row.filter((c) => /[a-zA-Z]/.test(c)).length;
    const current = nonEmpty + alpha;
    if (current > score) {
      score = current;
      best = idx;
    }
  });
  return best;
}

export async function parseImportFile(file: File): Promise<ParsedTabularFile> {
  UploadSchema.parse({ name: file.name, type: file.type, size: file.size });
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['csv', 'xlsx'].includes(extension)) {
    throw new Error('Only CSV and XLSX files are supported.');
  }
  if (file.type && !allowedMime.has(file.type)) {
    throw new Error('Unsupported file content type.');
  }

  let rawRows: string[][] = [];
  if (extension === 'csv') {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
    rawRows = (parsed.data as unknown[][]).map((row) => (Array.isArray(row) ? row.map(sanitizeCell) : []));
  } else {
    const buff = Buffer.from(await file.arrayBuffer()) as unknown as import('buffer').Buffer;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buff as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('No worksheet found.');
    const matrix = sheet.getSheetValues().slice(1).map((row) => {
      if (!Array.isArray(row)) return [];
      return row.slice(1).map((cell) => sanitizeCell(String(cell ?? '')));
    });
    rawRows = matrix;
  }

  if (rawRows.length === 0) throw new Error('File appears empty.');
  if (rawRows.length > MAX_ROWS) throw new Error(`File exceeds ${MAX_ROWS} row limit.`);

  const headerRowIndex = detectHeaderRow(rawRows);
  const headers = (rawRows[headerRowIndex] ?? []).map((h, i) => h || `column_${i + 1}`);
  const rows = rawRows.slice(headerRowIndex + 1).filter((r) => r.some(Boolean));

  return {
    fileName: file.name,
    format: extension as 'csv' | 'xlsx',
    headerRowIndex,
    headers,
    rows,
    sampleRows: rows.slice(0, 5),
  };
}
