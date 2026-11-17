import { redisRateLimit } from '@/lib/redis/rate-limit';

type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

let lastRedisWarningAt = 0;

/**
 * Existing fixed-window limit semantics, now distributed when enabled.
 * The in-memory limiter remains the safe availability fallback for standard
 * business/public routes; authentication uses a stricter fail-closed policy.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  try {
    const result = await redisRateLimit('generic', key, max, windowMs);
    if (result) {
      return result.ok
        ? { ok: true }
        : { ok: false, retryAfterMs: result.retryAfterMs };
    }
  } catch {
    const now = Date.now();
    if (now - lastRedisWarningAt >= 60_000) {
      lastRedisWarningAt = now;
      console.warn('[redis-rate-limit] unavailable; local generic limiter retained');
    }
  }

  const now = Date.now();
  let b = store.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    store.set(key, b);
  }
  if (b.count >= max) {
    return { ok: false, retryAfterMs: Math.max(0, b.resetAt - now) };
  }
  b.count += 1;
  return { ok: true };
}
