/** Placeholder values the create route used to write for fields nobody filled in. */
const PLACEHOLDERS = new Set(['not provided', 'notprovided', 'hello@example.com', 'n/a', '']);
const isPlaceholder = (v: string | null | undefined) => !v || PLACEHOLDERS.has(v.trim().toLowerCase());

export type SetupIssue = 'ADDRESS' | 'EMAIL' | 'PAN' | 'GSTIN' | 'BANK' | 'SETUP';
export type SetupHealth = { score: number; issues: SetupIssue[] };

export type HealthInput = {
  countryCode: string;
  isSetupComplete: boolean;
  profile: { address?: string | null; email?: string | null; panNumber?: string | null; gstin?: string | null; accountNumber?: string | null; ifscCode?: string | null } | null;
};

/** How ready a company is to issue real invoices: real contact, tax and bank details, and the setup wizard finished. */
export function setupHealth(c: HealthInput): SetupHealth {
  const issues: SetupIssue[] = [];
  const p = c.profile;
  if (!p || isPlaceholder(p.address)) issues.push('ADDRESS');
  if (!p || isPlaceholder(p.email)) issues.push('EMAIL');
  if (!p || isPlaceholder(p.panNumber)) issues.push('PAN');
  if (c.countryCode === 'IN' && (!p || !p.gstin)) issues.push('GSTIN');
  if (!p || isPlaceholder(p.accountNumber) || isPlaceholder(p.ifscCode)) issues.push('BANK');
  if (!c.isSetupComplete) issues.push('SETUP');
  const total = c.countryCode === 'IN' ? 6 : 5;
  const considered = c.countryCode === 'IN' ? issues.length : issues.filter((i) => i !== 'GSTIN').length;
  return { score: Math.round(((total - considered) / total) * 100), issues };
}
