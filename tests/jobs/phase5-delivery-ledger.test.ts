import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: { erpJobDelivery: { upsert: m.upsert, updateMany: m.updateMany } },
}));

import {
  deliveryRecipientKey, validateDeliveryIntent, recordDeliveryIntent,
  claimDelivery, markExternalAttempt, markProviderAccepted, markUncertain,
  requeueConfirmedPreSendFailure,
} from '@/lib/jobs/delivery-ledger';

const ws = 'phase5internalws001';
const occurrenceKey = 'report_20261118_0700';
const emailKey = deliveryRecipientKey(' USER@Example.com ', 'EMAIL');
const input = {
  workspaceId: ws, kind: 'notification_email_v1' as const,
  occurrenceKey, channel: 'EMAIL' as const, recipientKey: emailKey,
};

describe('Phase 5 delivery ledger guards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.upsert.mockResolvedValue({ id: 'phase5delivery00001' });
    m.updateMany.mockResolvedValue({ count: 1 });
  });
  it('hashes recipient identifiers deterministically without persisting email addresses', () => {
    expect(emailKey).toMatch(/^[a-f0-9]{64}$/);
    expect(emailKey).toBe(deliveryRecipientKey('user@example.com', 'EMAIL'));
    expect(emailKey).not.toContain('@');
    expect(deliveryRecipientKey('user@example.com', 'PUSH')).not.toBe(emailKey);
  });
  it('rejects wildcard, mismatched channel, arbitrary kind and plaintext recipient', async () => {
    for (const invalid of [
      { ...input, workspaceId: '*' },
      { ...input, occurrenceKey: 'bad' },
      { ...input, channel: 'PUSH' as const },
      { ...input, recipientKey: 'user@example.com' },
      { ...input, kind: 'payment_posting_v1' as typeof input.kind },
    ]) {
      expect(() => validateDeliveryIntent(invalid)).toThrow();
      await expect(recordDeliveryIntent(invalid)).rejects.toThrow();
    }
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it('uses PostgreSQL unique occurrence identity with immutable idempotent upsert', async () => {
    expect(await recordDeliveryIntent(input)).toBe('phase5delivery00001');
    expect(m.upsert).toHaveBeenCalledWith({
      where: { workspaceId_eventKind_occurrenceKey_channel_recipientKey: {
        workspaceId: ws, eventKind: input.kind, occurrenceKey, channel: input.channel,
        recipientKey: emailKey,
      } },
      update: {},
      create: {
        workspaceId: ws, eventKind: input.kind, occurrenceKey, channel: input.channel,
        recipientKey: emailKey,
      },
      select: { id: true },
    });
  });
  it('claims only PENDING, never retries expired CLAIMED or UNCERTAIN automatically', async () => {
    const now = new Date('2026-11-18T12:00:00Z');
    const token = await claimDelivery('phase5delivery00001', now);
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    const filter = m.updateMany.mock.calls[0][0];
    expect(filter.where).toEqual({
      id: 'phase5delivery00001', status: 'PENDING', nextAttemptAt: { lte: now },
    });
    expect(filter.data).toMatchObject({ status: 'CLAIMED', attempts: { increment: 1 } });
    m.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await claimDelivery('phase5delivery00001', now)).toBeNull();
  });
  it('marks external attempt before provider side effect and accepts only claimed attempted row', async () => {
    const id = 'phase5delivery00001', token = 'claim-token';
    expect(await markExternalAttempt(id, token)).toBe(true);
    expect(m.updateMany.mock.calls[0][0].where).toMatchObject({
      id, status: 'CLAIMED', claimToken: token, externalAttemptedAt: null,
    });
    expect(await markProviderAccepted(id, token, 'smtp-receipt-123')).toBe(true);
    const ack = m.updateMany.mock.calls[1][0];
    expect(ack.where).toMatchObject({ status: 'CLAIMED', externalAttemptedAt: { not: null } });
    expect(ack.data).toMatchObject({ status: 'PROVIDER_ACCEPTED' });
    expect(ack.data.providerAckHash).not.toBe('smtp-receipt-123');
  });
  it('holds ambiguous outcomes in UNCERTAIN without a retry side effect', async () => {
    expect(await markUncertain('phase5delivery00001', 'claim-token')).toBe(true);
    const update = m.updateMany.mock.calls[0][0];
    expect(update.where.status).toBe('CLAIMED');
    expect(update.data).toMatchObject({
      status: 'UNCERTAIN', lastErrorCode: 'PROVIDER_OUTCOME_UNCERTAIN',
    });
  });
  it('requeues only confirmed pre-send errors with bounded attempts and no prior I/O', async () => {
    await requeueConfirmedPreSendFailure('phase5delivery00001', 'claim-token');
    const update = m.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      status: 'CLAIMED', externalAttemptedAt: null, attempts: { lt: 5 },
    });
    expect(update.data).toMatchObject({
      status: 'PENDING', lastErrorCode: 'CONFIRMED_PRE_SEND_FAILURE', claimToken: null,
    });
  });
});
