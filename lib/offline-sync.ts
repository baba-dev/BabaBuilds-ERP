export type OfflineEntityType = 'invoice' | 'expense';
export type OfflineOperation = 'create' | 'update' | 'delete';
export type OfflineQueueStatus = 'pending' | 'synced' | 'failed';
export type ConflictPolicy = 'server-wins' | 'client-wins' | 'merge-prompt';

export interface OfflineQueueItem {
  id: string;
  entity: OfflineEntityType;
  operation: OfflineOperation;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  payload: Record<string, unknown>;
  status: OfflineQueueStatus;
  conflictPolicy: ConflictPolicy;
  retries: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

const OFFLINE_QUEUE_KEY = 'baba-offline-sync-queue-v1';
const OFFLINE_QUEUE_EVENT = 'offline-sync-queue-updated';

const canUseBrowserStorage = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function emitQueueUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
}

function readQueue(): OfflineQueueItem[] {
  if (!canUseBrowserStorage()) return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineQueueItem[]) {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  emitQueueUpdated();
}

export function getOfflineQueue() {
  return readQueue();
}

export function getConflictPolicy(entity: OfflineEntityType, operation: OfflineOperation): ConflictPolicy {
  if (entity === 'invoice') {
    return operation === 'update' ? 'merge-prompt' : 'server-wins';
  }

  if (entity === 'expense') {
    return operation === 'update' ? 'client-wins' : 'server-wins';
  }

  return 'server-wins';
}

export function queueOfflineMutation(input: Omit<OfflineQueueItem, 'id' | 'status' | 'retries' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const queue = readQueue();

  const item: OfflineQueueItem = {
    ...input,
    id: crypto.randomUUID(),
    status: 'pending',
    retries: 0,
    createdAt: now,
    updatedAt: now,
  };

  queue.push(item);
  writeQueue(queue);
  return item;
}

export function getOfflineQueueSummary() {
  const queue = readQueue();
  const pending = queue.filter((item) => item.status === 'pending').length;
  const synced = queue.filter((item) => item.status === 'synced').length;
  const failed = queue.filter((item) => item.status === 'failed').length;
  return { pending, synced, failed, total: queue.length };
}

export async function retryOfflineQueue() {
  const queue = readQueue();
  const candidates = queue.filter((item) => item.status === 'failed' || item.status === 'pending');

  if (candidates.length === 0) {
    return { attempted: 0, synced: 0, failed: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of candidates) {
    try {
      const response = await fetch(item.endpoint, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Retry': '1',
          'X-Offline-Conflict-Policy': item.conflictPolicy,
        },
        body: item.method === 'DELETE' ? undefined : JSON.stringify(item.payload),
      });

      if (response.status === 409) {
        failedCount += 1;
        item.status = 'failed';
        item.lastError = 'Server detected a data conflict. Merge review required.';
        item.updatedAt = new Date().toISOString();
        item.retries += 1;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}`);
      }

      item.status = 'synced';
      item.lastError = undefined;
      item.updatedAt = new Date().toISOString();
      item.retries += 1;
      syncedCount += 1;
    } catch (error) {
      failedCount += 1;
      item.status = 'failed';
      item.lastError = error instanceof Error ? error.message : 'Unknown sync error';
      item.updatedAt = new Date().toISOString();
      item.retries += 1;
    }
  }

  writeQueue(queue);
  return { attempted: candidates.length, synced: syncedCount, failed: failedCount };
}

export function subscribeOfflineQueue(listener: () => void) {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(OFFLINE_QUEUE_EVENT, listener);
  return () => window.removeEventListener(OFFLINE_QUEUE_EVENT, listener);
}

export const OFFLINE_QUEUE_UPDATE_EVENT = OFFLINE_QUEUE_EVENT;
