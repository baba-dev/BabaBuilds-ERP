import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const withPermissionMock = vi.hoisted(() => vi.fn());
const loadBillingMock = vi.hoisted(() => vi.fn());
const logActivityMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  workspaceModule: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn(), create: vi.fn() },
  workspaceUser: { findFirst: vi.fn() },
  businessProfile: { findUnique: vi.fn() },
}));

vi.mock("next-auth", () => ({ getServerSession: getServerSessionMock }));
vi.mock("next-auth/next", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rbac", () => ({ withPermission: withPermissionMock, requirePermission: vi.fn(), RbacDeniedError: class extends Error {}, rbacDeniedResponse: vi.fn() }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: logActivityMock }));
vi.mock("@/lib/entitlements", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/entitlements")>()), loadWorkspaceBillingSnapshot: loadBillingMock }));
vi.mock("@/lib/company-groups/enable-multi-company", () => ({ enableMultiCompany: vi.fn(), disableMultiCompany: vi.fn() }));
vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorized: vi.fn(() => true), unauthorizedCronResponse: vi.fn() }));
const runAutomationMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ar-collections", () => ({ runReminderAutomation: runAutomationMock }));

const FUTURE = new Date(Date.now() + 86_400_000);
const PAID = { planTier: "PRO", subscriptionStatus: "PRO", subscriptionEndsAt: FUTURE };
const FREE = { planTier: "FREE", subscriptionStatus: "FREE", subscriptionEndsAt: null };
const session = { workspaceId: "ws1", user: { id: "u1", email: "o@acme.in" } };
const put = (body: unknown) => new Request("http://x/api", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("module states", () => {
  beforeEach(() => { vi.clearAllMocks(); loadBillingMock.mockResolvedValue(PAID); });

  it("reports on, off, and defaults per module", async () => {
    prismaMock.workspaceModule.findMany.mockResolvedValue([{ moduleKey: "PAYROLL", isEnabled: true, enabledAt: new Date("2026-01-02"), configJson: null }, { moduleKey: "CASH_FLOW", isEnabled: false, enabledAt: new Date(), configJson: null }]);
    const { getModuleStates } = await import("@/lib/modules");
    const states = Object.fromEntries((await getModuleStates("ws1")).map((s) => [s.key, s.state]));
    expect(states.PAYROLL).toBe("enabled");
    expect(states.CASH_FLOW).toBe("disabled");
    expect(states.WORKFORCE).toBe("disabled");
    expect(states.POS).toBe("enabled");
  });

  it("calls a switched-on module paused after the plan ends, and a never-used one plan_required", async () => {
    loadBillingMock.mockResolvedValue(FREE);
    prismaMock.workspaceModule.findMany.mockResolvedValue([{ moduleKey: "PAYROLL", isEnabled: true, enabledAt: new Date(), configJson: null }]);
    const { getModuleStates } = await import("@/lib/modules");
    const states = Object.fromEntries((await getModuleStates("ws1")).map((s) => [s.key, s.state]));
    expect(states.PAYROLL).toBe("paused");
    expect(states.WORKFORCE).toBe("plan_required");
    expect(states.SHOP).not.toBe("plan_required");
  });
});

describe("module toggle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(session);
    withPermissionMock.mockResolvedValue({ granted: true });
    loadBillingMock.mockResolvedValue(PAID);
    prismaMock.workspaceUser.findFirst.mockResolvedValue({ workspaceId: "ws1" });
    prismaMock.workspaceModule.findUnique.mockResolvedValue({ id: "m", isEnabled: false });
    prismaMock.workspaceModule.findMany.mockResolvedValue([]);
  });

  it("writes who switched what to the history", async () => {
    const { POST } = await import("@/app/api/workspace/modules/route");
    const req = Object.assign(new Request("http://x/api/workspace/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ moduleKey: "CASH_FLOW", enabled: true }) }), { nextUrl: new URL("http://x/api/workspace/modules") });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: "settings_module_enabled", metadata: { module: "CASH_FLOW" } }));
  });

  it("returns module states only when asked for detail", async () => {
    const { GET } = await import("@/app/api/workspace/modules/route");
    const plain = await (await GET(Object.assign(new Request("http://x/api/workspace/modules"), { nextUrl: new URL("http://x/api/workspace/modules") }) as never)).json();
    expect(plain.states).toBeUndefined();
    const detail = await (await GET(Object.assign(new Request("http://x/api/workspace/modules?detail=1"), { nextUrl: new URL("http://x/api/workspace/modules?detail=1") }) as never)).json();
    expect(Array.isArray(detail.states)).toBe(true);
    expect(detail.states.length).toBeGreaterThan(10);
  });
});

