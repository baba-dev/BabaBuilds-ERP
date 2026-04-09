/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import { 
  ExpirationPlugin, 
  NetworkFirst, 
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
      ['/api/dashboard', '/api/invoices', '/api/expenses', '/api/clients'].some((endpoint) =>
        url.pathname.startsWith(endpoint),
      ),
    handler: new NetworkFirst({
      cacheName: 'erp-read-api-cache',
      networkTimeoutSeconds: 6,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 12 * 60 * 60,
          maxAgeFrom: 'last-used',
        }),
      ],
    }),
  },
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
        // Silently ignore failed refresh attempts.
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
      };
    } catch {
      return {
        title: 'BabaBuilds ERP',
        body: event.data?.text() || 'You have a new update.',
      };
    }
  })();

  const title = payload.title || 'BabaBuilds ERP';
  const body = payload.body || 'You have a new update.';
  const url = payload.url || '/dashboard';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/launchericon-192x192.png',
      badge: '/icons/launchericon-72x72.png',
      data: { url },
      tag: 'bababuilds-notification',
    }),
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
