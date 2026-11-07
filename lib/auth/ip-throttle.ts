import "server-only";

type Bucket = { count: number; resetAt: number };

function buckets() {
  const g = globalThis as typeof globalThis & { __authIpThrottle?: Map<string, Bucket> };
  if (!g.__authIpThrottle) g.__authIpThrottle = new Map();
  return g.__authIpThrottle;
}

/**
 * Small fixed-window limiter for unauthenticated auth helper endpoints.
 * In-memory (per instance) — a speed bump against scripted enumeration, not a replacement for
 * edge rate limiting.
 */
export function consumeAuthThrottle(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const store = buckets();

  if (store.size > 5_000) {
    for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  }

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  if (current.count > max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}
