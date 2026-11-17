import "server-only";
import { createHash } from "crypto";
import { clearRedisRateLimit, redisRateLimit } from "@/lib/redis/rate-limit";

type Bucket = { count: number; resetAt: number };
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const OUTAGE_RETRY_SECONDS = 30;

function store() {
  const g = globalThis as typeof globalThis & { __passwordAuthRateLimit?: Map<string, Bucket> };
  if (!g.__passwordAuthRateLimit) g.__passwordAuthRateLimit = new Map();
  return g.__passwordAuthRateLimit;
}

export function hashRateLimitValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

/** Auth endpoints fail closed on Redis outage when distributed mode is enabled. */
export async function checkPasswordAuthRateLimit(key: string): Promise<{
  ok: boolean;
  retryAfterSeconds: number;
}> {
  try {
    const distributed = await redisRateLimit('auth', key, MAX_ATTEMPTS, WINDOW_MS, 'peek');
    if (distributed) return {
      ok: distributed.ok,
      retryAfterSeconds: distributed.ok ? 0 : Math.max(1, Math.ceil(distributed.retryAfterMs / 1000)),
    };
  } catch {
    return { ok: false, retryAfterSeconds: OUTAGE_RETRY_SECONDS };
  }
  const now = Date.now();
  const buckets = store();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSeconds: 0 };
  }
  if (current.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

export async function recordPasswordAuthFailure(key: string) {
  try {
    const distributed = await redisRateLimit('auth', key, MAX_ATTEMPTS, WINDOW_MS, 'failure');
    if (distributed) return {
      count: distributed.count,
      retryAfterSeconds: Math.max(1, Math.ceil(distributed.retryAfterMs / 1000)),
    };
  } catch {
    // Failure to record never grants access: subsequent checks fail closed until
    // Redis becomes available again. Avoid exposing Redis errors to attackers.
    return { count: MAX_ATTEMPTS, retryAfterSeconds: OUTAGE_RETRY_SECONDS };
  }
  const now = Date.now();
  const buckets = store();
  const current = buckets.get(key);
  const next = current && current.resetAt > now ? current : { count: 0, resetAt: now + WINDOW_MS };
  next.count += 1;
  buckets.set(key, next);
  return { count: next.count, retryAfterSeconds: Math.ceil((next.resetAt - now) / 1000) };
}

export async function clearPasswordAuthRateLimit(key: string) {
  try {
    if (await clearRedisRateLimit('auth', key)) {
      store().delete(key);
      return;
    }
  } catch {
    // A successful login should not become a 500 solely because the limiter's
    // counter cleanup failed; the next authentication check fails closed.
  }
  store().delete(key);
}
