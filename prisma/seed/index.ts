import { indiaBaselineRatesAndThresholds } from './baseline-rates-thresholds';
import { indiaCoreForms } from './core-forms';
import { indiaFilingCalendarRules } from './filing-calendar-rules';
import { indiaFilingFrequencies } from './filing-frequencies';
import { evaluateSeedRowReadiness } from './readiness';
import { indiaTaxTypes } from './tax-types';
import type { SeedMetadata } from './types';

export {
  indiaTaxTypes,
  indiaFilingFrequencies,
  indiaCoreForms,
  indiaBaselineRatesAndThresholds,
  indiaFilingCalendarRules,
  evaluateSeedRowReadiness,
};

function toMetadataRows<T extends SeedMetadata>(rows: T[]): SeedMetadata[] {
  return rows.map((row) => ({
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    sourceDocumentRef: row.sourceDocumentRef,
    verificationLevel: row.verificationLevel,
    reviewStatus: row.reviewStatus,
    legalCertaintyRequired: row.legalCertaintyRequired,
  }));
}

export function getIndiaStarterComplianceReadinessSummary() {
  const metadataRows = [
    ...toMetadataRows(indiaTaxTypes),
    ...toMetadataRows(indiaFilingFrequencies),
    ...toMetadataRows(indiaCoreForms),
    ...toMetadataRows(indiaBaselineRatesAndThresholds),
    ...toMetadataRows(indiaFilingCalendarRules),
  ];

  const evaluated = metadataRows.map((row) => evaluateSeedRowReadiness(row));

  const setupBlockingCount = evaluated.filter((item) => item.setupBlocking).length;
  const finalReturnReadinessBlockingCount = evaluated.filter((item) => item.finalReturnReadinessBlocking).length;

  return {
    totalRows: metadataRows.length,
    setupBlockingCount,
    finalReturnReadinessBlockingCount,
  };
}
