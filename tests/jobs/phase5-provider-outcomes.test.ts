import { describe, expect, it } from 'vitest';
import {
  classifyPushAcknowledgement, classifySmtpAcknowledgement,
} from '@/lib/jobs/provider-outcomes';

describe('Phase 5 conservative external-provider classifications', () => {
  it('accepts only the intended SMTP recipient, not a general message ID', () => {
    expect(classifySmtpAcknowledgement('a@example.invalid', {
      accepted: ['A@example.invalid'], rejected: [], messageId: 'random-id',
    })).toBe('PROVIDER_ACCEPTED');
    expect(classifySmtpAcknowledgement('b@example.invalid', {
      accepted: ['a@example.invalid'], rejected: [], messageId: 'random-id',
    })).toBe('UNCERTAIN');
    expect(classifySmtpAcknowledgement('a@example.invalid', {
      accepted: ['a@example.invalid'], rejected: ['a@example.invalid'],
    })).toBe('UNCERTAIN');
    expect(classifySmtpAcknowledgement('a@example.invalid', { messageId: 'not-acknowledgement' })).toBe('UNCERTAIN');
    expect(classifySmtpAcknowledgement('a@example.invalid', null)).toBe('UNCERTAIN');
  });
  it('suppresses expired push subscriptions and never blindly retries ambiguous outcomes', () => {
    expect(classifyPushAcknowledgement({ success: true, statusCode: 201 })).toBe('PROVIDER_ACCEPTED');
    expect(classifyPushAcknowledgement({ success: false, statusCode: 410 })).toBe('SUPPRESSED');
    expect(classifyPushAcknowledgement({ success: false, statusCode: 404 })).toBe('SUPPRESSED');
    expect(classifyPushAcknowledgement({ success: false, statusCode: 503 })).toBe('UNCERTAIN');
    expect(classifyPushAcknowledgement({ success: false, statusCode: 429 })).toBe('UNCERTAIN');
    expect(classifyPushAcknowledgement({ success: false })).toBe('UNCERTAIN');
  });
});
