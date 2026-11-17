import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redisRateLimit, rateLimitIdentity, validateLimit } from '@/lib/redis/rate-limit';
import { disconnectRedisClients } from '@/lib/redis/client';
import { checkPasswordAuthRateLimit, recordPasswordAuthFailure, clearPasswordAuthRateLimit } from '@/lib/auth/rate-limit';
import { checkRateLimit } from '@/lib/rate-limit-memory';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';

const keys = [
  'ERP_REDIS_ENABLED', 'ERP_REDIS_RATE_LIMIT_ENABLED',
  'ERP_REDIS_CACHE_URL', 'ERP_REDIS_QUEUE_URL',
  'ERP_REDIS_NAMESPACE', 'ERP_REDIS_CONNECT_TIMEOUT_MS',
] as const;
const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

beforeAll(() => {
  process.env.ERP_REDIS_ENABLED = 'true';
  process.env.ERP_REDIS_RATE_LIMIT_ENABLED = 'true';
  process.env.ERP_REDIS_CACHE_URL = 'redis://127.0.0.1:6384/0';
  process.env.ERP_REDIS_QUEUE_URL = 'redis://127.0.0.1:6384/0';
  process.env.ERP_REDIS_NAMESPACE = 'erp:test:rate-limits:v1';
  process.env.ERP_REDIS_CONNECT_TIMEOUT_MS = '200';
});

afterAll(() => {
  disconnectRedisClients();
  for (const key of keys) {
    const value = prior[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Redis fixed-window policy (pure)', () => {
  it('hashes untrusted identity instead of using raw IPs or tokens in keys', () => {
    const token = 'secret-proposal-token-' + randomUUID();
    const hash = rateLimitIdentity('generic', token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(rateLimitIdentity('auth', token)).not.toBe(hash);
  });

  it('rejects invalid policies and domains', () => {
    expect(() => validateLimit(0, 1_000)).toThrow();
    expect(() => validateLimit(5, 0)).toThrow();
    expect(() => validateLimit(1.2, 60_000)).toThrow();
    expect(() => rateLimitIdentity('admin:invalid', 'key')).toThrow();
  });
});

const integration = process.env.CI_REDIS_RATE_LIMIT_TESTS === '1' ? describe : describe.skip;

integration('Redis fixed-window integration with real Redis', () => {
  it('enforces a distributed, atomic cap across concurrent requests', async () => {
    const identity = 'concurrent-' + randomUUID();
    const results = await Promise.all(
      Array.from({ length: 45 }, () => redisRateLimit('route', identity, 5, 5_000)),
    );
    expect(results.filter((result) => result?.ok)).toHaveLength(5);
    expect(results.filter((result) => !result?.ok)).toHaveLength(40);
    expect(results.every((result) => result && result.retryAfterMs > 0)).toBe(true);
  });

  it('preserves exactly five failed auth attempts and permits clearing a counter', async () => {
    const identity = 'password-login-' + randomUUID();
    expect((await checkPasswordAuthRateLimit(identity)).ok).toBe(true);
    for (let i = 0; i < 5; i++) {
      const result = await recordPasswordAuthFailure(identity);
      expect(result.count).toBe(i + 1);
    }
    const denied = await checkPasswordAuthRateLimit(identity);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    await clearPasswordAuthRateLimit(identity);
    expect((await checkPasswordAuthRateLimit(identity)).ok).toBe(true);
  });

  it('has bounded TTL and opens a new window after expiry', async () => {
    const identity = 'ttl-' + randomUUID();
    expect((await redisRateLimit('generic', identity, 1, 150))?.ok).toBe(true);
    const limited = await redisRateLimit('generic', identity, 1, 150);
    expect(limited?.ok).toBe(false);
    expect(limited?.retryAfterMs).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect((await redisRateLimit('generic', identity, 1, 150))?.ok).toBe(true);
  });

  it('keeps public limit response shapes, retry headers, and local-disabled behavior', async () => {
    const ip = '192.0.2.9';
    const request = new Request('https://example.invalid/api/test', { headers: { 'cf-connecting-ip': ip } });
    const route = '/api/phase-2-test-' + randomUUID();
    expect((await enforceRouteRateLimit({ request, route, scope: 'tenant', max: 1, windowMs: 5_000 })).ok).toBe(true);
    const blocked = await enforceRouteRateLimit({ request, route, scope: 'tenant', max: 1, windowMs: 5_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.response.status).toBe(429);
      expect(Number(blocked.response.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect((await blocked.response.json()).retryAfterSeconds).toBeGreaterThan(0);
    }
    const generic = 'generic-' + randomUUID();
    expect((await checkRateLimit(generic, 1, 5_000)).ok).toBe(true);
    expect((await checkRateLimit(generic, 1, 5_000)).ok).toBe(false);

    process.env.ERP_REDIS_RATE_LIMIT_ENABLED = 'false';
    try {
      expect(await redisRateLimit('generic', generic, 1, 5_000)).toBeNull();
    } finally {
      process.env.ERP_REDIS_RATE_LIMIT_ENABLED = 'true';
    }
  });

  it('fails closed for auth but falls back locally for ordinary routes during Redis outage', async () => {
    process.env.ERP_REDIS_QUEUE_URL = 'redis://127.0.0.1:6399/0';
    process.env.ERP_REDIS_CACHE_URL = 'redis://127.0.0.1:6399/0';
    try {
      const limited = await checkPasswordAuthRateLimit('outage-' + randomUUID());
      expect(limited.ok).toBe(false);
      const ordinary = await checkRateLimit('outage-generic-' + randomUUID(), 1, 5_000);
      expect(ordinary.ok).toBe(true);
    } finally {
      process.env.ERP_REDIS_QUEUE_URL = 'redis://127.0.0.1:6384/0';
      process.env.ERP_REDIS_CACHE_URL = 'redis://127.0.0.1:6384/0';
    }
  });
});
