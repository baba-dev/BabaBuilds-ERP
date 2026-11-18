import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  deliveryRecipientKey, recordDeliveryIntent, claimDelivery,
  markExternalAttempt, markProviderAccepted, markUncertain,
  requeueConfirmedPreSendFailure,
} from '@/lib/jobs/delivery-ledger';

const suite = process.env.CI_REDIS_JOBS_TESTS === '1' ? describe : describe.skip;

suite('Phase 5 real PostgreSQL17 delivery safety', () => {
  let workspaceId: string | null = null;
  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => null);
  });

  it('idempotent concurrent intent creation, one claimant and no blind ambiguous replay', async () => {
    const ws = await prisma.workspace.create({ data: { name: 'Phase5 CI delivery ledger' } });
    workspaceId = ws.id;
    const input = {
      workspaceId: ws.id,
      kind: 'notification_email_v1' as const,
      occurrenceKey: 'client_012345678901_20261118',
      channel: 'EMAIL' as const,
      recipientKey: deliveryRecipientKey('ci-recipient@example.invalid', 'EMAIL'),
    };
    const ids = await Promise.all(Array.from({ length: 8 }, () => recordDeliveryIntent(input)));
    expect(new Set(ids).size).toBe(1);
    const rows = await prisma.erpJobDelivery.findMany({ where: { workspaceId: ws.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');

    const claimed = await Promise.all(Array.from({ length: 8 }, () => claimDelivery(ids[0])));
    const tokens = claimed.filter((v): v is string => typeof v === 'string');
    expect(tokens).toHaveLength(1);
    expect(await markExternalAttempt(ids[0], tokens[0])).toBe(true);
    expect(await markUncertain(ids[0], tokens[0])).toBe(true);
    expect(await requeueConfirmedPreSendFailure(ids[0], tokens[0])).toBe(false);
    expect(await claimDelivery(ids[0])).toBeNull();
    expect((await prisma.erpJobDelivery.findUniqueOrThrow({ where: { id: ids[0] } })).status).toBe('UNCERTAIN');

    const other = await recordDeliveryIntent({
      ...input, occurrenceKey: 'client_012345678901_20261119',
    });
    expect(other).not.toBe(ids[0]);
    const acceptedToken = await claimDelivery(other);
    expect(acceptedToken).toBeTruthy();
    expect(await markExternalAttempt(other, acceptedToken!)).toBe(true);
    expect(await markProviderAccepted(other, acceptedToken!, 'smtp-ack')).toBe(true);
    const accepted = await prisma.erpJobDelivery.findUniqueOrThrow({ where: { id: other } });
    expect(accepted.status).toBe('PROVIDER_ACCEPTED');
    expect(accepted.providerAckHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await claimDelivery(other)).toBeNull();
  }, 30000);
});
