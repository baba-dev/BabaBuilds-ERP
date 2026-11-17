import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const redisRateLimit = vi.hoisted(() => vi.fn());
const clearRedisRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis/rate-limit", () => ({ redisRateLimit, clearRedisRateLimit }));

import {
  authOutagePolicy,
  checkPasswordAuthRateLimit,
  clearPasswordAuthRateLimit,
  recordPasswordAuthFailure,
  reservePasswordAuthAttempt,
} from "@/lib/auth/rate-limit";

const original = process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY;
beforeEach(() => {
  redisRateLimit.mockReset();
  clearRedisRateLimit.mockReset();
  delete process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY;
});
afterEach(() => {
  if (original === undefined) delete process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY;
  else process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY = original;
});

describe("reservePasswordAuthAttempt (Redis disabled: per-process counter)", () => {
  beforeEach(() => {
    redisRateLimit.mockResolvedValue(null);
    clearRedisRateLimit.mockResolvedValue(false);
  });

  it("lets exactly five parallel guesses through, however slow credential verification is", async () => {
    const key = "burst-" + randomUUID();
    const results = await Promise.all(Array.from({ length: 40 }, () => reservePasswordAuthAttempt(key)));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    const denied = results.find((r) => !r.ok)!;
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("the old check-then-record sequence is what let a burst through (documents the race)", async () => {
    const key = "legacy-" + randomUUID();
    const passed = (await Promise.all(Array.from({ length: 40 }, () => checkPasswordAuthRateLimit(key)))).filter((r) => r.ok);
    expect(passed.length).toBe(40); // every parallel caller saw "ok" before any failure was recorded
    await Promise.all(passed.map(() => recordPasswordAuthFailure(key)));
  });

  it("a successful sign-in clears the counter so it never consumes quota", async () => {
    const key = "clear-" + randomUUID();
    for (let i = 0; i < 4; i++) expect((await reservePasswordAuthAttempt(key)).ok).toBe(true);
    await clearPasswordAuthRateLimit(key);
    for (let i = 0; i < 5; i++) expect((await reservePasswordAuthAttempt(key)).ok).toBe(true);
    expect((await reservePasswordAuthAttempt(key)).ok).toBe(false);
  });

  it("keeps counters independent per key", async () => {
    const a = "a-" + randomUUID();
    for (let i = 0; i < 5; i++) await reservePasswordAuthAttempt(a);
    expect((await reservePasswordAuthAttempt(a)).ok).toBe(false);
    expect((await reservePasswordAuthAttempt("b-" + randomUUID())).ok).toBe(true);
  });
});

describe("reservePasswordAuthAttempt (Redis enabled)", () => {
  it("spends a unit with the atomic 'hit' action and reports Redis' retry window", async () => {
    redisRateLimit.mockResolvedValueOnce({ ok: true, count: 1, retryAfterMs: 900_000 });
    expect(await reservePasswordAuthAttempt("k")).toEqual({ ok: true, retryAfterSeconds: 0 });
    expect(redisRateLimit).toHaveBeenCalledWith("auth", "k", 5, 15 * 60 * 1000, "hit");
    redisRateLimit.mockResolvedValueOnce({ ok: false, count: 5, retryAfterMs: 61_500 });
    expect(await reservePasswordAuthAttempt("k")).toEqual({ ok: false, retryAfterSeconds: 62 });
  });
});

describe("Redis outage policy for authentication limits", () => {
  beforeEach(() => {
    redisRateLimit.mockRejectedValue(new Error("REDIS_RATE_LIMIT_UNAVAILABLE"));
    clearRedisRateLimit.mockRejectedValue(new Error("REDIS_RATE_LIMIT_UNAVAILABLE"));
  });

  it("parses the policy and fails closed on anything unrecognised", () => {
    expect(authOutagePolicy(undefined)).toBe("fail-closed");
    expect(authOutagePolicy("")).toBe("fail-closed");
    expect(authOutagePolicy("open")).toBe("fail-closed");
    expect(authOutagePolicy("fail-closed")).toBe("fail-closed");
    expect(authOutagePolicy(" LOCAL ")).toBe("local");
  });

  it("fails closed by default: every entry point denies with a generic retry delay", async () => {
    const key = "outage-" + randomUUID();
    expect(await checkPasswordAuthRateLimit(key)).toEqual({ ok: false, retryAfterSeconds: 30 });
    expect(await reservePasswordAuthAttempt(key)).toEqual({ ok: false, retryAfterSeconds: 30 });
    expect((await recordPasswordAuthFailure(key)).count).toBe(5);
  });

  it("local break-glass keeps sign-in available but still caps attempts at five", async () => {
    process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY = "local";
    const key = "outage-local-" + randomUUID();
    for (let i = 0; i < 5; i++) expect((await reservePasswordAuthAttempt(key)).ok).toBe(true);
    const denied = await reservePasswordAuthAttempt(key);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect((await checkPasswordAuthRateLimit(key)).ok).toBe(false);
    await clearPasswordAuthRateLimit(key); // success cleanup must not throw during the outage
    expect((await reservePasswordAuthAttempt(key)).ok).toBe(true);
  });

  it("local break-glass also bounds the legacy check/record pair", async () => {
    process.env.ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY = "local";
    const key = "legacy-local-" + randomUUID();
    expect((await checkPasswordAuthRateLimit(key)).ok).toBe(true);
    for (let i = 0; i < 5; i++) await recordPasswordAuthFailure(key);
    expect((await checkPasswordAuthRateLimit(key)).ok).toBe(false);
  });
});
