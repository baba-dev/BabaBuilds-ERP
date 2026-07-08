import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMultiCompanyModule } from "@/app/api/companies/_shared";

function getSessionUserId(session: unknown): string | null {
  const maybeId = (session as { user?: { id?: string | null } })?.user?.id;
  return typeof maybeId === "string" && maybeId.length > 0 ? maybeId : null;
}


function getSessionWorkspaceId(session: unknown): string | null {
  const maybeWorkspaceId = (session as { workspaceId?: string | null })?.workspaceId;
  return typeof maybeWorkspaceId === "string" && maybeWorkspaceId.length > 0 ? maybeWorkspaceId : null;
}

async function validateWorkspaceAccess(userId: string, workspaceId: string) {
  const directMembership = await prisma.workspaceUser.findFirst({
    where: { userId, workspaceId, isActive: true },
    select: {
      role: true,
      businessRole: true,
      workspace: { select: { id: true, name: true, baseCurrency: true, countryCode: true, isSetupComplete: true } },
    },
  });
  if (directMembership) {
    return {
      workspace: directMembership.workspace,
      role: directMembership.role,
      businessRole: directMembership.businessRole ?? directMembership.role,
      accessSource: "DIRECT_WORKSPACE_MEMBERSHIP",
    };
  }

  const allCompaniesMembership = await prisma.companyGroupMember.findFirst({
    where: { userId, isActive: true, accessMode: "ALL_COMPANIES", companyGroup: { workspaces: { some: { workspaceId, isActive: true } } } },
    select: {
      role: true,
      groupRole: true,
      companyGroup: {
        select: {
          workspaces: {
            where: { workspaceId, isActive: true },
            take: 1,
            select: { workspace: { select: { id: true, name: true, baseCurrency: true, countryCode: true, isSetupComplete: true } } },
          },
        },
      },
    },
  });
  const allCompaniesWorkspace = allCompaniesMembership?.companyGroup.workspaces[0]?.workspace;
  if (allCompaniesMembership && allCompaniesWorkspace) {
    return { workspace: allCompaniesWorkspace, role: allCompaniesMembership.role, businessRole: allCompaniesMembership.groupRole, accessSource: "COMPANY_GROUP_ALL_COMPANIES" };
  }

  const selectedAccess = await prisma.companyGroupMemberWorkspaceAccess.findFirst({
    where: {
      workspaceId,
      isActive: true,
      companyGroupMember: {
        userId,
        isActive: true,
        accessMode: { not: "ALL_COMPANIES" },
        companyGroup: { workspaces: { some: { workspaceId, isActive: true } } },
      },
    },
    select: {
      accessRole: true,
      workspace: { select: { id: true, name: true, baseCurrency: true, countryCode: true, isSetupComplete: true } },
      companyGroupMember: { select: { role: true, groupRole: true } },
    },
  });
  if (selectedAccess) {
    return {
      workspace: selectedAccess.workspace,
      role: selectedAccess.accessRole || selectedAccess.companyGroupMember.role,
      businessRole: selectedAccess.accessRole || selectedAccess.companyGroupMember.groupRole,
      accessSource: "COMPANY_GROUP_SELECTED_COMPANIES",
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = getSessionUserId(session);
    const currentWorkspaceId = getSessionWorkspaceId(session);
    if (!userId || !currentWorkspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const moduleResponse = await requireMultiCompanyModule(currentWorkspaceId);
    if (moduleResponse) return moduleResponse;

    const body = (await request.json().catch(() => null)) as { workspaceId?: unknown } | null;
    const workspaceId = body?.workspaceId;
    if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const access = await validateWorkspaceAccess(userId, workspaceId.trim());
    if (!access) return NextResponse.json({ error: "Workspace not found or access denied" }, { status: 403 });

    return NextResponse.json({
      success: true,
      activeWorkspace: access.workspace,
      accessSource: access.accessSource,
      session: {
        workspaceId: access.workspace.id,
        baseCurrency: access.workspace.baseCurrency,
        isSetupComplete: access.workspace.isSetupComplete,
        countryCode: access.workspace.countryCode,
        role: access.role,
        businessRole: access.businessRole,
      },
    });
  } catch (error) {
    console.error("[company-context/switch/POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
