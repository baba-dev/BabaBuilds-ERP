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
    } catch { result.redisStatus = 'unavailable'; }
    finally { client.disconnect(); }
  }
  return result;
}
