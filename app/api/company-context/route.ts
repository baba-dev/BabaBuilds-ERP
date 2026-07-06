import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type WorkspaceSummary = {
  id: string;
  name: string;
  baseCurrency: string;
  countryCode: string;
  isSetupComplete: boolean;
  enabledModules: string[];
  isArchived?: boolean;
};

type AccessibleCompany = WorkspaceSummary & { accessSources: string[] };

function getSessionUserId(session: unknown): string | null {
  const maybeId = (session as { user?: { id?: string | null } })?.user?.id;
  return typeof maybeId === "string" && maybeId.length > 0 ? maybeId : null;
}

function getSessionWorkspaceId(session: unknown): string | null {
  const maybeWorkspaceId = (session as { workspaceId?: string | null })?.workspaceId;
  return typeof maybeWorkspaceId === "string" && maybeWorkspaceId.length > 0 ? maybeWorkspaceId : null;
}

function addCompany(companyMap: Map<string, AccessibleCompany>, workspace: WorkspaceSummary | (Omit<WorkspaceSummary, "enabledModules"> & { workspaceModules: { moduleKey: string }[]; isArchived?: boolean }), accessSource: string) {
  const existing = companyMap.get(workspace.id);
  if (existing) {
    if (!existing.accessSources.includes(accessSource)) existing.accessSources.push(accessSource);
    return;
  }
  const enabledModules = "enabledModules" in workspace
    ? workspace.enabledModules
    : workspace.workspaceModules.map((module) => module.moduleKey);
  const company = "workspaceModules" in workspace
    ? { id: workspace.id, name: workspace.name, baseCurrency: workspace.baseCurrency, countryCode: workspace.countryCode, isSetupComplete: workspace.isSetupComplete, isArchived: workspace.isArchived, enabledModules }
    : { ...workspace, enabledModules };
  companyMap.set(workspace.id, { ...company, accessSources: [accessSource] });
}

async function getAccessibleCompanies(userId: string): Promise<AccessibleCompany[]> {
  const companyMap = new Map<string, AccessibleCompany>();

  const directMemberships = (await prisma.workspaceUser.findMany({
    where: { userId, isActive: true },
    select: { isActive: true, workspace: { select: { id: true, name: true, baseCurrency: true, countryCode: true, isSetupComplete: true, workspaceModules: { where: { isEnabled: true }, select: { moduleKey: true } } } } },
    orderBy: { joinedAt: "asc" },
  })) as Array<{ workspace: Omit<WorkspaceSummary, "enabledModules"> & { workspaceModules: { moduleKey: string }[] } }>;
  for (const membership of directMemberships) addCompany(companyMap, membership.workspace, "DIRECT_WORKSPACE_MEMBERSHIP");

  const groupMemberships = (await prisma.companyGroupMember.findMany({
    where: { userId, isActive: true },
    select: {
      accessMode: true,
      companyGroup: {
        select: {
          workspaces: {
            select: { isActive: true, workspace: { select: { id: true, name: true, baseCurrency: true, countryCode: true, isSetupComplete: true, workspaceModules: { where: { isEnabled: true }, select: { moduleKey: true } } } } },
          },
        },
      },
      workspaceAccess: {
        where: {
          isActive: true,
          workspace: { companyGroupLinks: { some: { isActive: true } } },
        },
        select: { isActive: true, workspace: { select: { id: true, name: true, baseCurrency: true, countryCode: true, isSetupComplete: true, workspaceModules: { where: { isEnabled: true }, select: { moduleKey: true } } } } },
      },
    },
  })) as Array<{ accessMode: string; companyGroup: { workspaces: Array<{ isActive: boolean; workspace: Omit<WorkspaceSummary, "enabledModules"> & { workspaceModules: { moduleKey: string }[] } }> }; workspaceAccess: Array<{ isActive: boolean; workspace: Omit<WorkspaceSummary, "enabledModules"> & { workspaceModules: { moduleKey: string }[] } }> }>;

  for (const membership of groupMemberships) {
    if (membership.accessMode === "ALL_COMPANIES") {
      for (const link of membership.companyGroup.workspaces) addCompany(companyMap, { ...link.workspace, isArchived: !link.isActive }, "COMPANY_GROUP_ALL_COMPANIES");
    } else {
      for (const access of membership.workspaceAccess) addCompany(companyMap, { ...access.workspace, isArchived: !access.isActive }, "COMPANY_GROUP_SELECTED_COMPANIES");
    }
  }

  return Array.from(companyMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = getSessionUserId(session);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const accessibleCompanies = await getAccessibleCompanies(userId);
    const sessionWorkspaceId = getSessionWorkspaceId(session);
    const activeWorkspace = accessibleCompanies.find((company) => company.id === sessionWorkspaceId) ?? accessibleCompanies[0] ?? null;

    const activeGroupLinks = activeWorkspace
      ? (await prisma.companyGroupWorkspace.findMany({
          where: { workspaceId: activeWorkspace.id, isActive: true },
          select: {
            relationType: true,
            isPrimary: true,
            companyGroup: { select: { id: true, name: true, planTier: true, subscriptionStatus: true, billingWorkspaceId: true } },
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        })) as Array<{ relationType: string; isPrimary: boolean; companyGroup: { id: string; name: string; planTier: string; subscriptionStatus: string; billingWorkspaceId: string | null } }>
      : [];

    const primaryGroupLink = activeGroupLinks[0];

    return NextResponse.json({
      activeWorkspace,
      group: primaryGroupLink
        ? {
            id: primaryGroupLink.companyGroup.id,
            name: primaryGroupLink.companyGroup.name,
            planTier: primaryGroupLink.companyGroup.planTier,
            subscriptionStatus: primaryGroupLink.companyGroup.subscriptionStatus,
            billingWorkspaceId: primaryGroupLink.companyGroup.billingWorkspaceId,
            relationType: primaryGroupLink.relationType,
            isPrimary: primaryGroupLink.isPrimary,
          }
        : null,
      accessibleCompanies,
      multiCompanyEnabled: Boolean(activeWorkspace?.enabledModules.includes("MULTI_COMPANY")) && (accessibleCompanies.length > 1 || activeGroupLinks.length > 0),
    });
  } catch (error) {
    console.error("[company-context/GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
