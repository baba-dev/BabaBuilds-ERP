import 'server-only';

import { createHash } from 'node:crypto';
import { getRedisClient } from '@/lib/redis/client';
import { loadRedisConfig, redisKey } from '@/lib/redis/config';

export type RedisRateLimitResult = {
  ok: boolean;
  count: number;
  retryAfterMs: number;
};

export type RedisRateLimitAction = 'hit' | 'peek' | 'failure';

/**
 * Atomic fixed-window limiter. A peek never creates a bucket or spends quota.
 * A hit spends one unit only if the bucket is below its cap.
 * A failure records an authentication failure even when the bucket is blocked.
 *
 * Redis computes TTL and counts in the same script, so parallel requests on
 * independent ERP workers cannot race past the limit.
 */
export const FIXED_WINDOW_LUA = [
  "local action = ARGV[1]",
  "local maximum = tonumber(ARGV[2])",
  "local window = tonumber(ARGV[3])",
  "local current = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if ttl <= 0 then",
  "  current = 0",
  "  ttl = window",
  "end",
  "if action == 'peek' then",
  "  if current >= maximum then return {0, current, ttl} end",
  "  return {1, current, ttl}",
  "end",
  "if action == 'hit' and current >= maximum then",
  "  return {0, current, ttl}",
  "end",
  "if current == 0 then",
  "  redis.call('SET', KEYS[1], 1, 'PX', window)",
  "  current = 1",
  "  ttl = window",
  "else",
  "  current = redis.call('INCR', KEYS[1])",
  "end",
  "if current > maximum then return {0, current, ttl} end",
  "return {1, current, ttl}",
].join('\n');

export function validateLimit(max: number, windowMs: number): void {
  if (!Number.isSafeInteger(max) || max < 1 || max > 1_000_000 ||
      !Number.isSafeInteger(windowMs) || windowMs < 100 || windowMs > 86_400_000) {
    throw new Error('Invalid rate-limit policy');
  }
}

/** Domain is a fixed code-owned identifier; identity may contain untrusted tokens/IPs. */
export function rateLimitIdentity(domain: string, identity: string): string {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(domain)) throw new Error('Invalid rate-limit domain');
  return createHash('sha256').update(domain).update('\0').update(identity).digest('hex');
}

export async function redisRateLimit(
  domain: 'route' | 'generic' | 'auth',
  identity: string,
  max: number,
  windowMs: number,
  action: RedisRateLimitAction = 'hit',
): Promise<RedisRateLimitResult | null> {
  const config = loadRedisConfig();
  if (!config.features.rateLimits) return null;
  validateLimit(max, windowMs);
  const client = await getRedisClient('cache', config);
  if (!client) throw new Error('REDIS_RATE_LIMIT_UNAVAILABLE');
  const key = redisKey(config, 'rate-limit', domain, rateLimitIdentity(domain, identity));
  const raw: unknown = await client.eval(FIXED_WINDOW_LUA, 1, key, action, max, windowMs);
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error('REDIS_RATE_LIMIT_INVALID_RESULT');
  const [allowed, count, ttl] = raw.map(Number);
  if (![allowed, count, ttl].every(Number.isSafeInteger) || ![0, 1].includes(allowed) ||
      count < 0 || ttl < 0 || ttl > windowMs) {
    throw new Error('REDIS_RATE_LIMIT_INVALID_RESULT');
  }
  return { ok: allowed === 1, count, retryAfterMs: Math.max(0, ttl) };
}

export async function clearRedisRateLimit(
  domain: 'auth',
  identity: string,
): Promise<boolean> {
  const config = loadRedisConfig();
  if (!config.features.rateLimits) return false;
  const client = await getRedisClient('cache', config);
  if (!client) throw new Error('REDIS_RATE_LIMIT_UNAVAILABLE');
  const key = redisKey(config, 'rate-limit', domain, rateLimitIdentity(domain, identity));
  await client.del(key);
  return true;
}
