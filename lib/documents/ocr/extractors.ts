import 'server-only';

import type { OcrResult } from '@/lib/documents/ocr/providers';

export type ExtractedFieldInput = {
  fieldKey: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: string | null; // ISO date string (YYYY-MM-DD)
  confidence?: number | null; // 0..1
};

export function extractGenericFields(result: OcrResult): ExtractedFieldInput[] {
  const fields: ExtractedFieldInput[] = [];

  if (result.rawText) {
    fields.push({
      fieldKey: 'rawText',
      valueText: result.rawText.slice(0, 50_000),
      confidence: 0.2,
    });
  }

  // Minimal heuristics for v1 scaffold (non-authoritative)
  const lines = (result.rawText ?? '')
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean);

  // Find likely total amount (very rough)
  const money = lines
    .map((l) => l.match(/(?:total|amount due|grand total)[^0-9]{0,20}([0-9]+(?:[.,][0-9]{2})?)/i))
    .find(Boolean);
  if (money?.[1]) {
    const num = Number(money[1].replace(/,/g, '.'));
    if (Number.isFinite(num)) {
      fields.push({ fieldKey: 'totalAmount', valueNumber: num, confidence: 0.35 });
    }
  }

  // Find likely date
  const date = lines
    .map((l) => l.match(/\b(20[0-9]{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12][0-9]|3[01])\b/))
    .find(Boolean);
  if (date?.[0]) {
    fields.push({ fieldKey: 'documentDate', valueDate: date[0].replace(/\//g, '-'), confidence: 0.35 });
  }

  return fields;
}

