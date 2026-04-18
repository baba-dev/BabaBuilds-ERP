import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: {
      count: vi.fn(async () => 999),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/auth/demo/route";

const mockedWorkspaceCount = vi.mocked(prisma.workspace.count);

describe("POST /api/auth/demo security checks", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockedWorkspaceCount.mockClear();
    mockedWorkspaceCount.mockResolvedValue(999);
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "development";
    process.env.DEMO_AGENT_KEY = "expected-agent-key";
    process.env.TURNSTILE_SECRET_KEY = "turnstile-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 403 for development non-local request with fake turnstile token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({ success: false }),
    } as Response);

    const request = new Request("http://remote.example/api/auth/demo", {
      method: "POST",
      headers: {
        host: "remote.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "fake-token" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Bot verification failed." });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockedWorkspaceCount).not.toHaveBeenCalled();
  });

  it("allows development non-local request with valid agent key through security gate", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const request = new Request("http://remote.example/api/auth/demo", {
      method: "POST",
      headers: {
        host: "remote.example",
        "content-type": "application/json",
        "x-demo-agent-key": "expected-agent-key",
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: "High volume. Try in 15 mins." });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedWorkspaceCount).toHaveBeenCalledTimes(1);
  });

  it("keeps localhost development bypass behavior without token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const request = new Request("http://localhost:3000/api/auth/demo", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: "High volume. Try in 15 mins." });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedWorkspaceCount).toHaveBeenCalledTimes(1);
  });
});
