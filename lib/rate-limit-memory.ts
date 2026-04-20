type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/**
 * Simple fixed-window rate limiter (per process). Suitable for single-node or dev;
 * use Redis in production for multi-instance.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterMs: number } {
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
