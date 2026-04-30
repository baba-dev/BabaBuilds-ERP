import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

const upsertMock = vi.fn();
const updateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userOnboarding: {
      upsert: upsertMock,
      update: updateMock,
    },
  },
}));

describe("onboarding API demo guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns disabled onboarding payload for demo users", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_demo", email: "sandbox@bababuilds.demo" },
    } as never);

    const { GET } = await import("@/app/api/user/onboarding/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.isDemoUser).toBe(true);
    expect(payload.disabled).toBe(true);
    expect(payload.isFirstLogin).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("blocks demo users from mutating onboarding state", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_demo", email: "sandbox@bababuilds.demo" },
    } as never);

    const { PATCH } = await import("@/app/api/user/onboarding/route");
    const response = await PATCH(
      new Request("http://localhost/api/user/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_step", stepId: "dashboard_overview" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/disabled for demo users/i);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("onboarding API persona mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertMock.mockResolvedValue({
      userId: "user_123",
      persona: null,
      completedSteps: "[]",
      dismissedAt: null,
      completedAt: null,
      isFirstLogin: true,
    });
    updateMock.mockResolvedValue({
      userId: "user_123",
      persona: "agency",
      completedSteps: "[]",
      dismissedAt: null,
      completedAt: null,
      isFirstLogin: true,
    });
  });

  it("accepts valid persona values for set_persona", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_123", email: "member@bababuilds.com" },
    } as never);

    const { PATCH } = await import("@/app/api/user/onboarding/route");
    const response = await PATCH(
      new Request("http://localhost/api/user/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_persona", persona: "agency" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.persona).toBe("agency");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          persona: "agency",
        }),
      }),
    );
  });

  it("returns 400 for invalid persona values in set_persona", async () => {
    const { getServerSession } = await import("next-auth/next");
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_123", email: "member@bababuilds.com" },
    } as never);

    const { PATCH } = await import("@/app/api/user/onboarding/route");
    const response = await PATCH(
      new Request("http://localhost/api/user/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_persona", persona: "invalid-persona" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/invalid persona/i);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
