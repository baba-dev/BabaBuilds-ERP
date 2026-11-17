import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { redisRateLimit } from '@/lib/redis/rate-limit';

type Bucket = { count: number; resetAt: number };

type RateLimitEvent = {
  key: string;
  route: string;
  scope: string;
  sourceIp: string;
  retryAfterSeconds: number;
  at: string;
};

type IpConcentrationRecord = {
  sourceIp: string;
  hits: number;
};

const MAX_EVENTS = 5000;

function getStore() {
  const globalStore = globalThis as typeof globalThis & {
    __routeRateLimitBuckets?: Map<string, Bucket>;
    __routeRateLimitEvents?: RateLimitEvent[];
  };

  if (!globalStore.__routeRateLimitBuckets) {
    globalStore.__routeRateLimitBuckets = new Map<string, Bucket>();
  }

  if (!globalStore.__routeRateLimitEvents) {
    globalStore.__routeRateLimitEvents = [];
  }

  return {
    buckets: globalStore.__routeRateLimitBuckets,
    events: globalStore.__routeRateLimitEvents,
  };
}

export function getRequestIp(request: Request): string {
  return getClientIp(request);
}

export async function enforceRouteRateLimit(input: {
  request: Request;
  route: string;
  scope: string;
  max: number;
  windowMs: number;
}): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const sourceIp = getRequestIp(input.request);
  const key = input.route + ':' + input.scope + ':' + sourceIp;
  const now = Date.now();
  const { buckets, events } = getStore();
  let retryAfterSeconds = 0;

  // Redis is authoritative when explicitly enabled and healthy.
  // When unavailable, preserve the original bounded per-process limiter rather
  // than making every ERP business operation fail during a cache outage.
  let distributed = null;
  try {
    distributed = await redisRateLimit('route', key, input.max, input.windowMs);
  } catch {
    // Never log IPs, workspace identifiers, or Redis credentials.
    warnRedisFallback();
  }

  if (distributed) {
    if (distributed.ok) return { ok: true };
    retryAfterSeconds = Math.max(1, Math.ceil(distributed.retryAfterMs / 1000));
  } else {
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + input.windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count < input.max) {
      bucket.count += 1;
      return { ok: true };
    }
    retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }

  events.push({
    key,
    route: input.route,
    scope: input.scope,
    sourceIp,
    retryAfterSeconds,
    at: new Date().toISOString(),
  });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Too many requests for this endpoint.',
        message: 'Please wait a bit before trying again.',
        retryAfterSeconds,
        hint: 'Reduce request frequency or retry after the suggested delay.',
      },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    ),
  };
}

let lastRedisWarningAt = 0;
function warnRedisFallback() {
  const now = Date.now();
  if (now - lastRedisWarningAt >= 60_000) {
    lastRedisWarningAt = now;
    console.warn('[redis-rate-limit] unavailable; local route limiter retained');
  }
}

export function getRouteRateLimitMetrics() {
  const { events } = getStore();
  return [...events];
}

export function getRouteRateLimitIpConcentration(topN = 10): IpConcentrationRecord[] {
  const counters = new Map<string, number>();

  for (const event of getStore().events) {
    counters.set(event.sourceIp, (counters.get(event.sourceIp) || 0) + 1);
  }

  return [...counters.entries()]
    .map(([sourceIp, hits]) => ({ sourceIp, hits }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, topN);
}
