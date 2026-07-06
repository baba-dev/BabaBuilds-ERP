import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageCompanies, canManageSubscription, errorJson, parseNullableString, parseString, parseWorkspaceUsers, requireCompanyGroupContext, subscriptionUpdateFromBody } from "../_shared";

const companySelect = {
  id: true,
  workspaceId: true,
  relationType: true,
  isPrimary: true,
  isActive: true,
  workspace: { select: { id: true, name: true, countryCode: true, baseCurrency: true, isSetupComplete: true, businessProfile: true, users: { where: { isActive: true }, select: { userId: true, businessRole: true, role: true, isActive: true } } } },
} satisfies Prisma.CompanyGroupWorkspaceSelect;

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);

    const { id } = await props.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return errorJson("Invalid JSON body", 400);

    const link = await prisma.companyGroupWorkspace.findFirst({ where: { companyGroupId: context.companyGroupId, workspaceId: id }, select: { id: true, workspaceId: true } });
    if (!link) return errorJson("Company not found", 404);

    const name = parseString(body.name) ?? parseString(body.companyName);
    const profileData: Prisma.BusinessProfileUpdateInput = {};
    for (const key of ["companyName", "proprietorName", "address", "email", "phone", "website", "panNumber", "udyamNumber", "gstin", "bankName", "accountName", "accountNumber", "ifscCode"] as const) {
      const value = parseNullableString(body[key]);
      if (value !== undefined) (profileData as Record<string, string | null>)[key] = value;
    }
    if (name && !profileData.companyName) profileData.companyName = name;

    const selectedUsers = parseWorkspaceUsers(body.users ?? body.selectedUsers ?? body.userIds);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(parseString(body.countryCode) ? { countryCode: parseString(body.countryCode) } : {}),
          ...(parseString(body.baseCurrency) ? { baseCurrency: parseString(body.baseCurrency) } : {}),
        },
      });

      if (Object.keys(profileData).length > 0) await tx.businessProfile.update({ where: { workspaceId: id }, data: profileData });

      if (selectedUsers.length > 0) {
        for (const user of selectedUsers) {
          await tx.workspaceUser.upsert({
            where: { userId_workspaceId: { userId: user.userId, workspaceId: id } },
            update: { businessRole: user.businessRole, role: user.businessRole === "OWNER" ? "OWNER" : "MEMBER", isActive: true },
            create: { userId: user.userId, workspaceId: id, businessRole: user.businessRole, role: user.businessRole === "OWNER" ? "OWNER" : "MEMBER", isActive: true },
          });
        }
      }

      if (canManageSubscription(context.groupRole)) {
        const subData = subscriptionUpdateFromBody(body);
        if (Object.keys(subData).length > 0) await tx.companyGroup.update({ where: { id: context.companyGroupId }, data: subData });
      }

      return tx.companyGroupWorkspace.findUniqueOrThrow({ where: { id: link.id }, select: companySelect });
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[companies/[id]/PATCH]", error);
    return errorJson("Internal server error", 500);
  }
}
