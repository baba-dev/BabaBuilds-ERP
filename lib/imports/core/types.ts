export const IMPORT_ENTITY_KEYS = [
  'clients',
  'services',
  'shop_items',
  'inventory',
  'proposals',
  'expenses',
] as const;

export type ImportEntityKey = (typeof IMPORT_ENTITY_KEYS)[number];

export type ImportSourceMode = 'template' | 'arbitrary';
export type ImportExecutionMode = 'create_only' | 'upsert';

export type ParsedTabularFile = {
  fileName: string;
  format: 'csv' | 'xlsx';
  headerRowIndex: number;
  headers: string[];
  rows: string[][];
  sampleRows: string[][];
};

export type FieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  synonyms?: string[];
  description?: string;
};

export type MappingSuggestion = {
  sourceHeader: string;
  targetField: string | null;
  confidence: number;
  source: 'synonym' | 'ai' | 'manual';
  reason?: string;
};

export type RowIssue = {
  field?: string;
  severity: 'warning' | 'error';
  message: string;
  code: string;
};

export type ValidatedRow<T = Record<string, unknown>> = {
  rowNumber: number;
  original: Record<string, string>;
  normalized: T;
  issues: RowIssue[];
  dedupeKey?: string;
};

export type ImportPreview = {
  entity: ImportEntityKey;
  fileName: string;
  sourceMode: ImportSourceMode;
  aiUsed: boolean;
  mappings: MappingSuggestion[];
  requiredUnmapped: string[];
  rows: ValidatedRow[];
  counts: {
    parsed: number;
    ready: number;
    warnings: number;
    errors: number;
    duplicates: number;
    skipped: number;
  };
};
