import "server-only";
import { createHash } from "crypto";
import { clearRedisRateLimit, redisRateLimit } from "@/lib/redis/rate-limit";

type Bucket = { count: number; resetAt: number };
type Decision = { ok: boolean; retryAfterSeconds: number };
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

/**
 * What authentication limits do when distributed (Redis) counters are enabled but unreachable.
 *
 * - `fail-closed` (default): deny every attempt. Safe against brute force, but a Redis outage then
 *   locks every user out, administrators included.
 * - `local`: break-glass. Keep enforcing the same 5-attempts/15-minute limit with the bounded
 *   per-process counter, so sign-in keeps working during the outage. Counters are not shared
 *   between ERP processes in this mode, so the effective cap is per process.
 *
 * Any unrecognised value fails closed.
 */
export function authOutagePolicy(
  raw: string | undefined = process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY,
): "fail-closed" | "local" {
  return raw?.trim().toLowerCase() === "local" ? "local" : "fail-closed";
}

const OUTAGE_DENIED: Decision = { ok: false, retryAfterSeconds: OUTAGE_RETRY_SECONDS };

function localPeek(key: string): Decision {
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

/** Synchronous (no await between the check and the increment), so it is atomic within a process. */
function localReserve(key: string): Decision {
  const now = Date.now();
  const buckets = store();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Auth endpoints fail closed on Redis outage when distributed mode is enabled (see authOutagePolicy). */
export async function checkPasswordAuthRateLimit(key: string): Promise<Decision> {
  try {
    const distributed = await redisRateLimit('auth', key, MAX_ATTEMPTS, WINDOW_MS, 'peek');
    if (distributed) return {
      ok: distributed.ok,
      retryAfterSeconds: distributed.ok ? 0 : Math.max(1, Math.ceil(distributed.retryAfterMs / 1000)),
    };
  } catch {
    if (authOutagePolicy() === "fail-closed") return OUTAGE_DENIED;
  }
  return localPeek(key);
}

/**
 * Atomically check AND spend one attempt before the credential is verified.
 *
 * `checkPasswordAuthRateLimit` followed by `recordPasswordAuthFailure` is check-then-act: a burst of
 * parallel guesses all pass the check while the slow password hash runs, and only then record their
 * failures, so an attacker gets far more than 5 guesses per window. Reserving up front closes that
 * race. Callers must not also call `recordPasswordAuthFailure` for the same attempt, and must call
 * `clearPasswordAuthRateLimit` on success so legitimate sign-ins do not consume quota.
 */
export async function reservePasswordAuthAttempt(key: string): Promise<Decision> {
  try {
    const distributed = await redisRateLimit('auth', key, MAX_ATTEMPTS, WINDOW_MS, 'hit');
    if (distributed) return {
      ok: distributed.ok,
      retryAfterSeconds: distributed.ok ? 0 : Math.max(1, Math.ceil(distributed.retryAfterMs / 1000)),
    };
  } catch {
    if (authOutagePolicy() === "fail-closed") return OUTAGE_DENIED;
  }
  return localReserve(key);
}

export async function recordPasswordAuthFailure(key: string) {
  try {
    const distributed = await redisRateLimit('auth', key, MAX_ATTEMPTS, WINDOW_MS, 'failure');
    if (distributed) return {
      count: distributed.count,
      retryAfterSeconds: Math.max(1, Math.ceil(distributed.retryAfterMs / 1000)),
    };
  } catch {
    // Failure to record never grants access: in fail-closed mode subsequent checks are denied until
    // Redis becomes available again. Avoid exposing Redis errors to attackers.
    if (authOutagePolicy() === "fail-closed") {
      return { count: MAX_ATTEMPTS, retryAfterSeconds: OUTAGE_RETRY_SECONDS };
    }
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
