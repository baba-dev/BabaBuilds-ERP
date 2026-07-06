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
  'SHOP',
  'MIAB_BILLING',
  'POS',
  'MULTI_COMPANY',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * Modules that are treated as ENABLED unless explicitly disabled by the
 * workspace. These are subsystems that pre-existed the optional-modules
 * abstraction; their "module flag" is layered on top for consistency without
 * regressing the legacy out-of-the-box experience.
 *
 * Other modules in MODULE_KEYS are opt-in (default disabled).
 */
export const DEFAULT_ENABLED_MODULE_KEYS: ReadonlySet<ModuleKey> = new Set<ModuleKey>(['SHOP', 'POS']);

export function isValidModuleKey(key: unknown): key is ModuleKey {
  return typeof key === 'string' && (MODULE_KEYS as readonly string[]).includes(key);
}

export function isDefaultEnabledModule(key: ModuleKey): boolean {
  return DEFAULT_ENABLED_MODULE_KEYS.has(key);
}
