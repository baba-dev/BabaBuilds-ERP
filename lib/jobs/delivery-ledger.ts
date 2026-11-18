import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * Phase 5 external side-effect safety contract.
 * No provider network calls and no Redis writes live in this module.
 * Email/push/report workers must use the delivery ledger before sending.
 * A claimed attempt is NEVER automatically requeued after a possible send.
 */
export const DELIVERY_CHANNELS = ['EMAIL', 'PUSH', 'REPORT_EMAIL'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];
export type ExternalDeliveryKind = 'notification_email_v1' | 'notification_push_v1' | 'scheduled_report_email_v1';
export const EXTERNAL_KINDS: readonly ExternalDeliveryKind[] = [
  'notification_email_v1', 'notification_push_v1', 'scheduled_report_email_v1',
] as const;

type Client = Pick<Prisma.TransactionClient, 'erpJobDelivery'>;
const OPAQUE_ID = /^[A-Za-z0-9_-]{8,100}$/;
const OCCURRENCE = /^[A-Za-z0-9:_-]{8,180}$/;

/** Hash only the recipient identity; never enqueue addresses or subscriptions. */
export function deliveryRecipientKey(identity: string, channel: DeliveryChannel): string {
  if (!DELIVERY_CHANNELS.includes(channel) || !identity || identity.length > 320) {
    throw new Error('INVALID_DELIVERY_RECIPIENT');
  }
  const canonical = channel === 'EMAIL' || channel === 'REPORT_EMAIL'
    ? identity.trim().toLowerCase() : identity.trim();
  if (!canonical || canonical.length > 320) throw new Error('INVALID_DELIVERY_RECIPIENT');
  return createHash('sha256').update('erp:delivery:v1:' + channel + ':' + canonical).digest('hex');
}

export function validateDeliveryIntent(input: {
  workspaceId: string; kind: ExternalDeliveryKind; occurrenceKey: string;
  channel: DeliveryChannel; recipientKey: string;
}): void {
  if (!OPAQUE_ID.test(input.workspaceId) ||
      !EXTERNAL_KINDS.includes(input.kind) ||
      !OCCURRENCE.test(input.occurrenceKey) ||
      !DELIVERY_CHANNELS.includes(input.channel) ||
      !/^[a-f0-9]{64}$/.test(input.recipientKey)) {
    throw new Error('INVALID_DELIVERY_INTENT');
  }
  if ((input.kind === 'notification_email_v1' && input.channel !== 'EMAIL') ||
      (input.kind === 'notification_push_v1' && input.channel !== 'PUSH') ||
      (input.kind === 'scheduled_report_email_v1' && input.channel !== 'REPORT_EMAIL')) {
    throw new Error('INVALID_DELIVERY_CHANNEL');
  }
}

/** Must be invoked within the same PG transaction as the originating event. */
export async function recordDeliveryIntent(
  input: {
    workspaceId: string; kind: ExternalDeliveryKind; occurrenceKey: string;
    channel: DeliveryChannel; recipientKey: string;
  },
  db: Client = prisma,
): Promise<string> {
  validateDeliveryIntent(input);
  const row = await db.erpJobDelivery.upsert({
    where: { workspaceId_eventKind_occurrenceKey_channel_recipientKey: {
      workspaceId: input.workspaceId, eventKind: input.kind,
      occurrenceKey: input.occurrenceKey, channel: input.channel,
      recipientKey: input.recipientKey,
    } },
    update: {},
    create: {
      workspaceId: input.workspaceId, eventKind: input.kind,
      occurrenceKey: input.occurrenceKey, channel: input.channel,
      recipientKey: input.recipientKey,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Reserve only an undispatched PENDING row. A CLAIMED row (even when a lease
 * expires) is never auto-requeued because a provider might have accepted it.
 */
export async function claimDelivery(
  id: string,
  now = new Date(),
  db: Client = prisma,
): Promise<string | null> {
  if (!OPAQUE_ID.test(id) || !Number.isFinite(now.getTime())) {
    throw new Error('INVALID_DELIVERY_CLAIM');
  }
  const token = randomUUID();
  const updated = await db.erpJobDelivery.updateMany({
    where: { id, status: 'PENDING', nextAttemptAt: { lte: now } },
    data: {
      status: 'CLAIMED', claimToken: token,
      leaseExpiresAt: new Date(now.getTime() + 120_000),
      attempts: { increment: 1 },
    },
  });
  return updated.count === 1 ? token : null;
}

/** Called BEFORE initiating provider I/O. Every ambiguous outcome is UNCERTAIN. */
export async function markExternalAttempt(
  id: string, token: string, now = new Date(), db: Client = prisma,
): Promise<boolean> {
  if (!OPAQUE_ID.test(id) || !token || !Number.isFinite(now.getTime())) {
    throw new Error('INVALID_DELIVERY_CLAIM');
  }
  const updated = await db.erpJobDelivery.updateMany({
    where: { id, status: 'CLAIMED', claimToken: token, externalAttemptedAt: null, leaseExpiresAt: { gt: now } },
    data: { externalAttemptedAt: now },
  });
  return updated.count === 1;
}

/** Only an acknowledged provider side effect may become accepted. */
export async function markProviderAccepted(
  id: string, token: string, providerReceipt: string | null,
  now = new Date(), db: Client = prisma,
): Promise<boolean> {
  if (!OPAQUE_ID.test(id) || !token || !Number.isFinite(now.getTime()) ||
      (providerReceipt && providerReceipt.length > 500)) throw new Error('INVALID_DELIVERY_ACK');
  const updated = await db.erpJobDelivery.updateMany({
    where: { id, status: 'CLAIMED', claimToken: token, externalAttemptedAt: { not: null } },
    data: {
      status: 'PROVIDER_ACCEPTED', acceptedAt: now, leaseExpiresAt: null,
      providerAckHash: providerReceipt
        ? createHash('sha256').update(providerReceipt).digest('hex') : null,
    },
  });
  return updated.count === 1;
}

/** A timeout after provider I/O may have delivered: no automatic replay. */
export async function markUncertain(
  id: string, token: string, db: Client = prisma,
): Promise<boolean> {
  if (!OPAQUE_ID.test(id) || !token) throw new Error('INVALID_DELIVERY_CLAIM');
  const updated = await db.erpJobDelivery.updateMany({
    where: { id, status: 'CLAIMED', claimToken: token },
    data: { status: 'UNCERTAIN', leaseExpiresAt: null, lastErrorCode: 'PROVIDER_OUTCOME_UNCERTAIN' },
  });
  return updated.count === 1;
}

/** Only definitely pre-send errors may be retried automatically. */
export async function requeueConfirmedPreSendFailure(
  id: string, token: string, now = new Date(), db: Client = prisma,
): Promise<boolean> {
  if (!OPAQUE_ID.test(id) || !token || !Number.isFinite(now.getTime())) {
    throw new Error('INVALID_DELIVERY_CLAIM');
  }
  const updated = await db.erpJobDelivery.updateMany({
    where: {
      id, status: 'CLAIMED', claimToken: token,
      externalAttemptedAt: null, attempts: { lt: 5 },
    },
    data: {
      status: 'PENDING', claimToken: null, leaseExpiresAt: null,
      nextAttemptAt: new Date(now.getTime() + 60_000),
      lastErrorCode: 'CONFIRMED_PRE_SEND_FAILURE',
    },
  });
  return updated.count === 1;
}
