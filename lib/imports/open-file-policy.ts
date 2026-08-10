import type { Permission } from '@/lib/permissions';

export const OPEN_FILE_IMPORT_FLOWS = [
  'expenses',
  'invoices',
  'reconciliation',
  'withholding_certificates',
] as const;

export type ImportFlow = (typeof OPEN_FILE_IMPORT_FLOWS)[number];

/**
 * Exact write-capability required before an uploaded file is read, scanned,
 * persisted, or routed into an operational workflow.
 */
export const OPEN_FILE_FLOW_PERMISSIONS: Readonly<
  Record<ImportFlow, readonly Permission[]>
> = {
  expenses: ['expenses.create'],
  invoices: ['invoices.create'],
  reconciliation: ['reconciliation.import'],
  withholding_certificates: [
    'tax.withholding.ingest',
    'documents.upload',
  ],
};
