import { getImportAdapter } from '@/lib/imports/adapters/entity-adapters';
import type { ImportEntityKey } from '@/lib/imports/core/types';

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function buildTemplateCsv(entity: ImportEntityKey): string {
  const adapter = getImportAdapter(entity);
  const headers = adapter.fields.map((f) => f.key);
  const sample = headers.map((h) => String(adapter.sampleRow[h] ?? ''));
  return `${headers.map(csvEscape).join(',')}\n${sample.map(csvEscape).join(',')}\n`;
}