describe("module options route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(session);
    withPermissionMock.mockResolvedValue({ granted: true });
    loadBillingMock.mockResolvedValue(PAID);
  });

  it("only configures modules that have options", async () => {
    const { PUT } = await import("@/app/api/workspace/modules/config/route");
    expect((await PUT(put({ moduleKey: "PAYROLL", options: { autoReminders: true } }))).status).toBe(400);
    expect((await PUT(put({ moduleKey: "AR_COLLECTIONS", options: { autoReminders: "yes" } }))).status).toBe(400);
  });

  it("needs the module on, and keeps other config such as the run cooldown", async () => {
    const { PUT } = await import("@/app/api/workspace/modules/config/route");
    prismaMock.workspaceModule.findUnique.mockResolvedValue({ isEnabled: false });
    expect((await PUT(put({ moduleKey: "AR_COLLECTIONS", options: { autoReminders: true } }))).status).toBe(409);
    prismaMock.workspaceModule.findUnique.mockResolvedValue({ isEnabled: true, configJson: { lastReminderAutomationAt: "2026-11-01T00:00:00Z" } });
    const res = await PUT(put({ moduleKey: "AR_COLLECTIONS", options: { autoReminders: true } }));
    expect(res.status).toBe(200);
    expect(prismaMock.workspaceModule.update).toHaveBeenCalledWith(expect.objectContaining({ data: { configJson: { lastReminderAutomationAt: "2026-11-01T00:00:00Z", autoReminders: true } } }));
    expect(logActivityMock).toHaveBeenCalledWith(expect.objectContaining({ action: "settings_module_option" }));
  });

  it("is refused for people who cannot manage settings", async () => {
    const { NextResponse } = await import("next/server");
    withPermissionMock.mockResolvedValue({ granted: false, response: NextResponse.json({}, { status: 403 }) });
    const { PUT } = await import("@/app/api/workspace/modules/config/route");
    expect((await PUT(put({ moduleKey: "AR_COLLECTIONS", options: { autoReminders: true } }))).status).toBe(403);
  });
});

describe("AR reminders cron", () => {
  beforeEach(() => { vi.clearAllMocks(); loadBillingMock.mockResolvedValue(PAID); runAutomationMock.mockResolvedValue({}); });

  it("runs only for workspaces that opted in and are still entitled", async () => {
    prismaMock.workspaceModule.findMany.mockResolvedValue([
      { workspaceId: "a", configJson: { autoReminders: true } },
      { workspaceId: "b", configJson: { autoReminders: false } },
      { workspaceId: "c", configJson: null },
      { workspaceId: "d", configJson: { autoReminders: true } },
    ]);
    // a: enabled row; d: row disabled after opting in
    prismaMock.workspaceModule.findUnique.mockImplementation(async ({ where }: { where: { workspaceId_moduleKey: { workspaceId: string } } }) => ({ isEnabled: where.workspaceId_moduleKey.workspaceId === "a" }));
    const { GET } = await import("@/app/api/cron/ar-reminders/route");
    const body = await (await GET(new Request("http://x/api/cron/ar-reminders"))).json();
    expect(runAutomationMock).toHaveBeenCalledTimes(1);
    expect(runAutomationMock).toHaveBeenCalledWith("a", { userId: null, email: null });
    expect(body).toMatchObject({ optedIn: 2, ran: 1, skipped: 1, failed: 0 });
  });

  it("counts the cooldown as skipped and other errors as failed, and keeps going", async () => {
    prismaMock.workspaceModule.findMany.mockResolvedValue([{ workspaceId: "a", configJson: { autoReminders: true } }, { workspaceId: "b", configJson: { autoReminders: true } }]);
    prismaMock.workspaceModule.findUnique.mockResolvedValue({ isEnabled: true });
    runAutomationMock.mockRejectedValueOnce(Object.assign(new Error("cooldown"), { code: "RATE_LIMIT_COOLDOWN" })).mockRejectedValueOnce(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("@/app/api/cron/ar-reminders/route");
    const body = await (await GET(new Request("http://x/api/cron/ar-reminders"))).json();
    expect(body).toMatchObject({ ran: 0, skipped: 1, failed: 1 });
  });
});
