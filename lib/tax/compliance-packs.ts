export type TaxValidationPreset =
  | 'IN_GST_CORE'
  | 'US_SALES_TAX_JURISDICTIONAL'
  | 'SA_ZATCA_EINVOICE'
  | 'BR_NFE_DOCUMENT_SERIES'
  | 'MX_CFDI_40'
  | 'DE_VAT_EU_B2B'
  | 'AE_EINVOICE_PINT_AE'
  | 'IT_SDI_FATTURAPA'
  | 'GB_MTD_VAT_ITSA'
  | 'CA_GST_HST_PST_QST';

export interface TaxJurisdictionRate {
  code: string;
  label: string;
  rate: number;
  level: 'national' | 'state' | 'province' | 'local';
  notes?: string;
}

export interface ComplianceCountryPack {
  countryCode: string;
  countryName: string;
  labels: {
    indirectTaxName: string;
    registrationLabel: string;
    returnLabel: string;
  };
  defaultRate: number;
  allowManualRateCorrection: true;
  validationPreset: TaxValidationPreset;
  providerPriority: string[];
  jurisdictions: TaxJurisdictionRate[];
}

const COUNTRY_PACKS: ComplianceCountryPack[] = [
  {
    countryCode: 'IN',
    countryName: 'India',
    labels: {
      indirectTaxName: 'GST',
      registrationLabel: 'GSTIN',
      returnLabel: 'GSTR Return',
    },
    defaultRate: 0.18,
    allowManualRateCorrection: true,
    validationPreset: 'IN_GST_CORE',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [
      { code: 'IN', label: 'India', rate: 0.18, level: 'national', notes: 'Standard GST fallback.' },
    ],
  },
  {
    countryCode: 'US',
    countryName: 'United States',
    labels: {
      indirectTaxName: 'Sales Tax',
      registrationLabel: 'State Sales Tax Permit',
      returnLabel: 'Sales Tax Return',
    },
    defaultRate: 0,
    allowManualRateCorrection: true,
    validationPreset: 'US_SALES_TAX_JURISDICTIONAL',
    providerPriority: ['manual_override', 'workspace_override', 'stripe_tax', 'fallback'],
    jurisdictions: [
      { code: 'US', label: 'United States baseline', rate: 0, level: 'national', notes: 'No federal sales tax.' },
      { code: 'US-CA', label: 'California', rate: 0.0725, level: 'state' },
      { code: 'US-NY', label: 'New York', rate: 0.04, level: 'state' },
      { code: 'US-TX', label: 'Texas', rate: 0.0625, level: 'state' },
      { code: 'US-FL', label: 'Florida', rate: 0.06, level: 'state' },
      { code: 'US-LOCAL-DEFAULT', label: 'Typical local add-on', rate: 0.02, level: 'local', notes: 'Local rates vary by jurisdiction.' },
    ],
  },
  {
    countryCode: 'SA',
    countryName: 'Saudi Arabia',
    labels: {
      indirectTaxName: 'VAT',
      registrationLabel: 'VAT Registration Number',
      returnLabel: 'VAT Return',
    },
    defaultRate: 0.15,
    allowManualRateCorrection: true,
    validationPreset: 'SA_ZATCA_EINVOICE',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [{ code: 'SA', label: 'Saudi Arabia', rate: 0.15, level: 'national' }],
  },
  {
    countryCode: 'BR',
    countryName: 'Brazil',
    labels: {
      indirectTaxName: 'IVA / ICMS-ISS-PIS-COFINS',
      registrationLabel: 'CNPJ + State Registration',
      returnLabel: 'NF-e / Tax Return Bundle',
    },
    defaultRate: 0.17,
    allowManualRateCorrection: true,
    validationPreset: 'BR_NFE_DOCUMENT_SERIES',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [
      { code: 'BR', label: 'Brazil baseline', rate: 0.17, level: 'national', notes: 'Transitional blended fallback.' },
      { code: 'BR-SP', label: 'São Paulo (indicative ICMS fallback)', rate: 0.18, level: 'state' },
      { code: 'BR-RJ', label: 'Rio de Janeiro (indicative ICMS fallback)', rate: 0.2, level: 'state' },
    ],
  },
  {
    countryCode: 'MX',
    countryName: 'Mexico',
    labels: {
      indirectTaxName: 'IVA',
      registrationLabel: 'RFC',
      returnLabel: 'Declaración de IVA / CFDI',
    },
    defaultRate: 0.16,
    allowManualRateCorrection: true,
    validationPreset: 'MX_CFDI_40',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [{ code: 'MX', label: 'Mexico', rate: 0.16, level: 'national' }],
  },
  {
    countryCode: 'DE',
    countryName: 'Germany',
    labels: {
      indirectTaxName: 'Umsatzsteuer (VAT)',
      registrationLabel: 'USt-IdNr',
      returnLabel: 'USt-Voranmeldung',
    },
    defaultRate: 0.19,
    allowManualRateCorrection: true,
    validationPreset: 'DE_VAT_EU_B2B',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [{ code: 'DE', label: 'Germany', rate: 0.19, level: 'national' }],
  },
  {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    labels: {
      indirectTaxName: 'VAT',
      registrationLabel: 'TRN',
      returnLabel: 'VAT Return / eInvoice batch',
    },
    defaultRate: 0.05,
    allowManualRateCorrection: true,
    validationPreset: 'AE_EINVOICE_PINT_AE',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [{ code: 'AE', label: 'UAE', rate: 0.05, level: 'national' }],
  },
  {
    countryCode: 'IT',
    countryName: 'Italy',
    labels: {
      indirectTaxName: 'IVA',
      registrationLabel: 'Partita IVA',
      returnLabel: 'Liquidazione IVA / SDI',
    },
    defaultRate: 0.22,
    allowManualRateCorrection: true,
    validationPreset: 'IT_SDI_FATTURAPA',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [{ code: 'IT', label: 'Italy', rate: 0.22, level: 'national' }],
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    labels: {
      indirectTaxName: 'VAT',
      registrationLabel: 'VAT Registration Number',
      returnLabel: 'VAT Return / MTD submission',
    },
    defaultRate: 0.2,
    allowManualRateCorrection: true,
    validationPreset: 'GB_MTD_VAT_ITSA',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [{ code: 'GB', label: 'United Kingdom', rate: 0.2, level: 'national' }],
  },
  {
    countryCode: 'CA',
    countryName: 'Canada',
    labels: {
      indirectTaxName: 'GST/HST/PST/QST',
      registrationLabel: 'Business Number (BN)',
      returnLabel: 'GST/HST Return',
    },
    defaultRate: 0.05,
    allowManualRateCorrection: true,
    validationPreset: 'CA_GST_HST_PST_QST',
    providerPriority: ['manual_override', 'workspace_override', 'fallback'],
    jurisdictions: [
      { code: 'CA', label: 'Canada GST baseline', rate: 0.05, level: 'national' },
      { code: 'CA-ON', label: 'Ontario HST', rate: 0.13, level: 'province' },
      { code: 'CA-BC', label: 'British Columbia GST+PST', rate: 0.12, level: 'province' },
      { code: 'CA-QC', label: 'Quebec GST+QST', rate: 0.14975, level: 'province' },
      { code: 'CA-AB', label: 'Alberta GST', rate: 0.05, level: 'province' },
    ],
  },
];

