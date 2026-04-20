export const MODULE_KEYS = [
  'WORKFORCE',
  'PAYROLL',
  'DOCUMENTS',
  'REVENUE_PIPELINE',
  'CASH_FLOW',
  'AR_COLLECTIONS',
  'TAX_ADVANCED',
  'REPORTING_CENTER',
  'IMPORT_MANAGER',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isValidModuleKey(key: unknown): key is ModuleKey {
  return typeof key === 'string' && (MODULE_KEYS as readonly string[]).includes(key);
}
