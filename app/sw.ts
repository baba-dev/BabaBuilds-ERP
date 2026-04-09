/// <reference lib="webworker" />

import { defaultCache } from '@serwist/next/worker';
import { type PrecacheEntry, Serwist, type SerwistGlobalConfig } from 'serwist';

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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
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

  const destination = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/dashboard';

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

  syncEvent.waitUntil(notifyClients({ type: 'background-sync-fired' }));
});

self.addEventListener('periodicsync', (event: Event) => {
  const periodicEvent = event as PeriodicSyncEventLike;
  if (periodicEvent.tag !== 'refresh-core-data') {
    return;
  }

  periodicEvent.waitUntil(revalidateCorePages());
});
