import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.hoisted(() => vi.fn());
const isModuleEnabledMock = vi.hoisted(() => vi.fn());
const workspaceUserFindManyMock = vi.hoisted(() => vi.fn());
const companyGroupMemberFindManyMock = vi.hoisted(() => vi.fn());
const companyGroupWorkspaceFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/next", () => ({ getServerSession: getServerSessionMock }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: isModuleEnabledMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceUser: { findMany: workspaceUserFindManyMock },
    companyGroupMember: { findMany: companyGroupMemberFindManyMock },
    companyGroupWorkspace: { findMany: companyGroupWorkspaceFindManyMock },
  },
}));

const workspace = {
  id: "ws_1",
  name: "Acme",
  baseCurrency: "INR",
  countryCode: "IN",
  isSetupComplete: true,
  workspaceModules: [{ moduleKey: "MULTI_COMPANY" }],
};

function request() {
  return new NextRequest("http://localhost:3000/api/company-context");
}

describe("GET /api/company-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({ user: { id: "user_1" }, workspaceId: "ws_1" });
    workspaceUserFindManyMock.mockResolvedValue([{ isActive: true, workspace }]);
    companyGroupMemberFindManyMock.mockResolvedValue([]);
    companyGroupWorkspaceFindManyMock.mockResolvedValue([]);
  });

  it("rejects unauthenticated callers", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/company-context/route");
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("answers 200 with an empty, non-leaking context when MULTI_COMPANY is disabled", async () => {
    isModuleEnabledMock.mockResolvedValue(false);
    const { GET } = await import("@/app/api/company-context/route");
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      activeWorkspace: null,
      group: null,
      availableGroups: [],
      requiresGroupSelection: false,
      accessibleCompanies: [],
      multiCompanyEnabled: false,
    });
    expect(companyGroupWorkspaceFindManyMock).not.toHaveBeenCalled();
    expect(isModuleEnabledMock).toHaveBeenCalledWith("ws_1", "MULTI_COMPANY");
  });

  it("returns group data when MULTI_COMPANY is enabled", async () => {
    isModuleEnabledMock.mockResolvedValue(true);
    companyGroupWorkspaceFindManyMock.mockResolvedValue([
      {
        relationType: "PRIMARY",
        isPrimary: true,
        companyGroup: { id: "cg_1", name: "Acme Group", planTier: "PRO", subscriptionStatus: "PRO", billingWorkspaceId: "ws_1" },
      },
    ]);
    const { GET } = await import("@/app/api/company-context/route");
    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.multiCompanyEnabled).toBe(true);
    expect(body.group).toMatchObject({ id: "cg_1", isPrimary: true });
    expect(body.accessibleCompanies).toHaveLength(1);
  });
});
