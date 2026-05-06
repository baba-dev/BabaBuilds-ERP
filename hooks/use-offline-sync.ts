'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getOfflineQueueSummary,
  OFFLINE_QUEUE_UPDATE_EVENT,
  retryOfflineQueue,
  subscribeOfflineQueue,
  type ConflictPolicy,
  type OfflineEntityType,
  type OfflineOperation,
} from '@/lib/offline-sync';

export interface OfflineSyncSummary {
  pending: number;
  synced: number;
  failed: number;
  total: number;
}

export function useOfflineSync() {
  const [summary, setSummary] = useState<OfflineSyncSummary>({ pending: 0, synced: 0, failed: 0, total: 0 });
  const [isRetrying, setIsRetrying] = useState(false);

  const refresh = useCallback(() => {
    void getOfflineQueueSummary().then(setSummary);
  }, []);

  useEffect(() => {
    refresh();

    const onWorkerMessage = (event: MessageEvent<Record<string, string>>) => {
      if (event.data?.type === 'background-sync-fired' || event.data?.type === 'offline-sync-queue-updated') {
        refresh();
      }
    };

    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    const unsub = subscribeOfflineQueue(refresh);
    window.addEventListener(OFFLINE_QUEUE_UPDATE_EVENT, refresh);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
      unsub();
      window.removeEventListener(OFFLINE_QUEUE_UPDATE_EVENT, refresh);
    };
  }, [refresh]);

  const retryNow = useCallback(async () => {
    setIsRetrying(true);
    try {
      const result = await retryOfflineQueue();
      refresh();
      return result;
    } finally {
      setIsRetrying(false);
    }
  }, [refresh]);

  const conflictRules: Array<{ entity: OfflineEntityType; operation: OfflineOperation; rule: ConflictPolicy; note: string }> = [
    {
      entity: 'invoice',
      operation: 'create',
      rule: 'server-wins',
      note: 'Invoice number/source of truth is assigned and validated on the server.',
    },
    {
      entity: 'invoice',
      operation: 'update',
      rule: 'merge-prompt',
      note: 'When edits collide, require manual merge confirmation before overwrite.',
    },
    {
      entity: 'expense',
      operation: 'create',
      rule: 'server-wins',
      note: 'Server timestamps/compliance fields are authoritative for new entries.',
    },
    {
      entity: 'expense',
      operation: 'update',
      rule: 'client-wins',
      note: 'Latest user-entered receipt category/amount is replayed by default.',
    },
  ];

  return { summary, refresh, retryNow, isRetrying, conflictRules };
}
