'use client';

/**
 * useNotifications — global hook for the notification system
 *
 * Three responsibilities:
 *  1. Poll /api/notifications/unread at a smart interval (pauses when user is idle)
 *  2. Fire Sonner toasts for newly arrived unread notifications
 *  3. Manage + expose the notification list and Bell badge count
 *  4. Register the browser for Web Push if permission is granted
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { InAppNotification } from '@prisma/client';

// ── Constants ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_ACTIVE_MS  = 30_000;  // 30 s when user is active
const POLL_INTERVAL_IDLE_MS    = 120_000; // 2 min when idle
const IDLE_THRESHOLD_MS        = 60_000;  // 60 s of no interaction = idle

const TOAST_ICON: Record<string, string> = {
  INVOICE_GENERATED: '🧾',
  INVOICE_PAID:      '✅',
  PAYMENT_REMINDER:  '⏰',
  CLIENT_ADDED:      '🤝',
  PROPOSAL_CREATED:  '📄',
  PROPOSAL_VIEWED:   '👀',
  SERVICE_CREATED:   '🔧',
  RENEWAL_ALERT:     '🔄',
  BILLING_FAILED:    '⚠️',
  DEADLINE_ALERT:    '⚠️',
  TAX_ALERT:         '🏛️',
  SHOP_ORDER_CREATED: '🛒',
  SHOP_ORDER_UPDATED: '📝',
  SHOP_ORDER_DELETED: '🗑️',
  SHOP_ORDER_STATUS_CHANGED: '📦',
  LEAVE_REQUEST_SUBMITTED: '🗓️',
  LEAVE_APPROVED: '✅',
  LEAVE_REJECTED: '❌',
};

export interface UseNotificationsReturn {
  notifications: InAppNotification[];
  unreadCount: number;
  markRead: (ids?: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  isLoading: boolean;
  requestPushPermission: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [isLoading, setIsLoading]         = useState(false);

  // Track latest-seen createdAt so we only toast newly arrived items
  const lastSeenAtRef    = useRef<string | null>(null);
  const hasHydratedRef   = useRef(false);
  const lastActivityRef  = useRef<number>(Date.now());
  const intervalRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef     = useRef(true);

  // ── User activeness tracking ──────────────────────────────────────────────
  useEffect(() => {
    const refresh = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', refresh, { passive: true });
    window.addEventListener('keydown',   refresh, { passive: true });
    window.addEventListener('touchstart',refresh, { passive: true });
    window.addEventListener('scroll',    refresh, { passive: true });
    return () => {
      window.removeEventListener('mousemove', refresh);
      window.removeEventListener('keydown',   refresh);
      window.removeEventListener('touchstart',refresh);
      window.removeEventListener('scroll',    refresh);
    };
  }, []);

  // ── Poll ─────────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (lastSeenAtRef.current) params.set('since', lastSeenAtRef.current);

      const res = await fetch(`/api/notifications/unread?${params}`);
      if (!res.ok) return;

      const json = await res.json() as { notifications: InAppNotification[]; totalUnread: number };
      if (!isMountedRef.current) return;

      const newItems: InAppNotification[] = json.notifications;
      setUnreadCount(json.totalUnread);

      if (newItems.length > 0) {
        // Update the cursor
        lastSeenAtRef.current = newItems[0].createdAt as unknown as string;

        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const fresh = newItems.filter((n) => !existingIds.has(n.id));
          if (fresh.length === 0) return prev;

          // Toast only after first hydration to avoid replaying historical backlog.
          if (hasHydratedRef.current) {
            fresh.slice().reverse().forEach((n) => {
              const icon = TOAST_ICON[n.eventType] ?? '🔔';
              toast(n.title, {
                description: n.body,
                icon,
                duration: 6000,
                action: n.actionUrl
                  ? {
                      label: 'View',
                      onClick: () => { window.location.href = n.actionUrl!; },
                    }
                  : undefined,
              });
            });
          }

          return [...fresh, ...prev].slice(0, 50);
        });
      }
      hasHydratedRef.current = true;
    } catch {
      // Silently swallow network errors during poll
    }
  }, []);

  // ── Smart interval (active vs idle) ──────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    // Initial load
    setIsLoading(true);
    poll().finally(() => { if (isMountedRef.current) setIsLoading(false); });

    const schedule = () => {
      if (!isMountedRef.current) return;
      const isIdle = Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS;
      const delay  = isIdle ? POLL_INTERVAL_IDLE_MS : POLL_INTERVAL_ACTIVE_MS;
      intervalRef.current = setTimeout(async () => {
        await poll();
        schedule();
      }, delay);
    };

    schedule();

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [poll]);

  // ── Mark Read ─────────────────────────────────────────────────────────────
  const markRead = useCallback(async (ids?: string[]) => {
    if (!ids || ids.length === 0) return;
    await fetch('/api/notifications/mark-read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    setUnreadCount((c) => Math.max(0, c - ids.length));
  }, []);

  const markAllRead = useCallback(async () => {
    await fetch('/api/notifications/mark-read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // ── Web Push Registration ─────────────────────────────────────────────────
  const requestPushPermission = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    try {
      // Get VAPID public key
      const keyRes = await fetch('/api/notifications/push/subscribe');
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      if (!publicKey) return;

      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      if (existing) {
        // Already subscribed — ensure it's registered in DB
        await registerSubscription(existing);
        return;
      }

      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      await registerSubscription(sub);
    } catch (err) {
      console.error('[push] subscription failed:', err);
    }
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, isLoading, requestPushPermission };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function registerSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? '',
        auth:   json.keys?.auth   ?? '',
      },
      userAgent: navigator.userAgent,
    }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
