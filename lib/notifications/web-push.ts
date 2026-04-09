/**
 * Web Push helper — VAPID-based push notifications via `web-push`
 * Uses server-side VAPID keys from environment variables.
 */

import webpush from 'web-push';
import type { PushPayload } from './types';

// Configure VAPID once per process.
// Keys live in .env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@bababuilds.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a push notification to a single stored subscription endpoint.
 *
 * Returns true on success, false on gone (410) so the caller can purge
 * the subscription from the database.
 */
export async function sendPushNotification(
  subscription: StoredPushSubscription,
  payload: PushPayload,
): Promise<{ success: boolean; gone: boolean }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag ?? 'bababuilds-erp',
        image: payload.image,
        // Rich action buttons metadata — consumed in sw.ts
        actions: [
          { action: 'open', title: 'Open', icon: '/icons/launchericon-72x72.png' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
        // Visual flair read by the service worker
        icon: '/icons/launchericon-192x192.png',
        badge: '/icons/launchericon-72x72.png',
      }),
      {
        TTL: 24 * 60 * 60, // 24 h — message kept server-side if device is offline
        urgency: 'normal',
      },
    );
    return { success: true, gone: false };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      // Browser unsubscribed — caller should delete from DB
      return { success: false, gone: true };
    }
    console.error('[web-push] send error', err);
    return { success: false, gone: false };
  }
}

/** Fan out to multiple subscriptions; returns endpoints that went 410 for cleanup. */
export async function broadcastPush(
  subscriptions: StoredPushSubscription[],
  payload: PushPayload,
): Promise<string[]> {
  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const { gone } = await sendPushNotification(sub, payload);
      if (gone) staleEndpoints.push(sub.endpoint);
    }),
  );

  return staleEndpoints;
}
