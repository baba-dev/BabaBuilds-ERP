// @vitest-environment node
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  createClient: vi.fn(),
  mergeClients: vi.fn(),
  prisma: { client: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/clients/access", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/clients/access")>()), requireClientAccess: mocks.requireClientAccess }));
vi.mock("@/lib/clients/service", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/clients/service")>()), createClient: mocks.createClient, mergeClients: mocks.mergeClients }));
vi.mock("@/lib/security/activity-log", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/route-rate-limit", () => ({ enforceRouteRateLimit: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/security/clamav", () => ({ scanBuffer: vi.fn(async () => true) }));

const ok = { ok: true, ctx: { workspaceId: "ws_1", userId: "u_1", email: "o@x.y", name: "Owner", workspaceCountry: "IN" } };
const denied = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
const post = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClientAccess.mockResolvedValue(ok);
});

describe("client routes", () => {
  it("require permission before touching data", async () => {
    mocks.requireClientAccess.mockResolvedValue(denied);
    const list = await import("@/app/api/clients/route");
    const merge = await import("@/app/api/clients/merge/route");
    const bulk = await import("@/app/api/clients/bulk/route");
    expect((await list.GET(new Request("http://x/api/clients"))).status).toBe(403);
    expect((await list.POST(post("http://x/api/clients", { name: "A" }))).status).toBe(403);
    expect((await merge.POST(post("http://x/api/clients/merge", { sourceId: "a", targetId: "b" }))).status).toBe(403);
    expect((await bulk.POST(post("http://x/api/clients/bulk", { ids: ["a"], action: "ARCHIVE" }))).status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.mergeClients).not.toHaveBeenCalled();
    expect(mocks.prisma.client.updateMany).not.toHaveBeenCalled();
  });

  it("returns field issues and a country suggestion instead of saving a typo", async () => {
    const { POST } = await import("@/app/api/clients/route");
    const res = await POST(post("http://x/api/clients", { name: "Acme", address: "1 Road", country: "Indai", email: "bad" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION");
    expect(body.fields.map((f: { field: string }) => f.field)).toEqual(expect.arrayContaining(["country", "email"]));
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("creates a valid client through the service and passes the force flag", async () => {
    mocks.createClient.mockResolvedValue({ ok: true, client: { id: "c1" } });
    const { POST } = await import("@/app/api/clients/route");
    const res = await POST(post("http://x/api/clients", { name: "Acme Ltd", address: "1 Road", country: "India", force: true }));
    expect(res.status).toBe(201);
    expect(mocks.createClient).toHaveBeenCalledWith(ok.ctx, expect.objectContaining({ name: "Acme Ltd" }), expect.objectContaining({ force: true, source: "MANUAL" }));
  });

  it("surfaces a duplicate as 409 with the matching clients", async () => {
    mocks.createClient.mockResolvedValue({ ok: false, status: 409, code: "CLIENT_DUPLICATE", message: "Acme looks like the same client.", extra: { existing: [{ id: "c9", name: "Acme" }] } });
    const { POST } = await import("@/app/api/clients/route");
    const res = await POST(post("http://x/api/clients", { name: "Acme Ltd", address: "1 Road", country: "India" }));
    expect(res.status).toBe(409);
    expect((await res.json()).existing[0].id).toBe("c9");
  });

  it("rejects a bulk request with no clients or an unknown action", async () => {
    const { POST } = await import("@/app/api/clients/bulk/route");
    expect((await POST(post("http://x/api/clients/bulk", { ids: [], action: "ARCHIVE" }))).status).toBe(400);
    expect((await POST(post("http://x/api/clients/bulk", { ids: ["a"], action: "NUKE" }))).status).toBe(400);
  });
});
