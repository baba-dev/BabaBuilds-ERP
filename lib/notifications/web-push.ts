/**
 * Web Push helper — VAPID-based push notifications via `web-push`
 * Uses server-side VAPID keys from environment variables.
 */

import webpush from 'web-push';
import type { PushPayload } from './types';

let vapidConfigured = false;

class PushVapidMissingError extends Error {
  readonly code = 'PUSH_VAPID_MISSING' as const;

  constructor(missingVars: string[]) {
    super(`Missing required VAPID env vars: ${missingVars.join(', ')}`);
    this.name = 'PushVapidMissingError';
  }
}

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    const missingVars: string[] = [];
    if (!vapidPublicKey) missingVars.push('VAPID_PUBLIC_KEY');
    if (!vapidPrivateKey) missingVars.push('VAPID_PRIVATE_KEY');
    throw new PushVapidMissingError(missingVars);
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@bababuilds.com',
    vapidPublicKey,
    vapidPrivateKey,
  );

  vapidConfigured = true;
}

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
  if (process.env.ERP_STAGING_MODE === '1') {
    return { success: false, gone: false };
  }
  try {
    ensureVapidConfigured();

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
    if (err instanceof PushVapidMissingError) {
      console.error(`[web-push] ${err.code}`, err.message);
      return { success: false, gone: false };
    }

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
