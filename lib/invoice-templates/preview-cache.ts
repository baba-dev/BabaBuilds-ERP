import "server-only";
import { createHash } from "node:crypto";
import { getRedisClient } from "@/lib/redis/client";
import { loadRedisConfig, redisKey } from "@/lib/redis/config";
import type { PDFParams } from "@/lib/invoice/build-invoice-view-model";

/** Bump whenever a template, the kit or a bundled font changes, so cached previews are never stale. */
export const TEMPLATE_CACHE_VERSION = "t1";

const REDIS_TTL_MS = 10 * 60 * 1000;
const MAX_REDIS_BYTES = 600 * 1024;
const LOCAL_MAX_ENTRIES = 20;
const LOCAL_TTL_MS = 5 * 60 * 1000;
const LOCK_PX = 15_000;
const LOCK_WAIT_MS = 3_000;
const LOCK_POLL_MS = 150;

export type PreviewCacheState = "HIT" | "MISS" | "BYPASS";

const stable = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = stable(v);
    }
    return out;
  }
  return value;
};

export function previewCacheKey(args: { workspaceId: string; design: string; params: PDFParams }): string {
  const body = JSON.stringify(stable([TEMPLATE_CACHE_VERSION, args.workspaceId, args.design, args.params]));
  return createHash("sha256").update(body).digest("hex");
}

const local = new Map<string, { bytes: Uint8Array; expires: number }>();
const inflight = new Map<string, Promise<{ bytes: Uint8Array; state: PreviewCacheState }>>();

function localGet(key: string): Uint8Array | null {
  const hit = local.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    local.delete(key);
    return null;
  }
  local.delete(key); // refresh recency
  local.set(key, hit);
  return hit.bytes;
}

function localSet(key: string, bytes: Uint8Array): void {
  local.delete(key);
  local.set(key, { bytes, expires: Date.now() + LOCAL_TTL_MS });
  while (local.size > LOCAL_MAX_ENTRIES) {
    const oldest = local.keys().next().value;
    if (oldest === undefined) break;
    local.delete(oldest);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Test hook: forget everything held in this process. */
export function resetPreviewCacheForTests(): void {
  local.clear();
  inflight.clear();
}

/**
 * Returns a preview PDF, rendering only when nobody has. Order: in-process LRU, Redis, render. Identical concurrent
 * requests share one render here, and a short Redis lock lets other workers wait for it. Any Redis problem simply
 * means rendering (state BYPASS); the cache can never make a preview fail.
 */
export function getOrRenderPreview(args: {
  workspaceId: string;
  design: string;
  params: PDFParams;
  render: () => Promise<Uint8Array>;
}): Promise<{ bytes: Uint8Array; state: PreviewCacheState }> {
  const key = previewCacheKey(args);
  const cached = localGet(key);
  if (cached) return Promise.resolve({ bytes: cached, state: "HIT" });
  const running = inflight.get(key);
  if (running) return running;

  const work = (async () => {
    const config = loadRedisConfig();
    const useRedis = config.enabled && config.features.cache;
    let state: PreviewCacheState = useRedis ? "MISS" : "BYPASS";
    let lockHeld = false;
    let client: Awaited<ReturnType<typeof getRedisClient>> = null;
    const dataKey = redisKey(config, "cache", "invoice-preview", key);
    const lockKey = redisKey(config, "lock", "invoice-preview", key);

    if (useRedis) {
      try {
        client = await getRedisClient("dataCache", config);
        if (client) {
          const stored = await client.getBuffer(dataKey);
          if (stored) {
            const bytes = new Uint8Array(stored);
            localSet(key, bytes);
            return { bytes, state: "HIT" as const };
          }
          lockHeld = (await client.set(lockKey, "1", "PX", LOCK_PX, "NX")) === "OK";
          if (!lockHeld) {
            // Another worker is rendering this exact preview: wait for it, then fall through and render ourselves.
            const deadline = Date.now() + LOCK_WAIT_MS;
            while (Date.now() < deadline) {
              await sleep(LOCK_POLL_MS);
              const arrived = await client.getBuffer(dataKey);
              if (arrived) {
                const bytes = new Uint8Array(arrived);
                localSet(key, bytes);
                return { bytes, state: "HIT" as const };
              }
            }
          }
        } else {
          state = "BYPASS";
        }
      } catch {
        state = "BYPASS";
        client = null;
        lockHeld = false;
      }
    }

    try {
      const bytes = await args.render();
      localSet(key, bytes);
      if (client && bytes.byteLength <= MAX_REDIS_BYTES) {
        try {
          await client.set(dataKey, Buffer.from(bytes), "PX", REDIS_TTL_MS);
        } catch {
          state = "BYPASS";
        }
      }
      return { bytes, state };
    } finally {
      if (client && lockHeld) await client.del(lockKey).catch(() => undefined);
    }
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, work);
  return work;
}
