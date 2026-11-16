import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { memberAddSchema } from "@/lib/companies/schemas";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { logActivity } from "@/lib/security/activity-log";
import { canManageCompanies, errorJson, requireCompanyGroupContext, requireMultiCompanyAccess } from "../_shared";

export async function GET() {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;

    const canManage = canManageCompanies(context.groupRole);
    const [members, companies] = await Promise.all([
      prisma.companyGroupMember.findMany({
        // People who can't manage the group see only themselves.
        where: { companyGroupId: context.companyGroupId, isActive: true, ...(canManage ? {} : { userId: context.userId }) },
        orderBy: { createdAt: "asc" },
        select: { id: true, userId: true, groupRole: true, accessMode: true, createdAt: true, user: { select: { name: true, email: true } }, workspaceAccess: { where: { isActive: true }, select: { workspaceId: true, accessRole: true } } },
      }),
      prisma.companyGroupWorkspace.findMany({ where: { companyGroupId: context.companyGroupId, isActive: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { workspaceId: true, workspace: { select: { name: true } } } }),
    ]);
    return NextResponse.json({ data: { members, companies: companies.map((c) => ({ workspaceId: c.workspaceId, name: c.workspace.name })) }, canManage, groupRole: context.groupRole, currentUserId: context.userId });
  } catch (error) {
    console.error("[companies/team/GET]", error);
    return errorJson("Internal server error", 500);
  }
}

/** Adds an existing user to the group by email. Only an owner can hand out owner or admin rights. */
export async function POST(request: Request) {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);
    const limit = enforceRouteRateLimit({ request, route: "/api/companies/team", scope: context.companyGroupId, max: 30, windowMs: 60 * 60_000 });
    if (!limit.ok) return limit.response;

    const parsed = memberAddSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details.", fields: z.flattenError(parsed.error).fieldErrors }, { status: 422 });
    const d = parsed.data;
    if ((d.groupRole === "GROUP_OWNER" || d.groupRole === "GROUP_ADMIN") && context.groupRole !== "GROUP_OWNER") return errorJson("Only a group owner can give owner or admin rights.", 403);

    const user = await prisma.user.findFirst({ where: { email: d.email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "No account uses that email yet. Ask them to sign up first.", fields: { email: ["No account found."] } }, { status: 404 });

    const links = await prisma.companyGroupWorkspace.findMany({ where: { companyGroupId: context.companyGroupId, isActive: true }, select: { workspaceId: true } });
    const allowed = new Set(links.map((l) => l.workspaceId));
    const access = d.accessMode === "ALL_COMPANIES" ? [] : d.access.filter((a) => allowed.has(a.workspaceId));

    const member = await prisma.$transaction(async (tx) => {
      const m = await tx.companyGroupMember.upsert({
        where: { companyGroupId_userId: { companyGroupId: context.companyGroupId, userId: user.id } },
        update: { isActive: true, groupRole: d.groupRole, role: d.groupRole === "MEMBER" ? "MEMBER" : "ADMIN", accessMode: d.accessMode },
        create: { companyGroupId: context.companyGroupId, userId: user.id, groupRole: d.groupRole, role: d.groupRole === "MEMBER" ? "MEMBER" : "ADMIN", accessMode: d.accessMode, isActive: true },
        select: { id: true },
      });
      for (const a of access) {
        await tx.companyGroupMemberWorkspaceAccess.upsert({ where: { companyGroupMemberId_workspaceId: { companyGroupMemberId: m.id, workspaceId: a.workspaceId } }, update: { accessRole: a.accessRole, isActive: true }, create: { companyGroupMemberId: m.id, workspaceId: a.workspaceId, accessRole: a.accessRole, isActive: true } });
        await tx.workspaceUser.upsert({ where: { userId_workspaceId: { userId: user.id, workspaceId: a.workspaceId } }, update: { businessRole: a.accessRole, role: a.accessRole === "OWNER" ? "OWNER" : "MEMBER", isActive: true }, create: { userId: user.id, workspaceId: a.workspaceId, businessRole: a.accessRole, role: a.accessRole === "OWNER" ? "OWNER" : "MEMBER", isActive: true } });
      }
      return m;
    });
    void logActivity({ workspaceId: context.workspaceId, action: "company.member_added", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company_group_member", id: member.id }, metadata: { groupRole: d.groupRole, accessMode: d.accessMode, companies: access.length } });
    return NextResponse.json({ data: { id: member.id } }, { status: 201 });
  } catch (error) {
    console.error("[companies/team/POST]", error);
    return errorJson("Internal server error", 500);
  }
}
