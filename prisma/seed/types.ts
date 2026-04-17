export type VerificationLevel = 'UNVERIFIED' | 'PARTIALLY_VERIFIED' | 'VERIFIED';

export type ReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED';

export type FilingFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'EVENT_BASED';

export type SourceDocumentRef = {
  authority: string;
  documentName: string;
  citation: string;
  url?: string;
};

export type SeedMetadata = {
  effectiveFrom: string; // ISO date string
  effectiveTo?: string;
  sourceDocumentRef: SourceDocumentRef;
  verificationLevel: VerificationLevel;
  reviewStatus: ReviewStatus;
  legalCertaintyRequired: boolean;
};

export type TaxTypeSeedRow = {
  id: string;
  countryCode: 'IN';
  code: string;
  label: string;
  description: string;
} & SeedMetadata;

export type FilingFrequencySeedRow = {
  id: string;
  countryCode: 'IN';
  code: string;
  label: string;
  description: string;
  frequency: FilingFrequency;
} & SeedMetadata;

export type CoreFormSeedRow = {
  id: string;
  countryCode: 'IN';
  formCode: string;
  formName: string;
  appliesTo: string;
  filingFrequencyCode: string;
} & SeedMetadata;

export type BaselineRateThresholdSeedRow = {
  id: string;
  countryCode: 'IN';
  code: string;
  label: string;
  value: string;
  unit: 'PERCENT' | 'INR' | 'TEXT';
  placeholder: boolean;
  notes: string;
} & SeedMetadata;

export type FilingCalendarRuleSeedRow = {
  id: string;
  countryCode: 'IN';
  code: string;
  appliesToFormCode: string;
  description: string;
  dueDayRule: string;
  lateFeeRule: string;
} & SeedMetadata;
