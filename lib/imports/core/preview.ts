import { Prisma } from '@prisma/client';
import { getImportAdapter } from '@/lib/imports/adapters/entity-adapters';
import type { ImportEntityKey, ImportPreview, MappingSuggestion, RowIssue, ValidatedRow } from '@/lib/imports/core/types';

function toNum(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function toBool(value: string): boolean {
  return ['true', '1', 'yes', 'y', 'active'].includes(value.toLowerCase().trim());
}

function toDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emailOk(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeDedupeValue(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function buildPreview(args: {
  entity: ImportEntityKey;
  fileName: string;
  sourceMode: 'template' | 'arbitrary';
  aiUsed: boolean;
  headers: string[];
  rows: string[][];
  mappings: MappingSuggestion[];
}): ImportPreview {
  const adapter = getImportAdapter(args.entity);
  const headerToField = new Map(
    args.mappings
      .filter((m) => m.targetField)
      .map((m) => [m.sourceHeader, m.targetField as string]),
  );
  const requiredUnmapped = adapter.fields.filter((f) => f.required && !Array.from(headerToField.values()).includes(f.key)).map((f) => f.key);

  const dedupe = new Set<string>();
  let warnings = 0;
  let errors = 0;
  let duplicates = 0;
  let skipped = 0;

  const validatedRows: ValidatedRow[] = args.rows.map((row, idx) => {
    const original: Record<string, string> = {};
    args.headers.forEach((h, i) => {
      original[h] = String(row[i] ?? '').trim();
    });

    const normalized: Record<string, unknown> = {};
    const issues: RowIssue[] = [];

    for (const [header, field] of headerToField.entries()) {
      const raw = original[header] ?? '';
      if (['amount', 'defaultPrice', 'price', 'taxRate', 'taxAmount', 'unitCost', 'sellingPrice', 'totalAmount', 'currentStock', 'reorderLevel'].includes(field)) {
        const num = toNum(raw);
        normalized[field] = num;
        if (raw && num === null) issues.push({ field, severity: 'error', code: 'INVALID_NUMBER', message: `${field} must be numeric.` });
      } else if (['active'].includes(field)) {
        normalized[field] = toBool(raw);
      } else if (['date', 'dateCreated', 'validUntil'].includes(field)) {
        const d = toDate(raw);
        normalized[field] = d?.toISOString() ?? null;
        if (raw && !d) issues.push({ field, severity: 'error', code: 'INVALID_DATE', message: `${field} is not a valid date.` });
      } else {
        normalized[field] = raw;
      }
    }

    adapter.fields.filter((f) => f.required).forEach((f) => {
      if (!normalized[f.key]) {
        issues.push({ field: f.key, severity: 'error', code: 'REQUIRED', message: `${f.label} is required.` });
      }
    });

    if (typeof normalized.email === 'string' && normalized.email && !emailOk(String(normalized.email))) {
      issues.push({ field: 'email', severity: 'error', code: 'INVALID_EMAIL', message: 'Email format is invalid.' });
    }

    if (args.entity === 'inventory') {
      ['currentStock', 'reorderLevel', 'unitCost', 'sellingPrice'].forEach((field) => {
        const value = normalized[field] as number | null;
        if (typeof value === 'number' && value < 0) issues.push({ field, severity: 'error', code: 'NEGATIVE_NOT_ALLOWED', message: `${field} cannot be negative.` });
      });
    }
    if (args.entity === 'expenses') {
      const amount = normalized.amount as number | null;
      if (amount !== null && amount <= 0) issues.push({ field: 'amount', severity: 'error', code: 'INVALID_AMOUNT', message: 'Expense amount must be positive.' });
    }

    let dedupeKey = '';
    if (args.entity === 'clients') dedupeKey = String(normalized.email || `${normalized.name}|${normalized.phone}`);
    if (args.entity === 'services') {
      const code = normalizeDedupeValue(normalized.code);
      const name = normalizeDedupeValue(normalized.name);
      dedupeKey = code || name;
    }
    if (args.entity === 'shop_items') {
      const sku = normalizeDedupeValue(normalized.sku);
      const name = normalizeDedupeValue(normalized.name);
      dedupeKey = sku || name;
    }
    if (args.entity === 'inventory') dedupeKey = String(normalized.sku || '');
    if (args.entity === 'proposals') dedupeKey = String(normalized.proposalNo || `${normalized.title}|${normalized.clientEmail}` || '');
    if (args.entity === 'expenses') dedupeKey = String(`${normalized.vendor}|${normalized.amount}|${normalized.date}`);

    if (dedupeKey) {
      if (dedupe.has(dedupeKey)) {
        issues.push({ severity: 'warning', code: 'DUPLICATE_IN_FILE', message: 'Potential duplicate row in this file.' });
        duplicates += 1;
      }
      dedupe.add(dedupeKey);
    }

    warnings += issues.filter((i) => i.severity === 'warning').length;
    errors += issues.filter((i) => i.severity === 'error').length;
    if (issues.some((i) => i.severity === 'error')) skipped += 1;

    return { rowNumber: idx + 1, original, normalized, issues, dedupeKey };
  });

  return {
    entity: args.entity,
    fileName: args.fileName,
    sourceMode: args.sourceMode,
    aiUsed: args.aiUsed,
    mappings: args.mappings,
    requiredUnmapped,
    rows: validatedRows,
    counts: {
      parsed: args.rows.length,
      ready: validatedRows.filter((r) => !r.issues.some((i) => i.severity === 'error')).length,
      warnings,
      errors,
      duplicates,
      skipped,
    },
  };
}

export function asDecimal(value: unknown): Prisma.Decimal {
  return new Prisma.Decimal(typeof value === 'number' ? value : Number(value ?? 0));
}
