import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { countActiveOwners } from "@/lib/companies/access";
import { memberPatchSchema } from "@/lib/companies/schemas";
import { logActivity } from "@/lib/security/activity-log";
import { canManageCompanies, errorJson, requireCompanyGroupContext, requireMultiCompanyAccess } from "../../_shared";

type Ctx = { params: Promise<{ memberId: string }> };

async function loadTarget(groupId: string, memberId: string) {
  return prisma.companyGroupMember.findFirst({ where: { id: memberId, companyGroupId: groupId, isActive: true }, select: { id: true, userId: true, groupRole: true } });
}

/** Change a member's group role, access mode or per-company roles. The last owner can never lose ownership. */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);

    const { memberId } = await params;
    const target = await loadTarget(context.companyGroupId, memberId);
    if (!target) return errorJson("Member not found", 404);
    const parsed = memberPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details.", fields: z.flattenError(parsed.error).fieldErrors }, { status: 422 });
    const d = parsed.data;

    const isOwner = context.groupRole === "GROUP_OWNER";
    if (!isOwner && (target.groupRole === "GROUP_OWNER" || target.groupRole === "GROUP_ADMIN")) return errorJson("Only a group owner can change an owner or admin.", 403);
    if (d.groupRole && !isOwner && (d.groupRole === "GROUP_OWNER" || d.groupRole === "GROUP_ADMIN")) return errorJson("Only a group owner can give owner or admin rights.", 403);
    if (d.groupRole && target.groupRole === "GROUP_OWNER" && d.groupRole !== "GROUP_OWNER" && (await countActiveOwners(context.companyGroupId, target.id)) === 0) return errorJson("A group needs at least one owner.", 409);

    const links = await prisma.companyGroupWorkspace.findMany({ where: { companyGroupId: context.companyGroupId }, select: { workspaceId: true } });
    const allowed = new Set(links.map((l) => l.workspaceId));
    await prisma.$transaction(async (tx) => {
      if (d.groupRole || d.accessMode) {
        await tx.companyGroupMember.update({ where: { id: target.id }, data: { ...(d.groupRole ? { groupRole: d.groupRole, role: d.groupRole === "MEMBER" ? "MEMBER" : "ADMIN" } : {}), ...(d.accessMode ? { accessMode: d.accessMode } : {}) } });
      }
      if (d.access) {
        const wanted = d.access.filter((a) => allowed.has(a.workspaceId));
        await tx.companyGroupMemberWorkspaceAccess.updateMany({ where: { companyGroupMemberId: target.id, workspaceId: { notIn: wanted.map((a) => a.workspaceId) } }, data: { isActive: false } });
        for (const a of wanted) {
          await tx.companyGroupMemberWorkspaceAccess.upsert({ where: { companyGroupMemberId_workspaceId: { companyGroupMemberId: target.id, workspaceId: a.workspaceId } }, update: { accessRole: a.accessRole, isActive: true }, create: { companyGroupMemberId: target.id, workspaceId: a.workspaceId, accessRole: a.accessRole, isActive: true } });
          await tx.workspaceUser.upsert({ where: { userId_workspaceId: { userId: target.userId, workspaceId: a.workspaceId } }, update: { businessRole: a.accessRole, role: a.accessRole === "OWNER" ? "OWNER" : "MEMBER", isActive: true }, create: { userId: target.userId, workspaceId: a.workspaceId, businessRole: a.accessRole, role: a.accessRole === "OWNER" ? "OWNER" : "MEMBER", isActive: true } });
        }
      }
    });
    void logActivity({ workspaceId: context.workspaceId, action: "company.member_updated", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company_group_member", id: target.id }, metadata: { groupRole: d.groupRole ?? null, accessMode: d.accessMode ?? null, companies: d.access?.length ?? null } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[companies/team/PATCH]", error);
    return errorJson("Internal server error", 500);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);

    const { memberId } = await params;
    const target = await loadTarget(context.companyGroupId, memberId);
    if (!target) return errorJson("Member not found", 404);
    if (context.groupRole !== "GROUP_OWNER" && (target.groupRole === "GROUP_OWNER" || target.groupRole === "GROUP_ADMIN")) return errorJson("Only a group owner can remove an owner or admin.", 403);
    if (target.groupRole === "GROUP_OWNER" && (await countActiveOwners(context.companyGroupId, target.id)) === 0) return errorJson("A group needs at least one owner.", 409);

    await prisma.$transaction([
      prisma.companyGroupMember.update({ where: { id: target.id }, data: { isActive: false } }),
      prisma.companyGroupMemberWorkspaceAccess.updateMany({ where: { companyGroupMemberId: target.id }, data: { isActive: false } }),
    ]);
    void logActivity({ workspaceId: context.workspaceId, action: "company.member_removed", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company_group_member", id: target.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[companies/team/DELETE]", error);
    return errorJson("Internal server error", 500);
  }
}
