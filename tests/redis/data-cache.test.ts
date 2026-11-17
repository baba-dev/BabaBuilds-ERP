import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cachedDataSnapshot, getDataCacheMetrics, invalidateWorkspaceDataCache } from '@/lib/redis/data-cache';
import { fingerprintCacheAuthorization } from '@/lib/redis/cache-authorization';
import { disconnectRedisClients } from '@/lib/redis/client';
import { loadRedisConfig } from '@/lib/redis/config';

const envNames = [
  'ERP_REDIS_ENABLED', 'ERP_REDIS_CACHE_ENABLED',
  'ERP_REDIS_DATA_CACHE_URL', 'ERP_REDIS_NAMESPACE',
  'ERP_REDIS_DASHBOARD_CACHE_ENABLED', 'ERP_REDIS_REPORT_CACHE_ENABLED',
  'ERP_REDIS_RATE_LIMIT_ENABLED', 'ERP_REDIS_CONNECT_TIMEOUT_MS',
] as const;
const prior = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const fresh = () => randomUUID();
const scope = (workspaceId: string, userId = 'user-1', fingerprint = 'grants-1', variant = 'FY-2026') =>
  ({ workspaceId, userId, authorizationFingerprint: fingerprint, variant });

describe('Phase 3 config and authorization fingerprint', () => {
  it('keeps data caching entirely disabled by default', () => {
    const config = loadRedisConfig({ NODE_ENV: 'test' });
    expect(config.features.cache).toBe(false);
    expect(config.features.dashboardCache).toBe(false);
    expect(config.features.reportCache).toBe(false);
    expect(config.urls.dataCache).toBeNull();
  });

  it('requires master flag and a dedicated endpoint', () => {
    expect(() => loadRedisConfig({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_CACHE_URL: 'redis://127.0.0.1:6384',
      ERP_REDIS_CACHE_ENABLED: 'true',
    })).toThrow(/ERP_REDIS_DATA_CACHE_URL/);
    expect(() => loadRedisConfig({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_CACHE_URL: 'redis://127.0.0.1:6384',
      ERP_REDIS_DATA_CACHE_URL: 'redis://127.0.0.1:6386',
      ERP_REDIS_REPORT_CACHE_ENABLED: 'true',
    })).toThrow(/ERP_REDIS_CACHE_ENABLED/);
  });

  it('changes cache scope when role permissions or enabled modules change', () => {
    const a = fingerprintCacheAuthorization({ 'dashboard.view': true, 'payroll.view': false }, new Set(['INVOICES']));
    const b = fingerprintCacheAuthorization({ 'dashboard.view': true, 'payroll.view': true }, new Set(['INVOICES']));
    const c = fingerprintCacheAuthorization({ 'dashboard.view': true, 'payroll.view': false }, new Set(['INVOICES', 'PAYROLL']));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

const live = process.env.CI_REDIS_DATA_CACHE_TESTS === '1' ? describe : describe.skip;

live('Phase 3 live Redis data cache (disposable instance)', () => {
  beforeAll(() => {
    process.env.ERP_REDIS_ENABLED = 'true';
    process.env.ERP_REDIS_CACHE_ENABLED = 'true';
    process.env.ERP_REDIS_DASHBOARD_CACHE_ENABLED = 'true';
    process.env.ERP_REDIS_REPORT_CACHE_ENABLED = 'true';
    process.env.ERP_REDIS_RATE_LIMIT_ENABLED = 'false';
    process.env.ERP_REDIS_DATA_CACHE_URL = 'redis://127.0.0.1:6384/0';
    process.env.ERP_REDIS_NAMESPACE = 'erp:test:phase3:' + process.pid;
    process.env.ERP_REDIS_CONNECT_TIMEOUT_MS = '500';
  });

  afterAll(() => {
    disconnectRedisClients();
    for (const name of envNames) {
      const old = prior[name];
      if (old === undefined) delete process.env[name];
      else process.env[name] = old;
    }
  });

  it('returns MISS then HIT without recomputing; keeps backend response shape', async () => {
    const key = scope(fresh());
    let calls = 0;
    const build = async () => ({ total: ++calls, from: 'postgres' });
    const first = await cachedDataSnapshot('dashboard', key, 30, build);
    const second = await cachedDataSnapshot('dashboard', key, 30, build);
    expect(first.state).toBe('MISS');
    expect(second.state).toBe('HIT');
    expect(first.value).toEqual(second.value);
    expect(second.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(second.ttlSeconds).toBeGreaterThan(0);
    expect(calls).toBe(1);
  });

  it('separates tenants, users, permission fingerprints, fiscal years and kinds', async () => {
    const tenant = fresh();
    const combinations = [
      scope(tenant, 'alice', 'role-A', 'FY-2026'),
      scope(tenant, 'bob', 'role-A', 'FY-2026'),
      scope(tenant, 'alice', 'role-B', 'FY-2026'),
      scope(tenant, 'alice', 'role-A', 'FY-2025'),
      scope(fresh(), 'alice', 'role-A', 'FY-2026'),
    ];
    for (let i = 0; i < combinations.length; i++) {
      const out = await cachedDataSnapshot('dashboard', combinations[i], 30, async () => ({ count: i }));
      expect(out.state).toBe('MISS');
    }
    for (let i = 0; i < combinations.length; i++) {
      const out = await cachedDataSnapshot('dashboard', combinations[i], 30, async () => ({ count: 99 }));
      expect(out.state).toBe('HIT');
      expect(out.value.count).toBe(i);
    }
    const report = await cachedDataSnapshot('report', combinations[0], 30, async () => ({ report: 1 }));
    expect(report.state).toBe('MISS');
  });

  it('invalidates dashboard and report results together after mutation', async () => {
    const key = scope(fresh());
    const original = async () => ({ value: 'before' });
    expect((await cachedDataSnapshot('dashboard', key, 30, original)).state).toBe('MISS');
    expect((await cachedDataSnapshot('report', key, 30, original)).state).toBe('MISS');
    expect(await invalidateWorkspaceDataCache(key.workspaceId)).toBe(true);
    const dashboard = await cachedDataSnapshot('dashboard', key, 30, async () => ({ value: 'after' }));
    const report = await cachedDataSnapshot('report', key, 30, async () => ({ value: 'after' }));
    expect(dashboard.state).toBe('MISS');
    expect(report.state).toBe('MISS');
    expect(dashboard.value.value).toBe('after');
    expect(report.value.value).toBe('after');
  });

  it('does not populate a stale version when a write finishes during computation', async () => {
    const key = scope(fresh());
    let start!: () => void;
    let finish!: () => void;
    const started = new Promise<void>((resolve) => { start = resolve; });
    const block = new Promise<void>((resolve) => { finish = resolve; });
    const inFlight = cachedDataSnapshot('dashboard', key, 30, async () => {
      start();
      await block;
      return { value: 'stale' };
    });
    await started;
    await invalidateWorkspaceDataCache(key.workspaceId);
    finish();
    const old = await inFlight;
    expect(old.state).toBe('BYPASS');
    const now = await cachedDataSnapshot('dashboard', key, 30, async () => ({ value: 'fresh' }));
    expect(now.state).toBe('MISS');
    expect(now.value.value).toBe('fresh');
  });

  it('coalesces concurrent cold reads without repeated calculations', async () => {
    const key = scope(fresh());
    let calls = 0;
    const results = await Promise.all(Array.from({ length: 12 }, () =>
      cachedDataSnapshot('report', key, 30, async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { value: 1 };
      }),
    ));
    expect(calls).toBe(1);
    expect(results.every((x) => x.value.value === 1)).toBe(true);
  });

  it('bypasses oversized payloads without storing them', async () => {
    const key = scope(fresh());
    const large = { blob: 'x'.repeat(450_000) };
    expect((await cachedDataSnapshot('dashboard', key, 30, async () => large)).state).toBe('BYPASS');
    expect((await cachedDataSnapshot('dashboard', key, 30, async () => ({ value: 2 }))).state).toBe('MISS');
  });

  it('keeps report and dashboard switches independent', async () => {
    process.env.ERP_REDIS_REPORT_CACHE_ENABLED = 'false';
    try {
      const key = scope(fresh());
      expect((await cachedDataSnapshot('report', key, 30, async () => 1)).state).toBe('BYPASS');
      expect((await cachedDataSnapshot('dashboard', key, 30, async () => 1)).state).toBe('MISS');
    } finally {
      process.env.ERP_REDIS_REPORT_CACHE_ENABLED = 'true';
    }
  });

  it('computes once from PostgreSQL path on data-cache outage', async () => {
    process.env.ERP_REDIS_DATA_CACHE_URL = 'redis://127.0.0.1:6399/0';
    try {
      let count = 0;
      const result = await cachedDataSnapshot('dashboard', scope(fresh()), 30, async () => ++count);
      expect(result.state).toBe('BYPASS');
      expect(result.value).toBe(1);
      expect(count).toBe(1);
    } finally {
      process.env.ERP_REDIS_DATA_CACHE_URL = 'redis://127.0.0.1:6384/0';
    }
    expect(getDataCacheMetrics().dashboard.error).toBeGreaterThanOrEqual(1);
  });
});
