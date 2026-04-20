import { dmAgencyTemplate } from '@/lib/demo/templates/dm-agency';
import { softwareCompanyTemplate } from '@/lib/demo/templates/software-company';
import { taxAgencyTemplate } from '@/lib/demo/templates/tax-agency';
import { DEMO_TEMPLATE_KEYS, type DemoTemplateDefinition, type DemoTemplateKey } from '@/lib/demo/templates/types';

const TEMPLATE_MAP: Record<DemoTemplateKey, DemoTemplateDefinition> = {
  dm_agency: dmAgencyTemplate,
  software_company: softwareCompanyTemplate,
  tax_agency: taxAgencyTemplate,
};

export const DEFAULT_DEMO_TEMPLATE_KEY: DemoTemplateKey = 'dm_agency';

export function isDemoTemplateKey(value: unknown): value is DemoTemplateKey {
  return typeof value === 'string' && (DEMO_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function getDemoTemplate(key: DemoTemplateKey): DemoTemplateDefinition {
  return TEMPLATE_MAP[key];
}

export const DEMO_TEMPLATES: readonly DemoTemplateDefinition[] = DEMO_TEMPLATE_KEYS.map(
  (key) => TEMPLATE_MAP[key],
);

export function getDemoTemplates(): readonly DemoTemplateDefinition[] {
  return DEMO_TEMPLATES;
}

export { DEMO_TEMPLATE_KEYS };
export type { DemoTemplateDefinition, DemoTemplateKey };
