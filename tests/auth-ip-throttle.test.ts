import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeAuthThrottle } from "@/lib/auth/ip-throttle";

describe("consumeAuthThrottle", () => {
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit then blocks with a retry hint", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(consumeAuthThrottle(key, 3, 60_000).ok).toBe(true);
    const blocked = consumeAuthThrottle(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window and isolates keys", () => {
    vi.useFakeTimers();
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(consumeAuthThrottle(a, 1, 1_000).ok).toBe(true);
    expect(consumeAuthThrottle(a, 1, 1_000).ok).toBe(false);
    expect(consumeAuthThrottle(b, 1, 1_000).ok).toBe(true);
    vi.advanceTimersByTime(1_001);
    expect(consumeAuthThrottle(a, 1, 1_000).ok).toBe(true);
  });
});
