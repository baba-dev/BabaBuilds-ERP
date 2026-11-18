import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { deliveryRecipientKey, recordDeliveryIntent } from '@/lib/jobs/delivery-ledger';
import { notificationSourceOccurrence, type NotificationRoute } from '@/lib/jobs/notification-routing';
import type { NotificationEventType, PushPayload } from '@/lib/notifications/types';

type Recipient = {
  user: {
    id: string;
    email: string | null;
    notifyEmail: boolean;
    transactionalAlerts: boolean;
    notifyPush: boolean;
  };
};

/**
 * Commit the PostgreSQL source and every per-recipient delivery in ONE transaction.
 * A replay with the same stable source occurrence is a no-op, even if preferences
 * or subscriptions have changed. Side effects must NEVER fall back to legacy after
 * an ambiguous database commit.
 *
 * Redis sees ONLY an opaque delivery ID, never this stored message or credentials.
 */
export async function recordQueuedNotification(
  input: {
    workspaceId: string;
    occurrenceKey: string;
    event: NotificationEventType;
    users: Recipient[];
    route: NotificationRoute;
    email: { subject: string; html: string; text: string };
    push: PushPayload;
  },
): Promise<boolean> {
  const { workspaceId, users, route } = input;
  if (!route.email && !route.push) return false;
  const occurrence = notificationSourceOccurrence(input.event, input.occurrenceKey);
  if (input.email.html.length > 100_000 || input.email.subject.length > 500 ||
      input.push.body.length > 4_000 || users.length > 500) {
    throw new Error('NOTIFICATION_SOURCE_LIMIT_EXCEEDED');
  }

  // Load only opaque subscription IDs; no endpoint/key enters the outbox/Redis.
  const pushUserIds = route.push
    ? users.filter((rec) => rec.user.notifyPush).map((rec) => rec.user.id)
    : [];
  const subscriptions = pushUserIds.length
    ? await prisma.pushSubscription.findMany({
        where: { userId: { in: pushUserIds } },
        select: { id: true, userId: true },
      })
    : [];

  return prisma.$transaction(async (tx) => {
    // This upsert returns the existing source on duplicate events. No new
    // recipients may be appended to an occurrence already committed.
    const candidateId = randomUUID();
    const source = await tx.erpJobOutbox.upsert({
      where: {
        workspaceId_kind_dedupeKey: {
          workspaceId, kind: 'notification_delivery_source_v1', dedupeKey: occurrence,
        },
      },
      update: {},
      create: {
        id: candidateId, workspaceId,
        kind: 'notification_delivery_source_v1', dedupeKey: occurrence,
        status: 'DONE', processedAt: new Date(),
        payloadJson: {
          schema: 1,
          event: input.event,
          email: {
            subject: input.email.subject,
            html: input.email.html,
            text: input.email.text,
          },
          push: {
            title: input.push.title, body: input.push.body,
            url: input.push.url, tag: input.push.tag ?? input.event.toLowerCase(),
          },
        },
      },
      select: { id: true },
    });
    if (source.id !== candidateId) return false;

    if (route.email) {
      for (const { user } of users) {
        if (!user.notifyEmail || !user.transactionalAlerts || !user.email) continue;
        await recordDeliveryIntent({
          workspaceId, kind: 'notification_email_v1',
          occurrenceKey: occurrence, channel: 'EMAIL',
          recipientKey: deliveryRecipientKey(user.id, 'EMAIL'),
        }, tx);
      }
    }
    if (route.push) {
      for (const sub of subscriptions) {
        await recordDeliveryIntent({
          workspaceId, kind: 'notification_push_v1',
          occurrenceKey: occurrence, channel: 'PUSH',
          recipientKey: deliveryRecipientKey(sub.id, 'PUSH'),
        }, tx);
      }
    }
    return true;
  }, { timeout: 12_000 });
}
