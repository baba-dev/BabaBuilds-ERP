export const TAX_IMPORT_TEMPLATE_TYPES = [
  'WITHHOLDING_CERTIFICATES',
  'FOREIGN_TAX_PAID',
  'PRIOR_PERIOD_BALANCES',
] as const;

export type TaxImportTemplateType = (typeof TAX_IMPORT_TEMPLATE_TYPES)[number];

export type TaxTemplateDefinition = {
  type: TaxImportTemplateType;
  label: string;
  columns: string[];
  sampleRow: string[];
};

export const TAX_IMPORT_TEMPLATES: Record<TaxImportTemplateType, TaxTemplateDefinition> = {
  WITHHOLDING_CERTIFICATES: {
    type: 'WITHHOLDING_CERTIFICATES',
    label: 'Withholding certificates',
    columns: ['certificateNumber', 'issuerName', 'issuedOn', 'taxYear', 'taxAmount', 'currency', 'notes'],
    sampleRow: ['WHT-2026-001', 'ABC Payer LLC', '2026-03-31', '2025-2026', '1500.00', 'USD', 'Quarterly withholding'],
  },
  FOREIGN_TAX_PAID: {
    type: 'FOREIGN_TAX_PAID',
    label: 'Foreign tax paid records',
    columns: ['countryCode', 'authorityName', 'paymentDate', 'taxType', 'amountPaid', 'currency', 'referenceNumber', 'notes'],
    sampleRow: ['US', 'IRS', '2026-02-15', 'Corporate income tax', '2200.00', 'USD', 'PAY-10029', 'Federal estimated payment'],
  },
  PRIOR_PERIOD_BALANCES: {
    type: 'PRIOR_PERIOD_BALANCES',
    label: 'Prior-period balances',
    columns: ['period', 'balanceType', 'amount', 'currency', 'jurisdiction', 'referenceId', 'notes'],
    sampleRow: ['2025-Q4', 'CARRY_FORWARD_CREDIT', '875.25', 'USD', 'US-CA', 'BAL-2025Q4-1', 'Carry-forward tax credit'],
  },
};

export function isTaxImportTemplateType(value: string | null | undefined): value is TaxImportTemplateType {
  return Boolean(value && value in TAX_IMPORT_TEMPLATES);
}

export function templateToCsv(def: TaxTemplateDefinition): string {
  const header = def.columns.join(',');
  const sample = def.sampleRow.map((item) => csvEscape(item)).join(',');
  return `${header}\n${sample}\n`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
