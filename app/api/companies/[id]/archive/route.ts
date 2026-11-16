import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { canManageCompanies, errorJson, requireCompanyGroupContext, requireMultiCompanyAccess } from "../../_shared";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);

    const { id } = await props.params;
    const link = await prisma.companyGroupWorkspace.findFirst({
      where: { companyGroupId: context.companyGroupId, workspaceId: id },
      select: { id: true, isPrimary: true },
    });
    if (!link) return errorJson("Company not found", 404);
    if (link.isPrimary) return errorJson("Primary company cannot be archived", 400);

    const activeCount = await prisma.companyGroupWorkspace.count({ where: { companyGroupId: context.companyGroupId, isActive: true } });
    if (activeCount <= 1) return errorJson("A group needs at least one active company.", 409);
    if (id === context.workspaceId) return errorJson("Switch to another company before archiving this one.", 409);

    const updated = await prisma.companyGroupWorkspace.update({ where: { id: link.id }, data: { isActive: false }, select: { id: true, workspaceId: true, isActive: true } });
    void logActivity({ workspaceId: context.workspaceId, action: "company.archived", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company", id } });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[companies/[id]/archive/POST]", error);
    return errorJson("Internal server error", 500);
  }
}
