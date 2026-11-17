import 'server-only';

import Redis from 'ioredis';
import {
  loadRedisConfig,
  type RedisConfig,
  type RedisPurpose,
} from './config';

type Connection = {
  url: string;
  client: Redis;
  connecting: Promise<void> | null;
};

const connections: Partial<Record<RedisPurpose, Connection>> = {};

function createConnection(url: string, config: RedisConfig): Connection {
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: config.connectTimeoutMs,
    commandTimeout: config.commandTimeoutMs,
    retryStrategy: () => null,
  });

  // ioredis emits an error event for connection failures. A listener prevents
  // unhandled events; diagnostics report only safe status codes, never URLs.
  client.on('error', () => undefined);
  return { url, client, connecting: null };
}

/**
 * Lazily opens at most one bounded, fail-fast connection per purpose and process.
 * Neither importing this module nor disabling the feature creates a socket.
 * This is a request/health client, NOT a BullMQ worker connection (workers need
 * maxRetriesPerRequest=null and a separate lifecycle).
 */
export async function getRedisClient(
  purpose: RedisPurpose,
  config: RedisConfig = loadRedisConfig(),
): Promise<Redis | null> {
  const url = config.enabled ? config.urls[purpose] : null;
  if (!url) return null;

  let entry = connections[purpose];
  if (entry && (entry.url !== url || entry.client.status === 'end')) {
    entry.client.disconnect();
    delete connections[purpose];
    entry = undefined;
  }
  if (!entry) {
    entry = createConnection(url, config);
    connections[purpose] = entry;
  }

  if (entry.client.status === 'ready') return entry.client;
  if (!entry.connecting) {
    const target = entry;
    target.connecting = target.client.connect().then(
      () => undefined,
      () => {
        if (connections[purpose] === target) delete connections[purpose];
        target.client.disconnect();
        throw new Error('REDIS_CONNECT_FAILED');
      },
    ).finally(() => {
      target.connecting = null;
    });
  }
  await entry.connecting;
  return entry.client;
}

export async function pingRedis(
  purpose: RedisPurpose,
  config: RedisConfig = loadRedisConfig(),
): Promise<number> {
  const started = performance.now();
  const client = await getRedisClient(purpose, config);
  if (!client) throw new Error('REDIS_NOT_CONFIGURED');
  try {
    if (await client.ping() !== 'PONG') throw new Error('REDIS_INVALID_PONG');
  } catch {
    throw new Error('REDIS_PING_FAILED');
  }
  return Math.max(0, Math.round(performance.now() - started));
}

/** Disconnect on shutdown in a future worker process, or during test teardown. */
export function disconnectRedisClients(): void {
  for (const purpose of ['cache', 'queue'] as const) {
    connections[purpose]?.client.disconnect();
    delete connections[purpose];
  }
}
