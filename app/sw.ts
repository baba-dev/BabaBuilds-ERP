/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import { 
  ExpirationPlugin, 
  StaleWhileRevalidate, 
  type PrecacheEntry, 
  Serwist, 
  type SerwistGlobalConfig 
} from 'serwist';
import { normalizeLaunchDestination } from '@/lib/launch-routing';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }

}

declare const self: ServiceWorkerGlobalScope;

type SyncEventLike = ExtendableEvent & {
  tag: string;
};

type PeriodicSyncEventLike = ExtendableEvent & {
  tag: string;
};

const OFFLINE_FALLBACK_PAGE = '/offline';

const dashboardRuntimeCaching = [
  {
    matcher: ({ sameOrigin, url, request }: { sameOrigin: boolean; url: URL; request: Request }) =>
      sameOrigin &&
      request.method === 'GET' &&
      ['/dashboard', '/invoice', '/expenses', '/clients', '/proposals', '/tax'].some((route) =>
        url.pathname === route || url.pathname.startsWith(`${route}/`),
      ),
    handler: new StaleWhileRevalidate({
      cacheName: 'erp-dashboard-pages-cache',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 40,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          maxAgeFrom: 'last-used',
        }),
      ],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...dashboardRuntimeCaching, ...defaultCache],
});

async function notifyClients(message: Record<string, string>) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  clients.forEach((client) => {
    client.postMessage(message);
  });
}

async function revalidateCorePages() {
  const urls = ['/dashboard', '/invoice', '/clients', '/proposals', '/expenses', '/tax'];

  await Promise.all(
    urls.map(async (url) => {
      try {
        await fetch(url, { cache: 'reload' });
      } catch {
        // Service workers can be offline / backgrounded. Avoid noisy logs/UX.
      }
    }),
  );

  await notifyClients({ type: 'periodic-refresh-complete' });
}

serwist.addEventListeners();

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }

        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch {
        const cachedPage = await caches.match(event.request);
        if (cachedPage) {
          return cachedPage;
        }

        const offlinePage = await caches.match(OFFLINE_FALLBACK_PAGE);
        if (offlinePage) {
          return offlinePage;
        }

        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data?.json() as {
        title?: string;
        body?: string;
        url?: string;
        tag?: string;
        image?: string;
        actions?: Array<{ action: string; title: string; icon?: string }>;
      };
    } catch {
      return {
        title: 'BabaBuilds ERP',
        body: event.data?.text() || 'You have a new update.',
      };
    }
  })();

  const title   = payload.title || 'BabaBuilds ERP';
  const body    = payload.body  || 'You have a new update.';
  const url     = payload.url   || '/dashboard';
  const tag     = payload.tag   || 'bababuilds-notification';

  // Determine urgency-based vibration pattern
  const isUrgent =
    tag === 'payment_reminder' || tag === 'deadline_alert' || tag === 'tax_alert';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // App icon — high-res for Android adaptive icons
      icon:   '/icons/launchericon-192x192.png',
      // Small monochrome badge (shown in Android status bar)
      badge:  '/icons/launchericon-72x72.png',
      // Hero image for rich notifications (Android 12+)
      ...(payload.image ? { image: payload.image } : {}),
      // Deduplication tag — new notification replaces old with same tag
      tag,
      // Keep notification visible until user interacts (critical alerts)
      requireInteraction: isUrgent,
      // Haptic feedback pattern (Android)
      vibrate: isUrgent ? [200, 100, 200, 100, 400] : [200, 100, 200],
      // Silent = no system sound; remove to use system default
      silent: false,
      // Deep-link data passed to notificationclick
      data: { url },
      // Action buttons shown on Android (iOS ignores these)
      actions: payload.actions ?? [
        { action: 'open',    title: 'Open',    icon: '/icons/launchericon-72x72.png' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    } as NotificationOptions),
  );
});


self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawDestination = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/dashboard';
  const destination = normalizeLaunchDestination(rawDestination);

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existingClient = clients.find((client) => client.url.includes(self.location.origin));

      if (existingClient) {
        existingClient.navigate(destination);
        return existingClient.focus();
      }

      return self.clients.openWindow(destination);
    })(),
  );
});

self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as SyncEventLike;
  if (syncEvent.tag !== 'sync-pending-requests') {
    return;
  }

  syncEvent.waitUntil(
    (async () => {
      await notifyClients({ type: 'background-sync-fired' });
      await notifyClients({ type: 'offline-sync-queue-updated' });
    })(),
  );
});

self.addEventListener('periodicsync', (event: Event) => {
  const periodicEvent = event as PeriodicSyncEventLike;
  if (periodicEvent.tag !== 'refresh-core-data') {
    return;
  }

  periodicEvent.waitUntil(revalidateCorePages());
});
