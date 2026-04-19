import 'server-only';

export type WorkspacePlanTier = 'FREE' | 'PRO' | 'TEAM';

export const MiB = 1024 * 1024;

export const DOCUMENT_STORAGE_CAP_BYTES: Record<WorkspacePlanTier, number> = {
  FREE: 10 * MiB,
  PRO: 20 * MiB,
  TEAM: 50 * MiB,
};

export type DocumentCategory =
  | 'EXPENSE_RECEIPT'
  | 'VENDOR_BILL'
  | 'INVOICE_ATTACHMENT'
  | 'BANK_STATEMENT'
  | 'TAX_FILING'
  | 'COMPLIANCE_DOCUMENT'
  | 'BUSINESS_REGISTRATION'
  | 'CONTRACT'
  | 'PERSONAL_USER_DOCUMENT'
  | 'GENERAL_DOCUMENT';

export type DocumentScope =
  | 'WORKSPACE_BUSINESS'
  | 'ACCOUNTING'
  | 'COMPLIANCE'
  | 'PERSONAL_USER'
  | 'GENERAL_ATTACHMENT';

export type DocumentMime =
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'image/jpg'
  | 'image/webp'
  | 'text/csv'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const DOCUMENT_ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  // Optional: future statement imports
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const DOCUMENT_STORAGE_WARNING_THRESHOLDS = {
  warn: 0.7,
  strongWarn: 0.9,
  hardStop: 1.0,
} as const;

export type DocumentUploadCategory = 'image' | 'pdf' | 'spreadsheet_or_text';

export const DOCUMENT_PER_FILE_CAP_BYTES: Record<DocumentUploadCategory, number> = {
  image: 5 * MiB,
  pdf: 10 * MiB,
  spreadsheet_or_text: 5 * MiB,
};

export function normalizePlanTier(planTier: string | null | undefined): WorkspacePlanTier {
  const t = String(planTier ?? 'FREE').toUpperCase();
  if (t === 'PRO') return 'PRO';
  if (t === 'TEAM' || t === 'ENTERPRISE') return 'TEAM';
  return 'FREE';
}

export function getWorkspaceDocumentStorageCapBytes(planTier: string | null | undefined): number {
  const tier = normalizePlanTier(planTier);
  return DOCUMENT_STORAGE_CAP_BYTES[tier];
}

export function getUploadCategoryForMime(mimeType: string): DocumentUploadCategory | null {
  const m = String(mimeType || '').toLowerCase();
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m === 'text/csv' || m.includes('spreadsheet') || m.includes('excel')) return 'spreadsheet_or_text';
  return null;
}

export function getPerFileCapBytesForMime(mimeType: string): number | null {
  const category = getUploadCategoryForMime(mimeType);
  if (!category) return null;
  return DOCUMENT_PER_FILE_CAP_BYTES[category];
}

export function isAllowedDocumentMime(mimeType: string): boolean {
  return DOCUMENT_ALLOWED_MIME_TYPES.has(String(mimeType || '').toLowerCase());
}

export function classifyMimeCategory(mimeType: string): DocumentUploadCategory | 'unknown' {
  return getUploadCategoryForMime(mimeType) ?? 'unknown';
}

export function maxPerFileBytesForMime(mimeType: string): number {
  return getPerFileCapBytesForMime(mimeType) ?? (5 * MiB);
}

export function prettyBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v >= 10 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

