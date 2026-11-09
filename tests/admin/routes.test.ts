import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const logActivityMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  workspace: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  appActivityLog: { deleteMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

vi.mock("next-auth/next", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: logActivityMock, validateTaxOverrideAuditChain: vi.fn(async () => ({ valid: true, checked: 0, violations: [] })) }));
vi.mock("@/lib/route-rate-limit", () => ({ enforceRouteRateLimit: vi.fn(() => ({ ok: true })) }));

const json = (body: unknown, method = "POST") => new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const asAdmin = () => { getServerSessionMock.mockResolvedValue({ user: { id: "u1" } }); prismaMock.user.findUnique.mockResolvedValue({ id: "u1", role: "ADMIN", email: "Boss@Acme.in" }); };

describe("admin routes are gated by role AND allowlist", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SUPERADMIN_EMAILS", "boss@acme.in"); });

  it("anonymous is 401, an ordinary user is 403, and neither reads any data", async () => {
    const { GET } = await import("@/app/api/admin/accounts/route");
    getServerSessionMock.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/admin/accounts"))).status).toBe(401);
    getServerSessionMock.mockResolvedValue({ user: { id: "u2" } });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u2", role: "USER", email: "boss@acme.in" });
    expect((await GET(new Request("http://x/api/admin/accounts"))).status).toBe(403);
    prismaMock.user.findUnique.mockResolvedValue({ id: "u2", role: "ADMIN", email: "someone@else.in" });
    expect((await GET(new Request("http://x/api/admin/accounts"))).status).toBe(403);
    expect(prismaMock.workspace.findMany).not.toHaveBeenCalled();
  });

  it("an admin on the allowlist gets through (email compared case-insensitively)", async () => {
    asAdmin();
    prismaMock.workspace.count.mockResolvedValue(0);
    prismaMock.workspace.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/admin/accounts/route");
    const res = await GET(new Request("http://x/api/admin/accounts?access=PAID"));
    expect(res.status).toBe(200);
    expect((await res.json()).accounts).toEqual([]);
  });
});

describe("plan route", () => {
  const ws = { id: "w1", name: "Acme", subscriptionStatus: "FREE", planTier: "FREE", subscriptionEndsAt: null, planInterval: null };
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SUPERADMIN_EMAILS", "boss@acme.in"); asAdmin(); prismaMock.workspace.findUnique.mockResolvedValue(ws); prismaMock.workspace.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ subscriptionStatus: data.subscriptionStatus, planTier: data.planTier, subscriptionEndsAt: data.subscriptionEndsAt, planInterval: data.planInterval })); });

  it("refuses a change without a real reason", async () => {
    const { POST } = await import("@/app/api/admin/accounts/[id]/plan/route");
    expect((await POST(json({ action: "SET_PLAN", plan: "PRO", reason: "ok" }), ctx("w1"))).status).toBe(400);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it("sets the plan with an end date and records who, why and the before and after", async () => {
    const { POST } = await import("@/app/api/admin/accounts/[id]/plan/route");
    const res = await POST(json({ action: "SET_PLAN", plan: "PRO", interval: "YEARLY", reason: "Paid by bank transfer" }), ctx("w1"));
    expect(res.status).toBe(200);
    const data = prismaMock.workspace.update.mock.calls[0][0].data;
    expect(data.subscriptionStatus).toBe("PRO");
    expect(data.subscriptionEndsAt).toBeInstanceOf(Date);
    const log = logActivityMock.mock.calls[0][0];
    expect(log).toMatchObject({ action: "admin_plan_set_plan", workspaceId: "w1", actor: { email: "boss@acme.in" } });
    expect(log.metadata).toMatchObject({ reason: "Paid by bank transfer", before: { status: "FREE" }, after: { status: "PRO" } });
  });

  it("returns a clear conflict for an action that does not apply, and 404 for an unknown workspace", async () => {
    const { POST } = await import("@/app/api/admin/accounts/[id]/plan/route");
    const res = await POST(json({ action: "REACTIVATE", reason: "Customer asked" }), ctx("w1"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_SUSPENDED");
    prismaMock.workspace.findUnique.mockResolvedValue(null);
    expect((await POST(json({ action: "SUSPEND", reason: "Chargeback" }), ctx("nope"))).status).toBe(404);
  });
});

describe("log pruning", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SUPERADMIN_EMAILS", "boss@acme.in"); asAdmin(); prismaMock.appActivityLog.deleteMany.mockResolvedValue({ count: 7 }); });

  it("no longer wipes the log, and never touches the tax audit chain", async () => {
    const { DELETE } = await import("@/app/api/admin/logs/route");
    const nextReq = (url: string) => Object.assign(new Request(url, { method: "DELETE" }), { nextUrl: new URL(url) });
    expect((await DELETE(nextReq("http://x/api/admin/logs") as never)).status).toBe(400);
    expect((await DELETE(nextReq("http://x/api/admin/logs?olderThanDays=5") as never)).status).toBe(400);
    expect((await DELETE(nextReq("http://x/api/admin/logs?type=tax_audit&olderThanDays=90") as never)).status).toBe(405);
    expect(prismaMock.appActivityLog.deleteMany).not.toHaveBeenCalled();
  });

  it("prunes only entries older than the cutoff and records that it did", async () => {
    const { DELETE } = await import("@/app/api/admin/logs/route");
    const url = "http://x/api/admin/logs?olderThanDays=90";
    const res = await DELETE(Object.assign(new Request(url, { method: "DELETE" }), { nextUrl: new URL(url) }) as never);
    expect(res.status).toBe(200);
    const where = prismaMock.appActivityLog.deleteMany.mock.calls[0][0].where;
    expect(Object.keys(where)).toEqual(["createdAt"]);
    expect((where.createdAt.lt as Date).getTime()).toBeLessThan(Date.now() - 89 * 86_400_000);
    expect(logActivityMock.mock.calls[0][0]).toMatchObject({ action: "admin_logs_pruned", metadata: { olderThanDays: 90, removed: 7 } });
  });
});
