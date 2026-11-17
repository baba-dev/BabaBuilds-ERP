/**
 * Redis foundation configuration. Pure and side-effect free: importing this file
 * never creates a connection or enables Redis for existing ERP workflows.
 */
export type RedisPurpose = 'cache' | 'queue' | 'dataCache';
export type RedisFeature = 'cache' | 'rateLimits' | 'jobs' | 'dashboardCache' | 'reportCache';

export type RedisConfig = {
  enabled: boolean;
  namespace: string;
  urls: Record<RedisPurpose, string | null>;
  features: Record<RedisFeature, boolean>;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
};

const PURPOSES = ['cache', 'queue', 'dataCache'] as const;

function flag(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error(`Invalid boolean Redis flag: ${key}`);
}

function timeout(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 100 || number > 10_000) {
    throw new Error(`Invalid Redis timeout: ${key} (must be 100-10000 ms)`);
  }
  return number;
}

function endpoint(env: NodeJS.ProcessEnv, key: string): string | null {
  const raw = env[key]?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid Redis endpoint: ${key}`);
  }
  if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname ||
      url.search || url.hash) {
    throw new Error(`Invalid Redis endpoint: ${key}`);
  }
  if (url.pathname && !/^\/(?:[0-9]{1,2})?$/.test(url.pathname)) {
    throw new Error(`Invalid Redis DB index: ${key}`);
  }
  // Never include URL text or credential material in configuration errors.
  return raw;
}

export function loadRedisConfig(env: NodeJS.ProcessEnv = process.env): RedisConfig {
  const enabled = flag(env, 'ERP_REDIS_ENABLED');
  const requested = {
    cache: flag(env, 'ERP_REDIS_CACHE_ENABLED'),
    rateLimits: flag(env, 'ERP_REDIS_RATE_LIMIT_ENABLED'),
    jobs: flag(env, 'ERP_REDIS_JOBS_ENABLED'),
    dashboardCache: flag(env, 'ERP_REDIS_DASHBOARD_CACHE_ENABLED'),
    reportCache: flag(env, 'ERP_REDIS_REPORT_CACHE_ENABLED'),
  };

  if (!enabled && Object.values(requested).some(Boolean)) {
    throw new Error('ERP_REDIS_ENABLED must be true before enabling Redis features');
  }

  const namespace = env.ERP_REDIS_NAMESPACE?.trim() ||
    `erp:${env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development'}:v1`;
  if (!/^erp:[a-z0-9][a-z0-9._:-]{2,60}$/.test(namespace)) {
    throw new Error('Invalid ERP_REDIS_NAMESPACE (must start with erp:)');
  }

  const urls = enabled ? {
    cache: endpoint(env, 'ERP_REDIS_CACHE_URL'),
    queue: endpoint(env, 'ERP_REDIS_QUEUE_URL'),
    dataCache: endpoint(env, 'ERP_REDIS_DATA_CACHE_URL'),
  } : { cache: null, queue: null, dataCache: null };

  if (enabled && PURPOSES.every((purpose) => !urls[purpose])) {
    throw new Error('At least one ERP Redis endpoint is required when enabled');
  }
  if (requested.rateLimits && !urls.cache) {
    throw new Error('ERP_REDIS_CACHE_URL is required for rate limits');
  }
  if (requested.cache && !urls.dataCache) {
    throw new Error('ERP_REDIS_DATA_CACHE_URL is required for data caching');
  }
  if ((requested.dashboardCache || requested.reportCache) && !requested.cache) {
    throw new Error('ERP_REDIS_CACHE_ENABLED must be true before dashboard or report caching');
  }
  if (requested.rateLimits && !urls.queue) {
    throw new Error('ERP_REDIS_QUEUE_URL is required for authentication rate limits');
  }
  if (requested.jobs && !urls.queue) {
    throw new Error('ERP_REDIS_QUEUE_URL is required for background jobs');
  }

  return {
    enabled,
    namespace,
    urls,
    features: requested,
    connectTimeoutMs: timeout(env, 'ERP_REDIS_CONNECT_TIMEOUT_MS', 1_500),
    commandTimeoutMs: timeout(env, 'ERP_REDIS_COMMAND_TIMEOUT_MS', 1_500),
  };
}

export function redisKey(
  config: Pick<RedisConfig, 'namespace'>,
  category: 'cache' | 'rate-limit' | 'lock' | 'health',
  ...segments: string[]
): string {
  if (segments.some((part) => part.length === 0 || part.length > 256)) {
    throw new Error('Invalid Redis key segment');
  }
  return [config.namespace, category, ...segments.map(encodeURIComponent)].join(':');
}

/** Use BullMQ's own prefix option, never ioredis's incompatible keyPrefix. */
export function redisQueuePrefix(config: Pick<RedisConfig, 'namespace'>): string {
  return `${config.namespace}:jobs`;
}
