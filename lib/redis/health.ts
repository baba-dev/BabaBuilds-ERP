import 'server-only';

import { pingRedis } from './client';
import { loadRedisConfig, type RedisConfig, type RedisPurpose } from './config';

export type RedisHealth = {
  status: 'disabled' | 'ready' | 'unavailable' | 'misconfigured';
  enabled: boolean;
  namespace: string | null;
  features: RedisConfig['features'];
  connections: Record<RedisPurpose, {
    status: 'not-configured' | 'ready' | 'unavailable';
    latencyMs?: number;
  }>;
  code?: 'INVALID_CONFIGURATION';
};

const notConfigured = () => ({ status: 'not-configured' as const });

/**
 * Read-only diagnostics, intentionally safe to expose to verified superadmins.
 * Never returns a hostname, URL, password, ACL username, or raw driver error.
 * Redis failure does not affect ERP's main PostgreSQL readiness.
 */
export async function getRedisHealth(
  env: NodeJS.ProcessEnv = process.env,
  probe: (purpose: RedisPurpose, config: RedisConfig) => Promise<number> = pingRedis,
): Promise<RedisHealth> {
  let config: RedisConfig;
  try {
    config = loadRedisConfig(env);
  } catch {
    return {
      status: 'misconfigured',
      enabled: env.ERP_REDIS_ENABLED === 'true',
      namespace: null,
      features: { cache: false, rateLimits: false, jobs: false, dashboardCache: false, reportCache: false },
      connections: { cache: notConfigured(), queue: notConfigured(), dataCache: notConfigured() },
      code: 'INVALID_CONFIGURATION',
    };
  }

  const connections: RedisHealth['connections'] = {
    cache: notConfigured(),
    queue: notConfigured(),
    dataCache: notConfigured(),
  };

  if (!config.enabled) {
    return { status: 'disabled', enabled: false, namespace: config.namespace, features: config.features, connections };
  }

  await Promise.all((['cache', 'queue', 'dataCache'] as const).map(async (purpose) => {
    if (!config.urls[purpose]) return;
    try {
      const latencyMs = await probe(purpose, config);
      connections[purpose] = { status: 'ready', latencyMs };
    } catch {
      connections[purpose] = { status: 'unavailable' };
    }
  }));

  return {
    status: Object.values(connections).some((connection) => connection.status === 'unavailable')
      ? 'unavailable' : 'ready',
    enabled: true,
    namespace: config.namespace,
    features: config.features,
    connections,
  };
}
