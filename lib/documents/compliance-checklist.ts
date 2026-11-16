export type RequirementKey = 'PAN' | 'GST' | 'UDYAM' | 'REGISTRATION' | 'BANK' | 'FILING';
export type ChecklistDoc = { id: string; title: string; category: string };
export type ChecklistItem = { key: RequirementKey; documents: ChecklistDoc[] };

type Rule = { key: RequirementKey; when: (p: { countryCode: string; gstin: boolean; udyam: boolean }) => boolean; categories: string[]; keywords: string[] };

const RULES: Rule[] = [
  { key: 'PAN', when: (p) => p.countryCode === 'IN', categories: ['BUSINESS_REGISTRATION', 'COMPLIANCE_DOCUMENT'], keywords: ['pan'] },
  { key: 'GST', when: (p) => p.countryCode === 'IN' && p.gstin, categories: ['BUSINESS_REGISTRATION', 'COMPLIANCE_DOCUMENT'], keywords: ['gst'] },
  { key: 'UDYAM', when: (p) => p.countryCode === 'IN' && p.udyam, categories: ['BUSINESS_REGISTRATION', 'COMPLIANCE_DOCUMENT'], keywords: ['udyam', 'msme'] },
  { key: 'REGISTRATION', when: () => true, categories: ['BUSINESS_REGISTRATION'], keywords: ['incorporation', 'registration', 'moa', 'partnership', 'certificate'] },
  { key: 'BANK', when: () => true, categories: ['BANK_STATEMENT'], keywords: ['cheque', 'bank'] },
  { key: 'FILING', when: () => true, categories: ['TAX_FILING'], keywords: ['itr', 'gstr', 'return', 'acknowledg'] },
];

const words = (title: string) => title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Which evidence a business is expected to keep on file, and which uploaded documents cover each item.
 * Registration-type items (PAN, GST, Udyam, registration) match by category and a keyword in the title;
 * bank and filing items match by their own category alone.
 */
export function buildChecklist(profile: { countryCode: string; gstin: boolean; udyam: boolean }, docs: ChecklistDoc[]): ChecklistItem[] {
  return RULES.filter((r) => r.when(profile)).map((r) => ({
    key: r.key,
    documents: docs.filter((d) => {
      if (!r.categories.includes(d.category)) return false;
      if (r.key === 'BANK' || r.key === 'FILING') return true;
      const w = words(d.title);
      return r.keywords.some((k) => w.includes(k) || w.some((x) => x.startsWith(k)));
    }),
  }));
}
