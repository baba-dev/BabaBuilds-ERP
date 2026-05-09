import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/request-ip';
import { SERVICE_WORKER_PATH, serviceWorkerHeaders } from '@/lib/service-worker/headers';

type DecisionCacheEntry = {
  until: number;
  blocked: boolean;
};

type ProxyMetrics = {
  cacheHit: number;
  cacheMiss: number;
  lapiCall: number;
  lapiError: number;
  circuitOpenSkips: number;
};

const DECISION_CACHE_TTL_MS = 30_000;
const LAPI_TIMEOUT_MS = 200;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_OPEN_MS = 60_000;
const METRICS_LOG_EVERY = 100;

const decisionCache = new Map<string, DecisionCacheEntry>();
const metrics: ProxyMetrics = {
  cacheHit: 0,
  cacheMiss: 0,
  lapiCall: 0,
  lapiError: 0,
  circuitOpenSkips: 0,
};

const circuitBreaker = {
  failures: 0,
  openUntil: 0,
};

function withServiceWorkerHeaders(response: NextResponse): NextResponse {
  for (const { key, value } of serviceWorkerHeaders) {
    response.headers.set(key, value);
  }

  return response;
}

function nextResponseFor(request: NextRequest): NextResponse {
  const response = NextResponse.next();

  if (request.nextUrl.pathname === SERVICE_WORKER_PATH) {
    return withServiceWorkerHeaders(response);
  }

  return response;
}

function normalizeClientIp(request: NextRequest): string {
  const ip = getClientIp(request);
  return ip === 'unknown' ? '127.0.0.1' : ip;
}

function maybeLogMetrics() {
  const totalEvents =
    metrics.cacheHit +
    metrics.cacheMiss +
    metrics.lapiCall +
    metrics.lapiError +
    metrics.circuitOpenSkips;

  if (totalEvents > 0 && totalEvents % METRICS_LOG_EVERY === 0) {
    console.info('[CrowdSecProxyMetrics]', {
      ...metrics,
      cacheSize: decisionCache.size,
      circuitOpen: Date.now() < circuitBreaker.openUntil,
      circuitOpenUntil: circuitBreaker.openUntil,
    });
  }
}

// Note: The user hasn't generated the CrowdSec keys yet. We will fail open if no key is present.
export async function proxy(request: NextRequest) {
  const bouncerUrl = process.env.CROWDSEC_LAPI_URL || 'http://localhost:8080';
  const apiKey = process.env.CROWDSEC_BOUNCER_KEY;

  if (apiKey) {
    const ip = normalizeClientIp(request);
    const now = Date.now();
    const cached = decisionCache.get(ip);
    if (cached && cached.until > now) {
      metrics.cacheHit += 1;
      maybeLogMetrics();
      if (cached.blocked) {
        return new NextResponse('Forbidden - Access blocked by IPS.', { status: 403 });
      }

      return nextResponseFor(request);
    }

    metrics.cacheMiss += 1;
    if (cached && cached.until <= now) {
      decisionCache.delete(ip);
    }

    const isCircuitOpen = now < circuitBreaker.openUntil;
    if (isCircuitOpen) {
      metrics.circuitOpenSkips += 1;
      maybeLogMetrics();
      return nextResponseFor(request);
    }

    try {
      metrics.lapiCall += 1;
      // Simple manual fetch to CrowdSec LAPI for Bouncer verification
      const res = await fetch(`${bouncerUrl}/v1/decisions?ip=${ip}`, {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        // Don't hang the app if CrowdSec is down
        signal: AbortSignal.timeout(LAPI_TIMEOUT_MS),
      });

      if (res.ok) {
        const decisions = await res.json();
        // If there's an active decision to ban this IP
        if (decisions && decisions.length > 0) {
          const ban = decisions.find((d: any) => d.type === 'ban');
          const blocked = Boolean(ban);
          decisionCache.set(ip, { blocked, until: Date.now() + DECISION_CACHE_TTL_MS });

          circuitBreaker.failures = 0;
          circuitBreaker.openUntil = 0;
          maybeLogMetrics();

          if (blocked) {
            return new NextResponse('Forbidden - Access blocked by IPS.', { status: 403 });
          }
        } else {
          decisionCache.set(ip, { blocked: false, until: Date.now() + DECISION_CACHE_TTL_MS });
        }
      } else {
        metrics.lapiError += 1;
        circuitBreaker.failures += 1;
      }
    } catch (e) {
      metrics.lapiError += 1;
      circuitBreaker.failures += 1;
      // Fail open if CrowdSec LAPI is unreachable to avoid taking down the SaaS
      console.error('CrowdSec Middleware Error:', e);
    } finally {
      if (circuitBreaker.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
        circuitBreaker.openUntil = Date.now() + CIRCUIT_BREAKER_OPEN_MS;
        circuitBreaker.failures = 0;
      }
      maybeLogMetrics();
    }
  }

  return nextResponseFor(request);
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|logos|receipts|favicon.ico).*)',
    '/api/auth/:path*',
    '/api/webhooks/:path*',
    '/api/invoices/:path*/pay/:path*',
    '/api/documents/upload/:path*',
  ],
};
