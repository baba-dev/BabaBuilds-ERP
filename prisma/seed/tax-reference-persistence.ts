import type { PrismaClient } from '@prisma/client';
import { indiaBaselineRatesAndThresholds } from './baseline-rates-thresholds';
import { indiaCoreForms } from './core-forms';
import { indiaFilingCalendarRules } from './filing-calendar-rules';
import { indiaFilingFrequencies } from './filing-frequencies';
import { indiaTaxTypes } from './tax-types';

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Persists India starter compliance catalog to TaxReferenceEntry (global rows, workspaceId null).
 * Idempotent on (entryType, countryCode, code).
 */
export async function upsertIndiaTaxReferenceCatalog(prisma: PrismaClient) {
  for (const row of indiaTaxTypes) {
    await prisma.taxReferenceEntry.upsert({
      where: {
        entryType_countryCode_code: {
          entryType: 'TAX_TYPE',
          countryCode: row.countryCode,
          code: row.code,
        },
      },
      create: {
        entryType: 'TAX_TYPE',
        countryCode: row.countryCode,
        code: row.code,
        label: row.label,
        payloadJson: { description: row.description },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
      update: {
        label: row.label,
        payloadJson: { description: row.description },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
    });
  }

  for (const row of indiaFilingFrequencies) {
    await prisma.taxReferenceEntry.upsert({
      where: {
        entryType_countryCode_code: {
          entryType: 'FILING_FREQUENCY',
          countryCode: row.countryCode,
          code: row.code,
        },
      },
      create: {
        entryType: 'FILING_FREQUENCY',
        countryCode: row.countryCode,
        code: row.code,
        label: row.label,
        payloadJson: { description: row.description, frequency: row.frequency },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
      update: {
        label: row.label,
        payloadJson: { description: row.description, frequency: row.frequency },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
    });
  }

  for (const row of indiaCoreForms) {
    await prisma.taxReferenceEntry.upsert({
      where: {
        entryType_countryCode_code: {
          entryType: 'CORE_FORM',
          countryCode: row.countryCode,
          code: row.formCode,
        },
      },
      create: {
        entryType: 'CORE_FORM',
        countryCode: row.countryCode,
        code: row.formCode,
        label: row.formName,
        payloadJson: {
          appliesTo: row.appliesTo,
          filingFrequencyCode: row.filingFrequencyCode,
        },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
      update: {
        label: row.formName,
        payloadJson: {
          appliesTo: row.appliesTo,
          filingFrequencyCode: row.filingFrequencyCode,
        },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
    });
  }

  for (const row of indiaBaselineRatesAndThresholds) {
    await prisma.taxReferenceEntry.upsert({
      where: {
        entryType_countryCode_code: {
          entryType: 'BASELINE_RATE',
          countryCode: row.countryCode,
          code: row.code,
        },
      },
      create: {
        entryType: 'BASELINE_RATE',
        countryCode: row.countryCode,
        code: row.code,
        label: row.label,
        payloadJson: { value: row.value, unit: row.unit, placeholder: row.placeholder, notes: row.notes },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
      update: {
        label: row.label,
        payloadJson: { value: row.value, unit: row.unit, placeholder: row.placeholder, notes: row.notes },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
    });
  }

  for (const row of indiaFilingCalendarRules) {
    await prisma.taxReferenceEntry.upsert({
      where: {
        entryType_countryCode_code: {
          entryType: 'CALENDAR_RULE',
          countryCode: row.countryCode,
          code: row.code,
        },
      },
      create: {
        entryType: 'CALENDAR_RULE',
        countryCode: row.countryCode,
        code: row.code,
        label: row.appliesToFormCode,
        payloadJson: {
          appliesToFormCode: row.appliesToFormCode,
          description: row.description,
          dueDayRule: row.dueDayRule,
          lateFeeRule: row.lateFeeRule,
        },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
      update: {
        label: row.appliesToFormCode,
        payloadJson: {
          appliesToFormCode: row.appliesToFormCode,
          description: row.description,
          dueDayRule: row.dueDayRule,
          lateFeeRule: row.lateFeeRule,
        },
        effectiveFrom: parseIsoDate(row.effectiveFrom),
        effectiveTo: parseIsoDate(row.effectiveTo),
        sourceDocumentRef: row.sourceDocumentRef as object,
        verificationLevel: row.verificationLevel,
        reviewStatus: row.reviewStatus,
        legalCertaintyRequired: row.legalCertaintyRequired,
      },
    });
  }
}
