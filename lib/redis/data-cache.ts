import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '@/lib/redis/client';
import { loadRedisConfig, redisKey, type RedisConfig } from '@/lib/redis/config';

export type DataCacheKind = 'dashboard' | 'report';
export type DataCacheState = 'HIT' | 'MISS' | 'BYPASS';
export type DataCacheResult<T> = {
  value: T;
  state: DataCacheState;
  ageSeconds: number;
  ttlSeconds: number;
};

export type DataCacheScope = {
  workspaceId: string;
  userId: string;
  /** Current, freshly resolved effective permissions and enabled modules. */
  authorizationFingerprint: string;
  /** Fiscal year / report selector / sanitized user input. */
  variant: string;
};

const VERSION = 'v3';
const TTL_MAX_SECONDS = 30;
const MAX_SERIALIZED_BYTES = 384 * 1024;
const MAX_LOCAL_INFLIGHT = 200;

type Stored<T> = {
  version: typeof VERSION;
  createdAt: number;
  expiresAt: number;
  value: T;
};

type Metric = 'hit' | 'miss' | 'bypass' | 'error' | 'oversized' | 'generationChanged';
const metrics: Record<DataCacheKind, Record<Metric, number>> = {
  dashboard: { hit: 0, miss: 0, bypass: 0, error: 0, oversized: 0, generationChanged: 0 },
  report: { hit: 0, miss: 0, bypass: 0, error: 0, oversized: 0, generationChanged: 0 },
};
const inflight = new Map<string, Promise<DataCacheResult<unknown>>>();

