import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { clearPasswordAuthRateLimit, reservePasswordAuthAttempt } from '@/lib/auth/rate-limit';
import { disconnectRedisClients } from '@/lib/redis/client';

// Same environment contract as tests/redis/rate-limit.test.ts (real Redis on 6384).
const keys = [
  'ERP_REDIS_ENABLED', 'ERP_REDIS_RATE_LIMIT_ENABLED', 'ERP_REDIS_CACHE_URL', 'ERP_REDIS_QUEUE_URL',
  'ERP_REDIS_NAMESPACE', 'ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY',
] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

beforeAll(() => {
  process.env.ERP_REDIS_ENABLED = 'true';
  process.env.ERP_REDIS_RATE_LIMIT_ENABLED = 'true';
  process.env.ERP_REDIS_CACHE_URL = 'redis://127.0.0.1:6384/0';
  process.env.ERP_REDIS_QUEUE_URL = 'redis://127.0.0.1:6384/0';
  process.env.ERP_REDIS_NAMESPACE = 'erp:test:auth-reserve:v1';
  delete process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY;
});
afterAll(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
  disconnectRedisClients();
});

const integration = process.env.CI_REDIS_RATE_LIMIT_TESTS === '1' ? describe : describe.skip;

integration('atomic password-attempt reservation with real Redis', () => {
  it('admits exactly five of forty parallel guesses across the distributed counter', async () => {
    const key = 'reserve-burst-' + randomUUID();
    const results = await Promise.all(Array.from({ length: 40 }, () => reservePasswordAuthAttempt(key)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok).every((r) => r.retryAfterSeconds > 0)).toBe(true);
  });

  it('clears the counter on success so the next window starts empty', async () => {
    const key = 'reserve-clear-' + randomUUID();
    for (let i = 0; i < 5; i++) await reservePasswordAuthAttempt(key);
    expect((await reservePasswordAuthAttempt(key)).ok).toBe(false);
    await clearPasswordAuthRateLimit(key);
    expect((await reservePasswordAuthAttempt(key)).ok).toBe(true);
  });
});
