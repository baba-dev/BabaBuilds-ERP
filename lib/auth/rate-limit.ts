import "server-only";
import { createHash } from "crypto";

type Bucket = { count: number; resetAt: number };
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function store() {
  const g = globalThis as typeof globalThis & { __passwordAuthRateLimit?: Map<string, Bucket> };
  if (!g.__passwordAuthRateLimit) g.__passwordAuthRateLimit = new Map();
  return g.__passwordAuthRateLimit;
}

export function hashRateLimitValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function checkPasswordAuthRateLimit(key: string) {
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

export function recordPasswordAuthFailure(key: string) {
  const now = Date.now();
  const buckets = store();
  const current = buckets.get(key);
  const next = current && current.resetAt > now ? current : { count: 0, resetAt: now + WINDOW_MS };
  next.count += 1;
  buckets.set(key, next);
  return { count: next.count, retryAfterSeconds: Math.ceil((next.resetAt - now) / 1000) };
}

export function clearPasswordAuthRateLimit(key: string) {
  store().delete(key);
}
