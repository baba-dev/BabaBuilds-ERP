import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/use-pwa';
import { DownloadCloud, Smartphone, ArrowDownToLine, BellRing, RefreshCcw, Cloud } from 'lucide-react';
import { toast } from 'sonner';

export function PWASettings() {
  const {
    isInstallable,
    installPWA,
    registerBackgroundSync,
    registerPeriodicSync,
    sendTestNotification,
  } = usePWA();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'default' : Notification.permission,
  );

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('Notifications are not supported by your browser.');
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      toast.success('Notifications enabled successfully.');
      const sent = await sendTestNotification();
      if (!sent) {
        toast.warning('Notification permission granted, but test notification was blocked by browser policy.');
      }
      return;
    }

    toast.warning('Notifications permission denied.');
  };

  const enableBackgroundSync = async () => {
    const ok = await registerBackgroundSync();
    if (!ok) {
      toast.warning('Background Sync is not available in this browser.');
      return;
    }

    toast.success('Background Sync enabled. Pending offline requests will sync when online.');
  };

  const enablePeriodicSync = async () => {
    const ok = await registerPeriodicSync();
    if (!ok) {
      toast.warning('Periodic Background Sync is unavailable or permission was not granted.');
      return;
    }

    toast.success('Periodic data refresh enabled.');
  };

  return (
    <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 mt-8">
      <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800">
        <CardTitle className="text-lg flex items-center gap-2 dark:text-zinc-50">
          <Smartphone className="w-5 h-5 text-indigo-600" /> App Features (PWA)
        </CardTitle>
        <CardDescription className="dark:text-zinc-400">
          Install the app and enable available native-like capabilities.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between border-b dark:border-zinc-800 pb-4">
          <div>
            <h3 className="font-semibold dark:text-zinc-200 flex items-center gap-2">
              <DownloadCloud className="w-4 h-4 text-zinc-500" /> Install Application
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Add BabaBuilds to your home screen for faster access, offline support, and app-like experience.
            </p>
          </div>
          <Button
            type="button"
            onClick={installPWA}
            disabled={!isInstallable}
            variant={isInstallable ? 'default' : 'secondary'}
            className="flex items-center gap-2"
          >
            <ArrowDownToLine className="w-4 h-4" />
            {isInstallable ? 'Install App' : 'Installed / Unsupported'}
          </Button>
        </div>

        <div className="flex items-center justify-between border-b dark:border-zinc-800 pb-4">
          <div>
            <h3 className="font-semibold dark:text-zinc-200 flex items-center gap-2">
              <BellRing className="w-4 h-4 text-zinc-500" /> Push Notifications
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Receive alerts for invoices and compliance deadlines.
            </p>
          </div>
          <Button
            type="button"
            onClick={requestNotificationPermission}
            disabled={permission === 'granted'}
            variant={permission === 'granted' ? 'secondary' : 'outline'}
          >
            {permission === 'granted' ? 'Enabled' : 'Enable Notifications'}
          </Button>
        </div>

        <div className="flex items-center justify-between border-b dark:border-zinc-800 pb-4">
          <div>
            <h3 className="font-semibold dark:text-zinc-200 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-zinc-500" /> Background Sync
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Queue updates while offline and sync when your connection returns.
            </p>
          </div>
          <Button type="button" onClick={enableBackgroundSync} variant="outline">
            Enable Sync
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold dark:text-zinc-200 flex items-center gap-2">
              <RefreshCcw className="w-4 h-4 text-zinc-500" /> Periodic Background Refresh
            </h3>
            <p className="text-sm text-zinc-500 mt-1">
              Refresh key cached pages periodically on supported browsers.
            </p>
          </div>
          <Button type="button" onClick={enablePeriodicSync} variant="outline">
            Enable Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
