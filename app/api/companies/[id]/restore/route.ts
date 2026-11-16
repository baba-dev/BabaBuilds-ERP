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
    const link = await prisma.companyGroupWorkspace.findFirst({ where: { companyGroupId: context.companyGroupId, workspaceId: id }, select: { id: true } });
    if (!link) return errorJson("Company not found", 404);

    const updated = await prisma.companyGroupWorkspace.update({ where: { id: link.id }, data: { isActive: true }, select: { id: true, workspaceId: true, isActive: true } });
    void logActivity({ workspaceId: context.workspaceId, action: "company.restored", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company", id } });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[companies/[id]/restore/POST]", error);
    return errorJson("Internal server error", 500);
  }
}
