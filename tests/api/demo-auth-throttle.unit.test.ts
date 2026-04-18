import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateDemoProvisionThrottle } from "@/lib/demo-auth-throttle";

describe("evaluateDemoProvisionThrottle", () => {
  afterEach(() => {
    delete process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD;
    delete process.env.DEMO_IP_RATE_LIMIT;
    delete process.env.DEMO_FINGERPRINT_RATE_LIMIT;
  });

  it("blocks at the exact global threshold boundary", async () => {
    process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD = "10";

    const prismaMock = {
      workspace: {
        count: vi.fn().mockResolvedValue(10),
      },
      demoProvisionAttempt: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    };

    const decision = await evaluateDemoProvisionThrottle(
      { ip: "203.0.113.10", fingerprint: "fp-boundary" },
      prismaMock,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("global_rate_limit");
    expect(decision.retryAfterSeconds).toBe(900);
    expect(prismaMock.workspace.count).toHaveBeenCalledTimes(1);
  });

  it("blocks repeated attempts from the same IP", async () => {
    process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD = "10";
    process.env.DEMO_IP_RATE_LIMIT = "3";

    const now = Date.now();
    const ipAttempts = [
      { createdAt: new Date(now - 60_000) },
      { createdAt: new Date(now - 45_000) },
      { createdAt: new Date(now - 30_000) },
    ];

    const prismaMock = {
      workspace: {
        count: vi.fn().mockResolvedValue(1),
      },
      demoProvisionAttempt: {
        findMany: vi.fn().mockResolvedValueOnce(ipAttempts),
        create: vi.fn(),
      },
    };

    const decision = await evaluateDemoProvisionThrottle({ ip: "198.51.100.55" }, prismaMock);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("ip_rate_limit");
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(900);
    expect(prismaMock.demoProvisionAttempt.findMany).toHaveBeenCalledTimes(1);
  });
});
