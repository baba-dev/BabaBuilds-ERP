import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

type SyncServiceWorkerRegistration = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
  };
};

type UsePWAOptions = {
  /**
   * When true, intercept beforeinstallprompt so a visible in-app install UI can
   * own the browser prompt. Leave false whenever that UI is loading or hidden.
   */
  enableInstallPrompt?: boolean;
};

export function usePWA({ enableInstallPrompt = true }: UsePWAOptions = {}) {
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!enableInstallPrompt) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      // Intentionally suppress the browser mini-infobar only while a mounted,
      // visible custom install control is ready to call installPWA().
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [enableInstallPrompt]);

  const installPWA = async () => {
    if (!enableInstallPrompt || !deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setIsInstallable(false);
    }

    setDeferredPrompt(null);
  };

  const setAppBadge = async (count: number) => {
    const badgeNavigator = navigator as BadgeNavigator;
    if (!badgeNavigator.setAppBadge) {
      return;
    }

    try {
      await badgeNavigator.setAppBadge(count);
    } catch (error) {
      console.error('Failed to set app badge', error);
    }
  };

  const clearAppBadge = async () => {
    const badgeNavigator = navigator as BadgeNavigator;
    if (!badgeNavigator.clearAppBadge) {
      return;
    }

    try {
      await badgeNavigator.clearAppBadge();
    } catch (error) {
      console.error('Failed to clear app badge', error);
    }
  };

  const registerBackgroundSync = async () => {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    const registration = (await navigator.serviceWorker.ready) as SyncServiceWorkerRegistration;
    if (!registration.sync) {
      return false;
    }

    await registration.sync.register('sync-pending-requests');
    return true;
  };

  const registerPeriodicSync = async () => {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    const registration = (await navigator.serviceWorker.ready) as SyncServiceWorkerRegistration;
    if (!registration.periodicSync) {
      return false;
    }

    try {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
      if (status.state !== 'granted') {
        return false;
      }

      await registration.periodicSync.register('refresh-core-data', {
        minInterval: 12 * 60 * 60 * 1000,
      });

      return true;
    } catch {
      return false;
    }
  };

  const sendTestNotification = async () => {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;

    if (Notification.permission !== 'granted') {
      return false;
    }

    await registration.showNotification('BabaBuilds ERP', {
      body: 'Notifications are enabled for invoices, payments, and compliance reminders.',
      icon: '/icons/launchericon-192x192.png',
      badge: '/icons/launchericon-72x72.png',
      data: { url: '/dashboard' },
      tag: 'pwa-test-notification',
    });

    return true;
  };

  return {
    isInstallable: enableInstallPrompt && isInstallable,
    installPWA,
    setAppBadge,
    clearAppBadge,
    registerBackgroundSync,
    registerPeriodicSync,
    sendTestNotification,
  };
}
