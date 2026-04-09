import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/use-pwa';
import { DownloadCloud, Smartphone, ArrowDownToLine, BellRing, RefreshCcw, Cloud, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useOfflineSync } from '@/hooks/use-offline-sync';

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
  const { summary, retryNow, isRetrying, conflictRules } = useOfflineSync();

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

  const retryQueuedItems = async () => {
    const result = await retryNow();

    if (result.attempted === 0) {
      toast.message('No pending or failed sync items found.');
      return;
    }

    if (result.failed > 0) {
      toast.warning(`Retried ${result.attempted} item(s): ${result.synced} synced, ${result.failed} failed.`);
      return;
    }

    toast.success(`Retried ${result.attempted} item(s): all changes are now synced.`);
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
        <div className="space-y-4 border-t dark:border-zinc-800 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold dark:text-zinc-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-zinc-500" /> Offline Sync Queue
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                Track pending, synced, and failed offline updates and retry immediately when online.
              </p>
            </div>
            <Button type="button" onClick={retryQueuedItems} variant="outline" disabled={isRetrying}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {isRetrying ? 'Retrying...' : 'Retry Failed/Pending'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/30 p-3">
              <p className="text-xs uppercase tracking-widest text-amber-700 dark:text-amber-300">Pending</p>
              <p className="text-2xl font-semibold text-amber-900 dark:text-amber-100">{summary.pending}</p>
            </div>
            <div className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/30 p-3">
              <p className="text-xs uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Synced</p>
              <p className="text-2xl font-semibold text-emerald-900 dark:text-emerald-100">{summary.synced}</p>
            </div>
            <div className="rounded-md border border-rose-200 dark:border-rose-900/40 bg-rose-50/70 dark:bg-rose-950/30 p-3">
              <p className="text-xs uppercase tracking-widest text-rose-700 dark:text-rose-300">Failed</p>
              <p className="text-2xl font-semibold text-rose-900 dark:text-rose-100">{summary.failed}</p>
            </div>
          </div>
          <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 p-3">
            <h4 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Conflict Resolution Rules</h4>
            <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              {conflictRules.map((rule) => (
                <li key={`${rule.entity}-${rule.operation}`} className="flex flex-col">
                  <span className="font-medium">
                    {rule.entity} / {rule.operation}: <span className="uppercase text-indigo-600 dark:text-indigo-400">{rule.rule}</span>
                  </span>
                  <span className="text-xs text-zinc-500">{rule.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
