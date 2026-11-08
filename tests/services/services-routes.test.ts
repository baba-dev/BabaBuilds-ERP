// @vitest-environment node
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireServiceAccess: vi.fn(),
  prisma: {
    serviceTemplate: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    nICCode: { findUnique: vi.fn() },
    sACCode: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/services/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/access")>()),
  requireServiceAccess: mocks.requireServiceAccess,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/activity-log", () => ({ logActivity: vi.fn() }));

const access = { ok: true, access: { workspaceId: "ws_1", userId: "u_1", email: "a@b.c" } };
const post = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/services", { method: "POST", body: fd });
};
const created = (name: string) => ({ id: "s1", name, defaultPrice: 10, nicCode: null, sacCode: null, _count: { proposalItems: 2, retainerItems: 1 } });

describe("/api/services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireServiceAccess.mockResolvedValue(access);
  });

  it("returns the access response when the caller may not write", async () => {
    mocks.requireServiceAccess.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const { POST } = await import("@/app/api/services/route");
    expect((await POST(post({ name: "X", defaultPrice: "1" }))).status).toBe(403);
    expect(mocks.prisma.serviceTemplate.create).not.toHaveBeenCalled();
  });

  it("validates input and keeps `error` a string for older callers", async () => {
    const { POST } = await import("@/app/api/services/route");
    const res = await POST(post({ name: "", defaultPrice: "-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.code).toBe("INVALID_SERVICE");
  });

  it("rejects a case-insensitive duplicate name", async () => {
    mocks.prisma.serviceTemplate.findMany.mockResolvedValue([{ name: "Monthly SEO" }]);
    const { POST } = await import("@/app/api/services/route");
    const res = await POST(post({ name: "monthly seo", defaultPrice: "5" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("DUPLICATE_NAME");
    expect(mocks.prisma.serviceTemplate.create).not.toHaveBeenCalled();
  });

  it("creates the service in the session workspace and returns usage counts", async () => {
    mocks.prisma.serviceTemplate.findMany.mockResolvedValue([]);
    mocks.prisma.serviceTemplate.create.mockResolvedValue(created("Audit"));
    const { POST } = await import("@/app/api/services/route");
    const res = await POST(post({ name: "Audit", defaultPrice: "10" }));
    expect(res.status).toBe(201);
    expect(mocks.prisma.serviceTemplate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: "ws_1", name: "Audit" }) }));
    expect((await res.json()).service.usage).toEqual({ proposals: 2, retainers: 1 });
  });

  it("rejects an unknown tax code instead of failing with a 500", async () => {
    mocks.prisma.sACCode.findUnique.mockResolvedValue(null);
    mocks.prisma.serviceTemplate.findMany.mockResolvedValue([]);
    const { POST } = await import("@/app/api/services/route");
    const res = await POST(post({ name: "Audit", defaultPrice: "10", sacCodeId: "missing" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_TAX_CODE");
  });
});

describe("DELETE /api/services/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireServiceAccess.mockResolvedValue(access);
  });

  it("404s for another workspace's service and deletes only after the ownership lookup", async () => {
    const { DELETE } = await import("@/app/api/services/[id]/route");
    mocks.prisma.serviceTemplate.findFirst.mockResolvedValue(null);
    const missing = await DELETE(new Request("http://localhost/api/services/x", { method: "DELETE" }), { params: Promise.resolve({ id: "x" }) });
    expect(missing.status).toBe(404);
    expect(mocks.prisma.serviceTemplate.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "x", workspaceId: "ws_1" } }));
    expect(mocks.prisma.serviceTemplate.delete).not.toHaveBeenCalled();

    mocks.prisma.serviceTemplate.findFirst.mockResolvedValue({ id: "s1", name: "Audit", _count: { proposalItems: 0, retainerItems: 0 } });
    mocks.prisma.serviceTemplate.delete.mockResolvedValue({});
    const ok = await DELETE(new Request("http://localhost/api/services/s1", { method: "DELETE" }), { params: Promise.resolve({ id: "s1" }) });
    expect(ok.status).toBe(200);
  });
});
