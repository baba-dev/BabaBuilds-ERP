type DashboardCacheKeyParts = {
  workspaceId: string;
  userId?: string | null;
  fy: string;
  locale?: string | null;
  currency?: string | null;
  segment?: string | null;
  localeCurrencyAffectsPayload?: boolean;
};

type DashboardCacheEntry = {
  payload: unknown;
  createdAt: number;
  expiresAt: number;
};

const MIN_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 120;
const DEFAULT_TTL_SECONDS = 60;

const dashboardCache = new Map<string, DashboardCacheEntry>();
const dashboardCacheIncidentCounters = {
  staleReadBypass: 0,
  invalidationFailures: 0,
  cacheErrors: 0,
};

function normalizeToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getDashboardCacheTtlSeconds(): number {
  const raw = Number(process.env.DASHBOARD_CACHE_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(raw)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(raw)));
}

export function isDashboardCacheEnabled(): boolean {
  return process.env.DASHBOARD_CACHE_ENABLED === 'true';
}

export function buildDashboardCacheKey(parts: DashboardCacheKeyParts): string {
  const segments = [`workspace:${parts.workspaceId}`, `fy:${parts.fy}`];
  const userToken = normalizeToken(parts.userId);
  if (userToken) {
    segments.push(`user:${userToken}`);
  }

  if (parts.localeCurrencyAffectsPayload) {
    const locale = normalizeToken(parts.locale);
    const currency = normalizeToken(parts.currency);

    if (locale) segments.push(`locale:${locale.toLowerCase()}`);
    if (currency) segments.push(`currency:${currency.toUpperCase()}`);
  }

  if (parts.segment) {
    segments.push(`segment:${parts.segment}`);
  }

  return segments.join('|');
}

export function getDashboardCacheEntry(cacheKey: string): DashboardCacheEntry | null {
  const cached = dashboardCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    dashboardCache.delete(cacheKey);
    dashboardCacheIncidentCounters.staleReadBypass += 1;
    return null;
  }

  return cached;
}

export function setDashboardCacheEntry(cacheKey: string, payload: unknown): DashboardCacheEntry {
  const now = Date.now();
  const ttlMs = getDashboardCacheTtlSeconds() * 1000;
  const entry = {
    payload,
    createdAt: now,
    expiresAt: now + ttlMs,
  };

  dashboardCache.set(cacheKey, entry);
  return entry;
}

export function invalidateDashboardCacheForWorkspace(workspaceId: string): void {
  const workspacePrefix = `workspace:${workspaceId}|`;
  for (const key of dashboardCache.keys()) {
    if (key.startsWith(workspacePrefix)) {
      dashboardCache.delete(key);
    }
  }
}

export function noteDashboardCacheIncident(
  type: keyof typeof dashboardCacheIncidentCounters,
  metadata: Record<string, unknown>
): void {
  dashboardCacheIncidentCounters[type] += 1;
  console.warn('[dashboard-cache]', type, {
    ...metadata,
    counters: dashboardCacheIncidentCounters,
  });
}

export function getDashboardCacheMeta(entry: DashboardCacheEntry): { ageSeconds: number; ttlSeconds: number } {
  return {
    ageSeconds: Math.max(0, Math.floor((Date.now() - entry.createdAt) / 1000)),
    ttlSeconds: Math.max(0, Math.ceil((entry.expiresAt - entry.createdAt) / 1000)),
  };
}
