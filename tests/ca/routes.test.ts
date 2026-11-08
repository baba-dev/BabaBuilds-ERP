import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();
const withPermissionMock = vi.fn();
const getCaOverviewMock = vi.fn();
const prismaMock = {
  caComplianceItem: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  workspaceUser: { findFirst: vi.fn() },
  caRequest: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  caRequestMessage: { create: vi.fn() },
  document: { findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
};

vi.mock("next-auth/next", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rbac", () => ({ withPermission: withPermissionMock, checkPermissionsSilent: vi.fn(async () => ({ "ca.manage": false })), checkPermissionSilent: vi.fn() }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/ca/data", () => ({ getCaOverview: getCaOverviewMock, loadCaSetup: vi.fn() }));
vi.mock("@/lib/route-rate-limit", () => ({ enforceRouteRateLimit: vi.fn(() => ({ ok: true })) }));

const session = { workspaceId: "ws1", user: { id: "u1", name: "Ca Sharma", email: "ca@firm.in" } };
const json = (body: unknown, method = "POST") => new Request("http://x/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const granted = () => withPermissionMock.mockResolvedValue({ granted: true, role: "ACCOUNTANT" });

describe("CA route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(session);
    granted();
  });

  it("refuses anonymous callers on every export before touching data", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const pack = await import("@/app/api/ca/export/pack/route");
    const registers = await import("@/app/api/ca/export/registers/route");
    expect((await pack.GET(new Request("http://x/api?fy=2026-27"))).status).toBe(401);
    expect((await registers.GET(new Request("http://x/api?fy=2026-27&type=sales"))).status).toBe(401);
  });

  it("requires ca.export for the exports (the old routes only checked for a session)", async () => {
    const { NextResponse } = await import("next/server");
    withPermissionMock.mockResolvedValue({ granted: false, response: NextResponse.json({ code: "RBAC_PERMISSION_DENIED" }, { status: 403 }) });
    const pack = await import("@/app/api/ca/export/pack/route");
    const registers = await import("@/app/api/ca/export/registers/route");
    expect((await pack.GET(new Request("http://x/api?fy=2026-27"))).status).toBe(403);
    expect((await registers.GET(new Request("http://x/api?fy=2026-27&type=sales"))).status).toBe(403);
    expect(withPermissionMock).toHaveBeenCalledWith("u1", "ws1", "ca.export");
  });

  it("rejects a bad year or register type with 400", async () => {
    const registers = await import("@/app/api/ca/export/registers/route");
    expect((await registers.GET(new Request("http://x/api?fy=nope&type=sales"))).status).toBe(400);
    expect((await registers.GET(new Request("http://x/api?fy=2026-27&type=everything"))).status).toBe(400);
  });

  it("only lets a compliance manager edit items, and locks GST status", async () => {
    const { PUT } = await import("@/app/api/ca/items/route");
    const res = await PUT(json({ kind: "GST_GSTR3B", periodKey: "2026-09", fy: "2026-27", status: "FILED" }, "PUT"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("STATUS_LOCKED");
    expect(withPermissionMock).toHaveBeenCalledWith("u1", "ws1", "ca.manage");
    expect(prismaMock.caComplianceItem.upsert).not.toHaveBeenCalled();
  });

  it("allows owner and notes on a GST return", async () => {
    prismaMock.workspaceUser.findFirst.mockResolvedValue({ id: "m1" });
    prismaMock.caComplianceItem.findUnique.mockResolvedValue(null);
    prismaMock.caComplianceItem.upsert.mockResolvedValue({ id: "i1" });
    const { PUT } = await import("@/app/api/ca/items/route");
    const res = await PUT(json({ kind: "GST_GSTR3B", periodKey: "2026-09", fy: "2026-27", ownerUserId: "u2", notes: "chase 2B" }, "PUT"));
    expect(res.status).toBe(200);
    expect(prismaMock.caComplianceItem.upsert).toHaveBeenCalledTimes(1);
  });

  it("clears a sign-off when the outcome of a signed item changes", async () => {
    prismaMock.caComplianceItem.findUnique.mockResolvedValue({ id: "i1", status: "FILED", reference: "ACK1", signedOffAt: new Date() });
    prismaMock.caComplianceItem.upsert.mockResolvedValue({ id: "i1" });
    const { PUT } = await import("@/app/api/ca/items/route");
    const res = await PUT(json({ kind: "ITR", periodKey: "2026-27", fy: "2026-27", status: "IN_PROGRESS" }, "PUT"));
    expect((await res.json()).signOffCleared).toBe(true);
    const update = prismaMock.caComplianceItem.upsert.mock.calls[0][0].update;
    expect(update).toMatchObject({ signedOffAt: null, signedOffByUserId: null, signedOffByName: null });
  });

  it("rejects an owner who is not a member", async () => {
    prismaMock.workspaceUser.findFirst.mockResolvedValue(null);
    const { PUT } = await import("@/app/api/ca/items/route");
    const res = await PUT(json({ kind: "ITR", periodKey: "2026-27", fy: "2026-27", ownerUserId: "ghost" }, "PUT"));
    expect(res.status).toBe(422);
  });
});

