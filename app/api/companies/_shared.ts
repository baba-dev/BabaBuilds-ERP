import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma, type BusinessRoleEnum } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";

export const MANAGE_GROUP_ROLES = new Set(["GROUP_OWNER", "GROUP_ADMIN"]);
export const OWNER_GROUP_ROLES = new Set(["GROUP_OWNER"]);
export const MULTI_COMPANY_MODULE_KEY = "MULTI_COMPANY";

export type CompanyGroupContext = {
  userId: string;
  workspaceId: string;
  companyGroupId: string;
  groupRole: string;
  accessMode: string;
};

export function errorJson(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireCompanyGroupContext(): Promise<{ context: CompanyGroupContext } | { response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const userId = (session as { user?: { id?: string | null }; workspaceId?: string | null } | null)?.user?.id;
  const workspaceId = (session as { workspaceId?: string | null } | null)?.workspaceId;
  const sessionGroupId = (session as { groupId?: string | null } | null)?.groupId;

  if (!userId || !workspaceId) return { response: errorJson("Unauthorized", 401) };

  const activeLinks = await prisma.companyGroupWorkspace.findMany({
    where: { workspaceId, isActive: true },
    select: { companyGroupId: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { companyGroupId: "asc" }],
  });

  if (activeLinks.length === 0) return { response: errorJson("Company group not found for active workspace", 404) };

  const selectedGroupId = sessionGroupId?.trim() || null;
  if (!selectedGroupId && activeLinks.length > 1) {
    return { response: errorJson("Multiple company groups are available for the active workspace. Select a company group before continuing.", 400) };
  }

  const activeLink = selectedGroupId
    ? activeLinks.find((link) => link.companyGroupId === selectedGroupId) ?? null
    : activeLinks[0] ?? null;

  if (!activeLink) return { response: errorJson("Selected company group is not linked to the active workspace", 403) };

  const membership = await prisma.companyGroupMember.findUnique({
    where: { companyGroupId_userId: { companyGroupId: activeLink.companyGroupId, userId } },
    select: { groupRole: true, accessMode: true, isActive: true },
  });

  if (!membership?.isActive) return { response: errorJson("Forbidden", 403) };

  return {
    context: {
      userId,
      workspaceId,
      companyGroupId: activeLink.companyGroupId,
      groupRole: membership.groupRole,
      accessMode: membership.accessMode,
    },
  };
}

export async function requireMultiCompanyModule(workspaceId: string): Promise<NextResponse | null> {
  const enabled = await isModuleEnabled(workspaceId, MULTI_COMPANY_MODULE_KEY);
  return enabled ? null : errorJson("Multi-company module is not enabled", 403);
}

export async function requireMultiCompanyAccess(context: Pick<CompanyGroupContext, "workspaceId">): Promise<NextResponse | null> {
  return requireMultiCompanyModule(context.workspaceId);
}

export function canManageCompanies(groupRole: string) {
  return MANAGE_GROUP_ROLES.has(groupRole);
}

export function canManageSubscription(groupRole: string) {
  return OWNER_GROUP_ROLES.has(groupRole);
}

export function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseWorkspaceUsers(value: unknown): Array<{ userId: string; businessRole: BusinessRoleEnum }> {
  if (!Array.isArray(value)) return [];
  const allowedRoles = new Set<BusinessRoleEnum>([
    "OWNER",
    "ADMIN",
    "FINANCE_MANAGER",
    "ACCOUNTANT",
    "SALES_MANAGER",
    "OPERATIONS_MANAGER",
    "INVENTORY_MANAGER",
    "STAFF",
    "VIEWER",
  ]);

  const seen = new Set<string>();
  const users: Array<{ userId: string; businessRole: BusinessRoleEnum }> = [];
  for (const item of value) {
    const userId = typeof item === "string" ? item : parseString((item as { userId?: unknown })?.userId);
    if (!userId || seen.has(userId)) continue;
    const requestedRole = typeof item === "object" && item !== null ? (item as { businessRole?: unknown; role?: unknown }).businessRole ?? (item as { role?: unknown }).role : undefined;
    const businessRole = typeof requestedRole === "string" && allowedRoles.has(requestedRole as BusinessRoleEnum) ? (requestedRole as BusinessRoleEnum) : "STAFF";
    users.push({ userId, businessRole });
    seen.add(userId);
  }
  return users;
}

export function subscriptionUpdateFromBody(body: Record<string, unknown>) {
  const data: Prisma.CompanyGroupUpdateInput = {};
  const planTier = parseString(body.planTier);
  const subscriptionStatus = parseString(body.subscriptionStatus);
  const billingWorkspaceId = parseNullableString(body.billingWorkspaceId);
  if (planTier) data.planTier = planTier;
  if (subscriptionStatus) data.subscriptionStatus = subscriptionStatus;
  if (billingWorkspaceId !== undefined) data.billingWorkspace = billingWorkspaceId ? { connect: { id: billingWorkspaceId } } : { disconnect: true };
  return data;
}
