import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  companyGroupMemberUpsert: vi.fn(),
  workspaceAccessUpsert: vi.fn(),
  workspaceUserCreateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      workspace: { create: vi.fn().mockResolvedValue({ id: "new-workspace" }) },
      businessProfile: { create: vi.fn().mockResolvedValue({}) },
      companyGroupWorkspace: {
        create: vi.fn().mockResolvedValue({ id: "new-link" }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "new-link", workspaceId: "new-workspace" }),
      },
      companyGroupMember: { upsert: mocks.companyGroupMemberUpsert },
      companyGroupMemberWorkspaceAccess: { upsert: mocks.workspaceAccessUpsert },
      workspaceUser: { createMany: mocks.workspaceUserCreateMany },
    })),
  },
}));

vi.mock("@/app/api/companies/_shared", () => ({
  canManageCompanies: vi.fn().mockReturnValue(true),
  errorJson: (message: string, status: number) => Response.json({ error: message }, { status }),
  parseString: (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  parseWorkspaceUsers: vi.fn().mockReturnValue([{ userId: "selected-user", businessRole: "ADMIN" }]),
  requireCompanyGroupContext: vi.fn().mockResolvedValue({
    context: {
      userId: "selected-user",
      workspaceId: "current-workspace",
      companyGroupId: "group-1",
      groupRole: "GROUP_ADMIN",
      accessMode: "ALL_COMPANIES",
    },
  }),
  requireMultiCompanyAccess: vi.fn().mockResolvedValue(null),
}));

import { POST } from "@/app/api/companies/route";

describe("company creation group access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceAccessUpsert.mockResolvedValue({});
    mocks.workspaceUserCreateMany.mockResolvedValue({ count: 1 });
  });

  it("creates a non-privileged group member and selected-company access with the business role", async () => {
    mocks.companyGroupMemberUpsert.mockResolvedValue({ id: "member-1", accessMode: "SPECIFIC_COMPANIES" });

    const response = await POST(new Request("http://localhost/api/companies", {
      method: "POST",
      body: JSON.stringify({ name: "New Company" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.companyGroupMemberUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        companyGroupId: "group-1",
        userId: "selected-user",
        role: "MEMBER",
        groupRole: "MEMBER",
        accessMode: "SPECIFIC_COMPANIES",
      }),
    }));
    expect(mocks.workspaceAccessUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        companyGroupMemberId: "member-1",
        workspaceId: "new-workspace",
        accessRole: "ADMIN",
        isActive: true,
      }),
    }));
    expect(mocks.workspaceUserCreateMany).toHaveBeenCalledWith({
      data: [{
        userId: "selected-user",
        workspaceId: "new-workspace",
        role: "MEMBER",
        businessRole: "ADMIN",
        isActive: true,
      }],
    });
  });

  it("does not create redundant workspace access for all-company members", async () => {
    mocks.companyGroupMemberUpsert.mockResolvedValue({ id: "member-1", accessMode: "ALL_COMPANIES" });

    const response = await POST(new Request("http://localhost/api/companies", {
      method: "POST",
      body: JSON.stringify({ name: "New Company" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.workspaceAccessUpsert).not.toHaveBeenCalled();
    expect(mocks.workspaceUserCreateMany).toHaveBeenCalledOnce();
  });
});
