import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { activeGroupMemberIds } from "@/lib/companies/access";
import { companyPatchSchema } from "@/lib/companies/schemas";
import { logActivity } from "@/lib/security/activity-log";
import { canManageCompanies, canManageSubscription, errorJson, parseNullableString, parseString, parseWorkspaceUsers, requireCompanyGroupContext, requireMultiCompanyAccess } from "../_shared";

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
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);

    const { id } = await props.params;
    const parsed = companyPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details.", fields: z.flattenError(parsed.error).fieldErrors }, { status: 422 });
    const body = parsed.data as Record<string, unknown>;

    const link = await prisma.companyGroupWorkspace.findFirst({ where: { companyGroupId: context.companyGroupId, workspaceId: id }, select: { id: true, workspaceId: true } });
    if (!link) return errorJson("Company not found", 404);

    const name = parseString(body.name) ?? parseString(body.companyName);
    const profileData: Prisma.BusinessProfileUpdateInput = {};
    for (const key of ["companyName", "proprietorName", "address", "email", "phone", "website", "panNumber", "udyamNumber", "gstin", "bankName", "accountName", "accountNumber", "ifscCode"] as const) {
      const value = parseNullableString(body[key]);
      if (value !== undefined) (profileData as Record<string, string | null>)[key] = value;
    }
    if (name && !profileData.companyName) profileData.companyName = name;

    const selectedUsers = parseWorkspaceUsers(body.users);
    // Only people who already belong to this group can be given a role in a company.
    const known = await activeGroupMemberIds(context.companyGroupId, selectedUsers.map((u) => u.userId));
    if (selectedUsers.some((u) => !known.has(u.userId))) return NextResponse.json({ error: "Everyone you add must already be a member of this group.", fields: { users: ["Add the person to the group first."] } }, { status: 422 });
    const billingWorkspaceId = parseNullableString(body.billingWorkspaceId);
    if (billingWorkspaceId) {
      const inGroup = await prisma.companyGroupWorkspace.findFirst({ where: { companyGroupId: context.companyGroupId, workspaceId: billingWorkspaceId, isActive: true }, select: { id: true } });
      if (!inGroup) return NextResponse.json({ error: "The billing company must be an active company in this group.", fields: { billingWorkspaceId: ["Pick a company from this group."] } }, { status: 422 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(parseString(body.countryCode) ? { countryCode: parseString(body.countryCode) } : {}),
          ...(parseString(body.baseCurrency) ? { baseCurrency: parseString(body.baseCurrency) } : {}),
        },
      });

      if (typeof body.relationType === "string") await tx.companyGroupWorkspace.update({ where: { id: link.id }, data: { relationType: body.relationType } });
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

      // Plan and subscription status are only ever changed by the payment flow, never from here.
      if (canManageSubscription(context.groupRole) && billingWorkspaceId !== undefined) {
        await tx.companyGroup.update({ where: { id: context.companyGroupId }, data: { billingWorkspace: billingWorkspaceId ? { connect: { id: billingWorkspaceId } } : { disconnect: true } } });
      }

      return tx.companyGroupWorkspace.findUniqueOrThrow({ where: { id: link.id }, select: companySelect });
    });

    void logActivity({ workspaceId: context.workspaceId, action: "company.updated", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company", id }, metadata: { fields: Object.keys(body) } });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[companies/[id]/PATCH]", error);
    return errorJson("Internal server error", 500);
  }
}
