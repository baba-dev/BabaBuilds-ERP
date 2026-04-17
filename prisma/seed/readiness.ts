import type { ReviewStatus, SeedMetadata, VerificationLevel } from './types';

export type SeedReadinessOutcome = {
  setupBlocking: boolean;
  finalReturnReadinessBlocking: boolean;
  reason: string;
};

const VERIFIED_LEVELS: VerificationLevel[] = ['VERIFIED'];
const APPROVED_REVIEW: ReviewStatus[] = ['APPROVED'];

export function evaluateSeedRowReadiness(metadata: SeedMetadata): SeedReadinessOutcome {
  const hasLegalCertainty = metadata.legalCertaintyRequired;
  const verifiedForLegalUse =
    VERIFIED_LEVELS.includes(metadata.verificationLevel) && APPROVED_REVIEW.includes(metadata.reviewStatus);

  // Unverified content must remain non-blocking for setup.
  const setupBlocking = false;

  // But where legal certainty is required, unverified rows block final return readiness.
  const finalReturnReadinessBlocking = hasLegalCertainty && !verifiedForLegalUse;

  const reason = finalReturnReadinessBlocking
    ? 'Requires verified + approved legal basis before final return readiness can be marked complete.'
    : 'Row is acceptable for setup and return-readiness use under current verification metadata.';

  return {
    setupBlocking,
    finalReturnReadinessBlocking,
    reason,
  };
}
