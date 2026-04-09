'use client';

import { useEffect } from 'react';

type ExtendedServiceWorkerRegistration = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
  };
};

async function registerOptionalCapabilities(registration: ExtendedServiceWorkerRegistration) {
  if (registration.sync) {
    try {
      await registration.sync.register('sync-pending-requests');
    } catch {
      // Browser refused registration or does not currently allow it.
    }
  }

  if (registration.periodicSync) {
    try {
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync' as PermissionName,
      });

      if (status.state === 'granted') {
        await registration.periodicSync.register('refresh-core-data', {
          minInterval: 12 * 60 * 60 * 1000,
        });
      }
    } catch {
      // Unsupported or denied.
    }
  }
}

export default function PWARegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    if (!('serviceWorker' in navigator)) {
      return;
    }

    const register = async () => {
      try {
        const registration = (await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })) as ExtendedServiceWorkerRegistration;

        await registerOptionalCapabilities(registration);
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    void register();
  }, []);

  return null;
}
