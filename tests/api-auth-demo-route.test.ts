import { beforeEach, describe, expect, it, vi } from "vitest";

const workspaceCountMock = vi.fn();
const transactionMock = vi.fn();
const userCreateMock = vi.fn();
const verificationTokenCreateMock = vi.fn();

vi.mock("uuid", () => ({
  v4: vi.fn(() => "12345678-1234-1234-1234-1234567890ab"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { count: workspaceCountMock },
    $transaction: transactionMock,
  },
}));

const seedDemoWorkspaceMock = vi.fn();
vi.mock("@/lib/demo/seed-workspace", () => ({
  seedDemoWorkspace: seedDemoWorkspaceMock,
}));

const evaluateDemoProvisionThrottleMock = vi.fn();
const recordDemoProvisionAttemptMock = vi.fn();
vi.mock("@/lib/demo-auth-throttle", () => ({
  getClientFingerprint: vi.fn(() => "test-fingerprint"),
  getClientIp: vi.fn(() => "127.0.0.1"),
  evaluateDemoProvisionThrottle: evaluateDemoProvisionThrottleMock,
  recordDemoProvisionAttempt: recordDemoProvisionAttemptMock,
  throttleToHttpResponse: vi.fn(() => ({
    status: 429,
    body: { error: "Too many demo attempts" },
    headers: { "Retry-After": "60" },
  })),
}));

describe("POST /api/auth/demo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "development";
    process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD = "10";

    workspaceCountMock.mockResolvedValue(0);
    evaluateDemoProvisionThrottleMock.mockResolvedValue({ allowed: true });
    recordDemoProvisionAttemptMock.mockResolvedValue(undefined);
    seedDemoWorkspaceMock.mockResolvedValue(undefined);

    userCreateMock.mockResolvedValue({
      id: "user_demo_1",
    });
    verificationTokenCreateMock.mockResolvedValue(undefined);
    transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        user: { create: userCreateMock },
        verificationToken: { create: verificationTokenCreateMock },
      }),
    );
  });

  it("rejects unknown demo template keys with 400", async () => {
    const { POST } = await import("@/app/api/auth/demo/route");
    const response = await POST(
      new Request("http://localhost:3000/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "localhost:3000" },
        body: JSON.stringify({ templateKey: "bad_template_key" }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/Invalid templateKey/i);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns demo credentials when provisioning succeeds", async () => {
    const { POST } = await import("@/app/api/auth/demo/route");
    const response = await POST(
      new Request("http://localhost:3000/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "localhost:3000" },
        body: JSON.stringify({ templateKey: "dm_agency" }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toEqual({
      email: "demo_12345678@bababuilds.demo",
      password: "12345678-1234-1234-1234-1234567890ab",
      templateKey: "dm_agency",
    });

    expect(seedDemoWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ create: expect.any(Function) }),
        verificationToken: expect.objectContaining({ create: expect.any(Function) }),
      }),
      expect.objectContaining({
        userId: "user_demo_1",
        templateKey: "dm_agency",
        ttlHours: 24,
      }),
    );
    expect(verificationTokenCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          identifier: "demo_12345678@bababuilds.demo",
          token: "12345678-1234-1234-1234-1234567890ab",
        }),
      }),
    );
  });
});
