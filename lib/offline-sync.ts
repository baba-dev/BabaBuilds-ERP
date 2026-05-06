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

export interface OfflineSyncSummary {
  pending: number;
  synced: number;
  failed: number;
  total: number;
}

const OFFLINE_QUEUE_DB_NAME = 'baba-offline-sync';
const OFFLINE_QUEUE_STORE = 'queue';
const OFFLINE_QUEUE_DB_VERSION = 1;
const LEGACY_OFFLINE_QUEUE_KEY = 'baba-offline-sync-queue-v1';
const OFFLINE_QUEUE_EVENT = 'offline-sync-queue-updated';

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';
const canUseWindow = () => typeof window !== 'undefined';
const canUseBrowserStorage = () => canUseWindow() && typeof localStorage !== 'undefined';

function emitQueueUpdated() {
  if (!canUseWindow()) return;
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openQueueDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB_NAME, OFFLINE_QUEUE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        const store = db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function withQueueStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | Promise<IDBRequest<T>>,
): Promise<T | null> {
  const db = await openQueueDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const transaction = db.transaction(OFFLINE_QUEUE_STORE, mode);
    const store = transaction.objectStore(OFFLINE_QUEUE_STORE);
    let request: IDBRequest<T> | null = null;

    transaction.oncomplete = () => {
      db.close();
      resolve(request ? request.result : null);
    };
    transaction.onerror = () => {
      db.close();
      resolve(null);
    };
    transaction.onabort = () => {
      db.close();
      resolve(null);
    };

    Promise.resolve(callback(store))
      .then((result) => {
        request = result;
      })
      .catch(() => {
        transaction.abort();
      });
  });
}

function readLegacyQueue(): OfflineQueueItem[] {
  if (!canUseBrowserStorage()) return [];
  try {
    const raw = localStorage.getItem(LEGACY_OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function migrateLegacyQueue() {
  if (!canUseBrowserStorage() || !canUseIndexedDb()) return;
  const legacyQueue = readLegacyQueue();
  if (legacyQueue.length === 0) return;

  await withQueueStore('readwrite', (store) => {
    legacyQueue.forEach((item) => store.put(item));
    return store.getAll() as IDBRequest<OfflineQueueItem[]>;
  });

  try {
    localStorage.removeItem(LEGACY_OFFLINE_QUEUE_KEY);
  } catch {
    // Ignore storage cleanup errors.
  }
}

async function readQueue(): Promise<OfflineQueueItem[]> {
  await migrateLegacyQueue();
  const queue = await withQueueStore('readonly', (store) => store.getAll() as IDBRequest<OfflineQueueItem[]>);
  return Array.isArray(queue) ? queue : [];
}

async function writeQueue(items: OfflineQueueItem[]) {
  const wrote = await withQueueStore('readwrite', (store) => {
    store.clear();
    items.forEach((item) => store.put(item));
    return store.getAll() as IDBRequest<OfflineQueueItem[]>;
  });

  if (wrote) {
    emitQueueUpdated();
  }
}

export async function getOfflineQueue() {
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

export async function queueOfflineMutation(input: Omit<OfflineQueueItem, 'id' | 'status' | 'retries' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const queue = await readQueue();

  const item: OfflineQueueItem = {
    ...input,
    id: createId(),
    status: 'pending',
    retries: 0,
    createdAt: now,
    updatedAt: now,
  };

  queue.push(item);
  await writeQueue(queue);
  return item;
}

export async function getOfflineQueueSummary(): Promise<OfflineSyncSummary> {
  const queue = await readQueue();
  const pending = queue.filter((item) => item.status === 'pending').length;
  const synced = queue.filter((item) => item.status === 'synced').length;
  const failed = queue.filter((item) => item.status === 'failed').length;
  return { pending, synced, failed, total: queue.length };
}

export async function retryOfflineQueue() {
  const queue = await readQueue();
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
        credentials: 'same-origin',
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

  await writeQueue(queue);
  return { attempted: candidates.length, synced: syncedCount, failed: failedCount };
}

export function subscribeOfflineQueue(listener: () => void) {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(OFFLINE_QUEUE_EVENT, listener);
  return () => window.removeEventListener(OFFLINE_QUEUE_EVENT, listener);
}

export const OFFLINE_QUEUE_UPDATE_EVENT = OFFLINE_QUEUE_EVENT;
