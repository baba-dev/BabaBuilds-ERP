import { describe, expect, it } from 'vitest';
import { loadRedisConfig, redisKey, redisQueuePrefix } from '@/lib/redis/config';
import { getRedisHealth } from '@/lib/redis/health';

const cacheUrl = 'redis://:not-a-real-password@127.0.0.1:6382/0';
const queueUrl = 'redis://:not-a-real-password@127.0.0.1:6381/0';
const env = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv =>
  ({ NODE_ENV: 'test', ...overrides });

describe('ERP Redis foundation', () => {
  it('is completely opt-in and does not reuse a generic REDIS_URL', () => {
    const config = loadRedisConfig(env({ REDIS_URL: cacheUrl }));
    expect(config.enabled).toBe(false);
    expect(config.urls).toEqual({ cache: null, queue: null });
    expect(config.features).toEqual({ cache: false, rateLimits: false, jobs: false });
    expect(config.namespace).toBe('erp:test:v1');
  });

  it('requires explicit ERP-specific URLs and protects feature dependencies', () => {
    expect(() => loadRedisConfig(env({ ERP_REDIS_ENABLED: 'true' }))).toThrow(/At least one/);
    expect(() => loadRedisConfig(env({ ERP_REDIS_CACHE_ENABLED: 'true' }))).toThrow(/ERP_REDIS_ENABLED/);
    expect(() => loadRedisConfig(env({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_QUEUE_URL: queueUrl,
      ERP_REDIS_CACHE_ENABLED: 'true',
    }))).toThrow(/ERP_REDIS_CACHE_URL/);
    expect(() => loadRedisConfig(env({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_CACHE_URL: cacheUrl,
      ERP_REDIS_JOBS_ENABLED: 'true',
    }))).toThrow(/ERP_REDIS_QUEUE_URL/);
  });

  it('validates URLs and timeouts without exposing secrets in errors', () => {
    for (const badUrl of [
      'http://127.0.0.1:6382',
      'redis://127.0.0.1:6382/0?password=secret',
      'redis://127.0.0.1:6382/nope',
    ]) {
      expect(() => loadRedisConfig(env({
        ERP_REDIS_ENABLED: 'true', ERP_REDIS_CACHE_URL: badUrl,
      }))).toThrow(/Invalid Redis/);
    }
    expect(() => loadRedisConfig(env({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_CACHE_URL: cacheUrl,
      ERP_REDIS_CONNECT_TIMEOUT_MS: '20000',
    }))).toThrow(/timeout/);
    expect(() => loadRedisConfig(env({ ERP_REDIS_ENABLED: 'maybe' }))).toThrow(/boolean/);
  });

  it('namespaces keys and queues independently of other applications', () => {
    const config = loadRedisConfig(env({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_CACHE_URL: cacheUrl,
      ERP_REDIS_NAMESPACE: 'erp:staging:v1',
    }));
    expect(redisKey(config, 'cache', 'workspace:42', 'dashboard')).toBe(
      'erp:staging:v1:cache:workspace%3A42:dashboard',
    );
    expect(redisQueuePrefix(config)).toBe('erp:staging:v1:jobs');
    expect(() => redisKey(config, 'cache', '')).toThrow(/segment/);
    expect(() => loadRedisConfig(env({ ERP_REDIS_NAMESPACE: 'menuminute:production' }))).toThrow(/ERP_REDIS_NAMESPACE/);
  });

  it('returns disabled health without attempting any connections', async () => {
    let calls = 0;
    const status = await getRedisHealth(env(), async () => { calls++; return 3; });
    expect(status.status).toBe('disabled');
    expect(calls).toBe(0);
  });

  it('probes independently and redacts connection details', async () => {
    const status = await getRedisHealth(env({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_CACHE_URL: cacheUrl,
      ERP_REDIS_QUEUE_URL: queueUrl,
    }), async (purpose) => {
      if (purpose === 'queue') throw new Error('password leaked by provider');
      return 7;
    });
    expect(status.status).toBe('unavailable');
    expect(status.connections.cache).toEqual({ status: 'ready', latencyMs: 7 });
    expect(status.connections.queue).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(status)).not.toContain('not-a-real-password');
    expect(JSON.stringify(status)).not.toContain('leaked by provider');
  });

  it('returns a safe misconfiguration result', async () => {
    const health = await getRedisHealth(env({ ERP_REDIS_ENABLED: 'true' }));
    expect(health.status).toBe('misconfigured');
    expect(health.code).toBe('INVALID_CONFIGURATION');
  });
});
