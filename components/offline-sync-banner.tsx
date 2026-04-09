'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOfflineSync } from '@/hooks/use-offline-sync';

export default function OfflineSyncBanner() {
  const { summary, retryNow, isRetrying } = useOfflineSync();

  if (summary.pending === 0 && summary.failed === 0) {
    return null;
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300/70 bg-amber-50/95 px-4 py-2 text-amber-900 backdrop-blur dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>
            Offline sync queue: <strong>{summary.pending}</strong> pending, <strong>{summary.failed}</strong> failed.
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-amber-500/50 bg-transparent text-amber-900 hover:bg-amber-100 dark:text-amber-100"
          onClick={() => {
            void retryNow();
          }}
          disabled={isRetrying}
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          {isRetrying ? 'Retrying…' : 'Retry now'}
        </Button>
      </div>
    </div>
  );
}