function digest(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function configured(kind: DataCacheKind, config: RedisConfig): boolean {
  return config.enabled && config.features.cache &&
    (kind === 'dashboard' ? config.features.dashboardCache : config.features.reportCache);
}

/** Pure toggle check; no network connection, safe to use before authorization. */
export function isRedisDataCacheEnabled(kind: DataCacheKind): boolean {
  return configured(kind, loadRedisConfig());
}

export function getDataCacheMetrics() {
  return { dashboard: { ...metrics.dashboard }, report: { ...metrics.report } };
}

function revisionKey(config: RedisConfig, workspaceId: string): string {
  return redisKey(config, 'cache', VERSION, 'revision', digest(workspaceId));
}

function resultKey(
  config: RedisConfig,
  kind: DataCacheKind,
  scope: DataCacheScope,
  revision: string,
): string {
  const signature = digest(JSON.stringify([
    scope.workspaceId, scope.userId, scope.authorizationFingerprint, scope.variant,
  ]));
  return redisKey(config, 'cache', VERSION, 'snapshot', kind, revision, signature);
}

type DataClient = NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;

/** Missing or evicted generations get a NEW random token, never the old initial value. */
async function getGeneration(client: DataClient, config: RedisConfig, workspaceId: string): Promise<string> {
  const key = revisionKey(config, workspaceId);
  const present = await client.get(key);
  if (present) return present;
  const candidate = randomUUID();
  await client.set(key, candidate, 'NX');
  const actual = await client.get(key);
  if (!actual) throw new Error('REDIS_DATA_CACHE_REVISION_UNAVAILABLE');
  return actual;
}

/**
 * A successful mutation bumps a workspace-wide random generation, invalidating
 * both dashboard and report keys without KEYS/SCAN and without losing other
 * tenants' snapshots. Must be awaited AFTER the PostgreSQL commit.
 *
 * Failure is propagated to the caller (so the mutation path can record an
 * incident), not used to roll back already committed financial data.
 */
export async function invalidateWorkspaceDataCache(workspaceId: string): Promise<boolean> {
  if (!workspaceId) throw new Error('Invalid workspace');
  const config = loadRedisConfig();
  if (!config.enabled || !config.features.cache ||
      (!config.features.dashboardCache && !config.features.reportCache)) return false;
  const client = await getRedisClient('dataCache', config);
  if (!client) throw new Error('REDIS_DATA_CACHE_UNAVAILABLE');
  await client.set(revisionKey(config, workspaceId), randomUUID());
  return true;
}

function bypass<T>(kind: DataCacheKind, value: T): DataCacheResult<T> {
  metrics[kind].bypass += 1;
  return { value, state: 'BYPASS', ageSeconds: 0, ttlSeconds: 0 };
}

function unsafeScope(scope: DataCacheScope) {
  return !scope.workspaceId || !scope.userId || !scope.authorizationFingerprint ||
    scope.variant.length > 4096;
}

/**
 * A cache-aside, per-process-coalesced snapshot. DB computation errors are never
 * swallowed or run twice. Redis read/write errors bypass only the cache.
 * This adapter is NOT suitable for payment mutation, reconciliation, authorization,
 * webhook, or other strongly consistent financial workflows.
 */
export async function cachedDataSnapshot<T>(
  kind: DataCacheKind,
  scope: DataCacheScope,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<DataCacheResult<T>> {
  let config: RedisConfig | null = null;
  try {
    config = loadRedisConfig();
  } catch {
    // An invalid Redis configuration must not fail a legitimate DB read.
  }
  if (!config || !configured(kind, config) || unsafeScope(scope) ||
      !Number.isFinite(ttlSeconds)) {
    return bypass(kind, await compute());
  }

  const ttl = Math.min(TTL_MAX_SECONDS, Math.max(1, Math.floor(ttlSeconds)));
  let client: DataClient;
  let generation: string;
  let key: string;
  try {
    const resolved = await getRedisClient('dataCache', config);
    if (!resolved) throw new Error('REDIS_DATA_CACHE_UNAVAILABLE');
    client = resolved;
    generation = await getGeneration(client, config, scope.workspaceId);
    key = resultKey(config, kind, scope, generation);
    const raw = await client.get(key);
    if (raw && Buffer.byteLength(raw, 'utf8') <= MAX_SERIALIZED_BYTES) {
      const parsed = JSON.parse(raw) as Stored<T>;
      const now = Date.now();
      if (parsed?.version === VERSION && typeof parsed.createdAt === 'number' &&
          typeof parsed.expiresAt === 'number' && parsed.expiresAt > now &&
          parsed.createdAt <= now && parsed.value !== undefined) {
        // Re-check after the hit to avoid serving a snapshot revoked while
        // the Redis read was in flight.
        if ((await client.get(revisionKey(config, scope.workspaceId))) === generation) {
          metrics[kind].hit += 1;
          return {
            value: parsed.value, state: 'HIT',
            ageSeconds: Math.max(0, Math.floor((now - parsed.createdAt) / 1000)),
            ttlSeconds: Math.max(0, Math.ceil((parsed.expiresAt - now) / 1000)),
          };
        }
      }
    }
  } catch {
    metrics[kind].error += 1;
    return bypass(kind, await compute());
  }

  metrics[kind].miss += 1;
  const existing = inflight.get(key!);
  if (existing) return await existing as DataCacheResult<T>;
  const work: Promise<DataCacheResult<T>> = (async () => {
    const value = await compute(); // Propagate DB errors without retry.
    const createdAt = Date.now();
    const entry: Stored<T> = {
      version: VERSION, value, createdAt, expiresAt: createdAt + ttl * 1000,
    };
    try {
      const serialized = JSON.stringify(entry);
      if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_BYTES) {
        metrics[kind].oversized += 1;
        return { value, state: 'BYPASS' as const, ageSeconds: 0, ttlSeconds: 0 };
      }
      // A mutation that ran during compute must not be overwritten by this
      // older snapshot. Keys also include the revision: late writes are
      // unreachable after a new generation is published.
      if ((await client.get(revisionKey(config, scope.workspaceId))) !== generation) {
        metrics[kind].generationChanged += 1;
        return { value, state: 'BYPASS' as const, ageSeconds: 0, ttlSeconds: 0 };
      }
      await client.set(key!, serialized, 'EX', ttl);
      return { value, state: 'MISS' as const, ageSeconds: 0, ttlSeconds: ttl };
    } catch {
      metrics[kind].error += 1;
      return { value, state: 'BYPASS' as const, ageSeconds: 0, ttlSeconds: 0 };
    }
  })();
  // Avoid unbounded in-flight request tracking.
  if (inflight.size < MAX_LOCAL_INFLIGHT) inflight.set(key!, work);
  try {
    return await work;
  } finally {
    if (inflight.get(key!) === work) inflight.delete(key!);
  }
}
