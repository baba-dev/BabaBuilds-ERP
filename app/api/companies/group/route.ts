import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { groupPatchSchema } from "@/lib/companies/schemas";
import { logActivity } from "@/lib/security/activity-log";
import { canManageCompanies, errorJson, requireCompanyGroupContext, requireMultiCompanyAccess } from "../_shared";

/** Group identity and billing summary (plan and seats are read-only here; they change through the payment flow). */
export async function GET() {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    const [group, companies, members, modules] = await Promise.all([
      prisma.companyGroup.findUnique({ where: { id: context.companyGroupId }, select: { id: true, name: true, planTier: true, subscriptionStatus: true, subscriptionEndsAt: true, billingWorkspaceId: true, billingWorkspace: { select: { name: true } } } }),
      prisma.companyGroupWorkspace.findMany({ where: { companyGroupId: context.companyGroupId }, select: { workspaceId: true, isActive: true, workspace: { select: { name: true, planTier: true, subscriptionStatus: true } } } }),
      prisma.companyGroupMember.count({ where: { companyGroupId: context.companyGroupId, isActive: true } }),
      prisma.workspaceModule.groupBy({ by: ["moduleKey"], where: { isEnabled: true, workspace: { companyGroupLinks: { some: { companyGroupId: context.companyGroupId, isActive: true } } } }, _count: { _all: true } }),
    ]);
    if (!group) return errorJson("Company group not found", 404);
    return NextResponse.json({ data: { group, companies: companies.map((c) => ({ workspaceId: c.workspaceId, name: c.workspace.name, isActive: c.isActive, planTier: c.workspace.planTier, subscriptionStatus: c.workspace.subscriptionStatus })), members, modules: modules.map((m) => ({ moduleKey: m.moduleKey, companies: m._count._all })) }, groupRole: context.groupRole, canManage: canManageCompanies(context.groupRole) });
  } catch (error) {
    console.error("[companies/group/GET]", error);
    return errorJson("Internal server error", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);
    const parsed = groupPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details.", fields: z.flattenError(parsed.error).fieldErrors }, { status: 422 });
    const group = await prisma.companyGroup.update({ where: { id: context.companyGroupId }, data: { name: parsed.data.name }, select: { id: true, name: true } });
    void logActivity({ workspaceId: context.workspaceId, action: "company.group_renamed", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company_group", id: group.id }, metadata: { name: group.name } });
    return NextResponse.json({ data: group });
  } catch (error) {
    console.error("[companies/group/PATCH]", error);
    return errorJson("Internal server error", 500);
  }
}
