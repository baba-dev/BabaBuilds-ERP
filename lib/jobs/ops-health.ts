import 'server-only';
import { prisma } from '@/lib/prisma';
import { loadErpJobsConfig } from '@/lib/jobs/config';
import Redis from 'ioredis';

export type JobHealth = {
  producerEnabled: boolean;
  workerEnabled: boolean;
  pilotEnabled: boolean;
  redisStatus: 'disabled' | 'ready' | 'unavailable' | 'misconfigured';
  postgresStatus: 'ready' | 'unavailable';
  /** Redis evidence from the worker reconciler; not inferred from a web flag. */
  workerHeartbeat: 'disabled' | 'ready' | 'degraded' | 'stale' | 'unavailable';
  workerHeartbeatAgeSeconds: number | null;
  jobsRedis: {
    memoryUsedBytes: number | null;
    memoryLimitBytes: number | null;
    maxmemoryPolicy: string | null;
    aofEnabled: boolean | null;
    evictedKeys: number | null;
  };
  pending: number;
  done: number;
  failed: number;
  oldestPendingSeconds: number | null;
  failedJobs: Array<{ id: string; kind: string; attempts: number; createdAt: string }>;
};

export async function getJobHealth(): Promise<JobHealth> {
  let config: ReturnType<typeof loadErpJobsConfig> | null = null;
  try { config = loadErpJobsConfig(); } catch { /* invalid URL must not be logged */ }
  const result: JobHealth = {
    producerEnabled: config?.enabled ?? false,
    workerEnabled: config?.workerEnabled ?? false,
    pilotEnabled: config?.inAppDeadlineEnabled ?? false,
    redisStatus: config ? (config.enabled ? 'unavailable' : 'disabled') : 'misconfigured',
    postgresStatus: 'unavailable',
    workerHeartbeat: config?.workerEnabled ? 'unavailable' : 'disabled',
    workerHeartbeatAgeSeconds: null,
    jobsRedis: {
      memoryUsedBytes: null, memoryLimitBytes: null, maxmemoryPolicy: null,
      aofEnabled: null, evictedKeys: null,
    },
    pending: 0, done: 0, failed: 0, oldestPendingSeconds: null, failedJobs: [],
  };
  try {
    const [grouped, oldest, failed] = await Promise.all([
      prisma.erpJobOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.erpJobOutbox.findFirst({
        where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.erpJobOutbox.findMany({
        where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, kind: true, attempts: true, createdAt: true },
      }),
    ]);
    const count = new Map(grouped.map(row => [row.status, row._count._all]));
    result.pending = count.get('PENDING') ?? 0;
    result.done = count.get('DONE') ?? 0;
    result.failed = count.get('FAILED') ?? 0;
    result.failedJobs = failed.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
    result.oldestPendingSeconds = oldest ?
      Math.max(0, Math.round((Date.now() - oldest.createdAt.getTime()) / 1000)) : null;
    result.postgresStatus = 'ready';
  } catch {
    // Schema may not yet be migrated. Keep diagnostics available.
  }
  function infoField(raw: string, key: string): string | null {
    const value = raw.match(new RegExp('(?:^|\\r?\\n)' + key + ':([^\\r\\n]*)'))?.[1]?.trim();
    return value || null;
  }
  function infoNumber(raw: string, key: string): number | null {
    const value = infoField(raw, key);
    const parsed = value && /^\\d+$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (config?.enabled && config.endpoint) {
    const client = new Redis(config.endpoint, {
      lazyConnect: true, enableOfflineQueue: false,
      maxRetriesPerRequest: 1, connectTimeout: 1200,
      commandTimeout: 1200, retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      result.redisStatus = (await client.ping()) === 'PONG' ? 'ready' : 'unavailable';
      if (result.redisStatus === 'ready') {
        if (config.workerEnabled) {
          try {
            const value = await client.get(config.namespace + ':jobs:worker:heartbeat');
            const parsed = /^(ok|degraded):(\\d{13})$/.exec(value || '');
            const age = parsed ? Math.floor((Date.now() - Number(parsed[2])) / 1000) : NaN;
            if (Number.isFinite(age) && age >= 0 && age <= 35) {
              result.workerHeartbeatAgeSeconds = age;
              result.workerHeartbeat = parsed?.[1] === 'ok' ? 'ready' : 'degraded';
            } else {
              result.workerHeartbeat = 'stale';
            }
          } catch {
            result.workerHeartbeat = 'unavailable';
          }
        }
        // INFO is read-only and confined to the existing authenticated job Redis.
        // A metrics failure does not masquerade as a worker outage.
        try {
          const [memory, persistence, stats] = await Promise.all([
            client.info('memory'), client.info('persistence'), client.info('stats'),
          ]);
          result.jobsRedis = {
            memoryUsedBytes: infoNumber(memory, 'used_memory'),
            memoryLimitBytes: infoNumber(memory, 'maxmemory'),
            maxmemoryPolicy: infoField(memory, 'maxmemory_policy'),
            aofEnabled: infoField(persistence, 'aof_enabled') === '1',
            evictedKeys: infoNumber(stats, 'evicted_keys'),
          };
        } catch { /* retain unknown metrics */ }
      }
    } catch { result.redisStatus = 'unavailable'; }
    finally { client.disconnect(); }
  }
  return result;
}
