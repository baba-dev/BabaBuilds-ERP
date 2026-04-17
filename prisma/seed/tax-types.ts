import type { TaxTypeSeedRow } from './types';

export const indiaTaxTypes: TaxTypeSeedRow[] = [
  {
    id: 'in-tax-gst',
    countryCode: 'IN',
    code: 'GST',
    label: 'Goods and Services Tax',
    description: 'Indirect tax framework covering supply of goods and services.',
    effectiveFrom: '2017-07-01',
    sourceDocumentRef: {
      authority: 'CBIC',
      documentName: 'CGST Act, 2017',
      citation: 'Act No. 12 of 2017',
    },
    verificationLevel: 'VERIFIED',
    reviewStatus: 'APPROVED',
    legalCertaintyRequired: true,
  },
  {
    id: 'in-tax-tds',
    countryCode: 'IN',
    code: 'TDS',
    label: 'Tax Deducted at Source',
    description: 'Withholding tax obligations under the Income-tax Act.',
    effectiveFrom: '1962-04-01',
    sourceDocumentRef: {
      authority: 'Income Tax Department',
      documentName: 'Income-tax Act, 1961',
      citation: 'Chapter XVII-B',
    },
    verificationLevel: 'VERIFIED',
    reviewStatus: 'APPROVED',
    legalCertaintyRequired: true,
  },
  {
    id: 'in-tax-prof-tax',
    countryCode: 'IN',
    code: 'PROF_TAX',
    label: 'Professional Tax (State)',
    description: 'State-specific professional tax registration and return obligations.',
    effectiveFrom: '2024-04-01',
    sourceDocumentRef: {
      authority: 'State Commercial Tax Departments',
      documentName: 'State Professional Tax Acts',
      citation: 'State-wise applicability required',
    },
    verificationLevel: 'UNVERIFIED',
    reviewStatus: 'PENDING_REVIEW',
    legalCertaintyRequired: true,
  },
];