describe("sign-off rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(session);
    granted();
  });
  const overview = (over: Record<string, unknown> = {}) => ({ items: [{ kind: "ITR", periodKey: "2026-27", state: "FILED" }, { kind: "YEAR_CLOSE", periodKey: "2026-27", state: "UPCOMING" }], readiness: { readyToClose: true, blockers: 0 }, ...over });

  it("signs off a filed obligation as the signed-in user", async () => {
    getCaOverviewMock.mockResolvedValue(overview());
    const { POST } = await import("@/app/api/ca/items/signoff/route");
    const res = await POST(json({ kind: "ITR", periodKey: "2026-27", fy: "2026-27" }));
    expect(res.status).toBe(200);
    expect(prismaMock.caComplianceItem.upsert.mock.calls[0][0].create).toMatchObject({ signedOffByUserId: "u1", signedOffByName: "Ca Sharma" });
    expect(withPermissionMock).toHaveBeenCalledWith("u1", "ws1", "ca.signoff");
  });

  it("refuses to sign off something that is not filed", async () => {
    getCaOverviewMock.mockResolvedValue(overview({ items: [{ kind: "ITR", periodKey: "2026-27", state: "UPCOMING" }] }));
    const { POST } = await import("@/app/api/ca/items/signoff/route");
    const res = await POST(json({ kind: "ITR", periodKey: "2026-27", fy: "2026-27" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NOT_FILED");
  });

  it("refuses to close the year while blockers remain or obligations are overdue", async () => {
    const { POST } = await import("@/app/api/ca/items/signoff/route");
    getCaOverviewMock.mockResolvedValue(overview({ readiness: { readyToClose: false, blockers: 2 } }));
    const blocked = await POST(json({ kind: "YEAR_CLOSE", periodKey: "2026-27", fy: "2026-27" }));
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe("NOT_READY");
    getCaOverviewMock.mockResolvedValue(overview({ items: [{ kind: "ITR", periodKey: "2026-27", state: "OVERDUE" }, { kind: "YEAR_CLOSE", periodKey: "2026-27", state: "UPCOMING" }] }));
    const overdue = await POST(json({ kind: "YEAR_CLOSE", periodKey: "2026-27", fy: "2026-27" }));
    expect((await overdue.json()).code).toBe("OVERDUE_OPEN");
    expect(prismaMock.caComplianceItem.upsert).not.toHaveBeenCalled();
  });

  it("closes the year when nothing blocks it", async () => {
    getCaOverviewMock.mockResolvedValue(overview({ items: [{ kind: "ITR", periodKey: "2026-27", state: "FILED" }, { kind: "YEAR_CLOSE", periodKey: "2026-27", state: "UPCOMING" }] }));
    const { POST } = await import("@/app/api/ca/items/signoff/route");
    const res = await POST(json({ kind: "YEAR_CLOSE", periodKey: "2026-27", fy: "2026-27" }));
    expect(res.status).toBe(200);
  });

  it("removes a sign-off without recomputing the year", async () => {
    prismaMock.caComplianceItem.updateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import("@/app/api/ca/items/signoff/route");
    const res = await POST(json({ kind: "ITR", periodKey: "2026-27", fy: "2026-27", undo: true }));
    expect(res.status).toBe(200);
    expect(getCaOverviewMock).not.toHaveBeenCalled();
  });
});

describe("requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue(session);
    granted();
  });

  it("marks a thread answered when someone other than the asker replies, and reopens when the asker does", async () => {
    const { POST } = await import("@/app/api/ca/requests/[id]/messages/route");
    prismaMock.workspaceUser.findFirst.mockResolvedValue({ businessRole: "ACCOUNTANT" });
    prismaMock.caRequest.findFirst.mockResolvedValue({ id: "r1", status: "OPEN", createdByUserId: "owner" });
    await POST(json({ body: "Here you go" }), { params: Promise.resolve({ id: "r1" }) });
    expect(prismaMock.caRequest.update.mock.calls[0][0].data.status).toBe("ANSWERED");
    prismaMock.caRequest.update.mockClear();
    prismaMock.caRequest.findFirst.mockResolvedValue({ id: "r1", status: "ANSWERED", createdByUserId: "u1" });
    await POST(json({ body: "Need another" }), { params: Promise.resolve({ id: "r1" }) });
    expect(prismaMock.caRequest.update.mock.calls[0][0].data.status).toBe("OPEN");
  });

  it("refuses replies on a closed request and attachments from another workspace", async () => {
    const { POST } = await import("@/app/api/ca/requests/[id]/messages/route");
    prismaMock.caRequest.findFirst.mockResolvedValue({ id: "r1", status: "CLOSED", createdByUserId: "u1" });
    expect((await POST(json({ body: "hi" }), { params: Promise.resolve({ id: "r1" }) })).status).toBe(409);
    prismaMock.caRequest.findFirst.mockResolvedValue({ id: "r1", status: "OPEN", createdByUserId: "u1" });
    prismaMock.document.findFirst.mockResolvedValue(null);
    expect((await POST(json({ body: "hi", documentId: "foreign" }), { params: Promise.resolve({ id: "r1" }) })).status).toBe(422);
  });

  it("scopes every lookup to the caller's workspace", async () => {
    const { GET } = await import("@/app/api/ca/requests/[id]/route");
    prismaMock.caRequest.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api"), { params: Promise.resolve({ id: "other" }) });
    expect(res.status).toBe(404);
    expect(prismaMock.caRequest.findFirst.mock.calls[0][0].where).toMatchObject({ id: "other", workspaceId: "ws1" });
  });
});

describe("CA permissions", () => {
  it("lets an accountant export and sign off but not manage, and keeps staff and viewers out", async () => {
    const { DEFAULT_ROLE_PERMISSIONS } = await import("@/lib/permissions");
    const has = (role: keyof typeof DEFAULT_ROLE_PERMISSIONS, p: string) => (DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes(p);
    expect(has("ACCOUNTANT", "ca.export")).toBe(true);
    expect(has("ACCOUNTANT", "ca.signoff")).toBe(true);
    expect(has("ACCOUNTANT", "ca.manage")).toBe(false);
    expect(has("FINANCE_MANAGER", "ca.signoff")).toBe(false);
    expect(has("FINANCE_MANAGER", "ca.manage")).toBe(true);
    for (const role of ["STAFF", "VIEWER", "SALES_MANAGER", "INVENTORY_MANAGER"] as const) expect(has(role, "ca.export")).toBe(false);
    expect(has("OWNER", "ca.signoff") && has("ADMIN", "ca.export")).toBe(true);
  });
});
