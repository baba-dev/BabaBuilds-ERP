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
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm sm:max-w-none sm:w-full sm:sticky sm:top-0 sm:left-auto sm:translate-x-0 sm:border-b border rounded-xl sm:rounded-none px-4 py-3 sm:py-2 backdrop-blur-md shadow-xl sm:shadow-none transition-all ${
      hasFailed 
        ? "border-amber-300/70 bg-amber-50/95 text-amber-900 dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-100"
        : "border-zinc-200 bg-white/95 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-300"
    }`}>
      <div className="mx-auto flex items-center justify-between gap-3 text-sm max-w-6xl">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 shrink-0 ${hasFailed ? "text-amber-500" : "text-zinc-400"}`} />
          <span className="leading-tight">
            You&apos;re offline. <strong>{total}</strong> update{total !== 1 ? 's' : ''} will sync when connection returns.
            {hasFailed && <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">({summary.failed} attention needed)</span>}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`shrink-0 bg-transparent ${
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
