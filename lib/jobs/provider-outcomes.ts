/**
 * Conservative external-provider acknowledgement interpretation.
 * These functions do NOT send anything. The worker must transition the
 * delivery ledger through CLAIMED/attempted before invoking a provider.
 *
 * SMTP Message-ID is not an idempotency key. An exception after SMTP DATA
 * may mean "accepted but response lost", so unknown outcomes are UNCERTAIN.
 */
export type ProviderOutcome = 'PROVIDER_ACCEPTED' | 'SUPPRESSED' | 'UNCERTAIN';

export function classifySmtpAcknowledgement(
  target: string,
  result: { accepted?: unknown; rejected?: unknown; pending?: unknown; messageId?: unknown } | null,
): ProviderOutcome {
  if (!result || !target || typeof target !== 'string') return 'UNCERTAIN';
  const normalize = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : null;
  const accepted = Array.isArray(result.accepted)
    ? result.accepted.map(normalize).filter(Boolean) : [];
  const rejected = Array.isArray(result.rejected)
    ? result.rejected.map(normalize).filter(Boolean) : [];
  const recipient = normalize(target);
  // A provider may return partial acceptance. Never mark a recipient accepted
  // merely because *someone else* was accepted or a Message-ID was generated.
  if (recipient && accepted.includes(recipient) && !rejected.includes(recipient)) return 'PROVIDER_ACCEPTED';
  return 'UNCERTAIN';
}

export function classifyPushAcknowledgement(input: {
  success: boolean;
  statusCode?: number | null;
  gone?: boolean;
}): ProviderOutcome {
  if (input.gone === true || input.statusCode === 404 || input.statusCode === 410) return 'SUPPRESSED';
  if (input.success === true && (input.statusCode == null || input.statusCode >= 200 && input.statusCode < 300)) {
    return 'PROVIDER_ACCEPTED';
  }
  // Timeout, VAPID config errors, 429 and 5xx cannot be promoted to accepted
  // or replayed blindly. A separate pre-send validator controls safe retries.
  return 'UNCERTAIN';
}
