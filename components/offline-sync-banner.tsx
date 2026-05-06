'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOfflineSync } from '@/hooks/use-offline-sync';

export default function OfflineSyncBanner() {
  const { summary, retryNow, isRetrying } = useOfflineSync();

  if (summary.pending === 0 && summary.failed === 0) {
    return null;
  }

  const hasFailed = summary.failed > 0;
  const total = summary.pending + summary.failed;

  return (
    <div className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md transition-all sm:sticky sm:top-0 sm:left-auto sm:w-full sm:max-w-none sm:translate-x-0 sm:rounded-none sm:border-b sm:py-2 sm:shadow-none ${
      hasFailed 
        ? "border-amber-300/70 bg-amber-50/95 text-amber-900 dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-100"
        : "border-zinc-200 bg-white/95 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-300"
    }`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2 sm:items-center">
          <AlertTriangle className={`h-4 w-4 shrink-0 ${hasFailed ? "text-amber-500" : "text-zinc-400"}`} />
          <span className="leading-tight">
            You&apos;re offline. <strong>{total}</strong> saved update{total !== 1 ? 's' : ''} will auto-sync when your browser reconnects.
            {hasFailed && <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">({summary.failed} attention needed)</span>}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`w-full shrink-0 bg-transparent sm:w-auto ${
            hasFailed 
              ? "border-amber-500/50 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50" 
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
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