const packsByCountry = COUNTRY_PACKS.reduce<Record<string, ComplianceCountryPack>>((acc, pack) => {
  acc[pack.countryCode] = pack;
  return acc;
}, {});

function normalize(value?: string | null): string {
  return (value ?? '').trim().toUpperCase();
}

export function getSupportedCompliancePacks(): ComplianceCountryPack[] {
  return COUNTRY_PACKS;
}

export function getCompliancePack(countryCode?: string | null): ComplianceCountryPack | null {
  const key = normalize(countryCode);
  if (!key) return null;
  return packsByCountry[key] ?? null;
}

export function resolveJurisdictionalRate(input: {
  countryCode?: string | null;
  regionCode?: string | null;
  includeUSLocalDefault?: boolean;
}): { rate: number; source: 'country_default' | 'jurisdiction_default'; jurisdictionCode: string | null } {
  const countryCode = normalize(input.countryCode);
  const regionCode = normalize(input.regionCode);
  const pack = getCompliancePack(countryCode);

  if (!pack) {
    return { rate: 0, source: 'country_default', jurisdictionCode: null };
  }

  if (regionCode) {
    const regionRule = pack.jurisdictions.find((item) => item.code === regionCode);
    if (regionRule) {
      let resolvedRate = regionRule.rate;
      if (countryCode === 'US' && input.includeUSLocalDefault) {
        const local = pack.jurisdictions.find((item) => item.code === 'US-LOCAL-DEFAULT');
        resolvedRate += local?.rate ?? 0;
      }
      return {
        rate: Number(resolvedRate.toFixed(6)),
        source: 'jurisdiction_default',
        jurisdictionCode: regionRule.code,
      };
    }
  }

  const national = pack.jurisdictions.find((item) => item.code === countryCode) ?? pack.jurisdictions[0];
  return {
    rate: national?.rate ?? pack.defaultRate,
    source: 'country_default',
    jurisdictionCode: national?.code ?? null,
  };
}

export const COMPLIANCE_PACK_DEFAULT_RATES: Record<string, number> = COUNTRY_PACKS.reduce<Record<string, number>>((acc, pack) => {
  acc[pack.countryCode] = pack.defaultRate;
  return acc;
}, {});
