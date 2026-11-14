// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveSessionMembership: vi.fn(),
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  getWorkforceReport: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/workspace-scope", () => ({ resolveSessionMembership: mocks.resolveSessionMembership }));
vi.mock("@/lib/modules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/modules")>()),
  requireModule: mocks.requireModule,
}));
vi.mock("@/lib/rbac", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rbac")>()),
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/workforce/reports", () => ({ getWorkforceReport: mocks.getWorkforceReport }));

const req = (qs = "") => new NextRequest(`http://x/api/workforce/reports${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue({ user: { id: "u_1" } });
  mocks.resolveSessionMembership.mockResolvedValue({ workspaceId: "ws_1" });
  mocks.requireModule.mockResolvedValue(undefined);
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.getWorkforceReport.mockResolvedValue({ ok: true });
});

describe("GET /api/workforce/reports", () => {
  it("requires a session", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/workforce/reports/route");
    expect((await GET(req())).status).toBe(401);
    expect(mocks.getWorkforceReport).not.toHaveBeenCalled();
  });

  it("returns 403 when the Workforce module is disabled", async () => {
    const { ModuleDisabledError } = await import("@/lib/modules");
    mocks.requireModule.mockRejectedValue(new ModuleDisabledError("WORKFORCE"));
    const { GET } = await import("@/app/api/workforce/reports/route");
    expect((await GET(req())).status).toBe(403);
    expect(mocks.getWorkforceReport).not.toHaveBeenCalled();
  });

  it("enforces workforce.reports.view on the session workspace", async () => {
    const { RbacDeniedError } = await import("@/lib/rbac");
    mocks.requirePermission.mockRejectedValue(new RbacDeniedError("workforce.reports.view", "VIEWER"));
    const { GET } = await import("@/app/api/workforce/reports/route");
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mocks.requirePermission).toHaveBeenCalledWith("u_1", "ws_1", "workforce.reports.view");
    expect(mocks.getWorkforceReport).not.toHaveBeenCalled();
  });

  it("rejects invalid date ranges before querying", async () => {
    const { GET } = await import("@/app/api/workforce/reports/route");
    const res = await GET(req("?from=2026-06-01&to=2026-01-01"));
    expect(res.status).toBe(400);
    expect(mocks.getWorkforceReport).not.toHaveBeenCalled();
  });

  it("scopes the report to the session workspace", async () => {
    const { GET } = await import("@/app/api/workforce/reports/route");
    const res = await GET(req("?from=2026-01-01&to=2026-03-31"));
    expect(res.status).toBe(200);
    expect(mocks.getWorkforceReport).toHaveBeenCalledWith("ws_1", new Date("2026-01-01T00:00:00.000Z"), new Date("2026-03-31T00:00:00.000Z"));
  });
});
