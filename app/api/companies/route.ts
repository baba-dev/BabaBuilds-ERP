import { NextResponse } from "next/server";
import { type BusinessRoleEnum, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { activeGroupMemberIds } from "@/lib/companies/access";
import { companyCreateSchema } from "@/lib/companies/schemas";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { logActivity } from "@/lib/security/activity-log";
import { getGroupReportScope } from "@/lib/company-groups/reports";
import { canManageCompanies, errorJson, requireCompanyGroupContext, requireMultiCompanyAccess } from "./_shared";

const ALL_COMPANIES_ACCESS_MODES = new Set(["ALL_COMPANIES", "ALL_COMPANIES_IN_GROUP"]);

function workspaceRoleForBusinessRole(businessRole: BusinessRoleEnum) {
  return businessRole === "OWNER" ? "OWNER" : "MEMBER";
}

const companySelect = {
  id: true,
  workspaceId: true,
  relationType: true,
  isPrimary: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  workspace: {
    select: {
      id: true,
      name: true,
      countryCode: true,
      baseCurrency: true,
      isSetupComplete: true,
      planTier: true,
      subscriptionStatus: true,
      businessProfile: true,
      users: {
        where: { isActive: true },
        select: { userId: true, role: true, businessRole: true, isActive: true, user: { select: { name: true, email: true } } },
      },
    },
  },
} satisfies Prisma.CompanyGroupWorkspaceSelect;

export async function GET() {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const moduleResponse = await requireMultiCompanyAccess(result.context);
    if (moduleResponse) return moduleResponse;

    // Members who only have access to specific companies see only those.
    const scope = await getGroupReportScope(result.context.userId, result.context.companyGroupId, { includeArchivedCompanies: true });
    const links = await prisma.companyGroupWorkspace.findMany({
      where: { companyGroupId: result.context.companyGroupId, workspaceId: { in: scope.workspaceIds } },
      select: companySelect,
      orderBy: [{ isPrimary: "desc" }, { isActive: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ data: links });
  } catch (error) {
    console.error("[companies/GET]", error);
    return errorJson("Internal server error", 500);
  }
}

export async function POST(request: Request) {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const { context } = result;
    const moduleResponse = await requireMultiCompanyAccess(context);
    if (moduleResponse) return moduleResponse;
    if (!canManageCompanies(context.groupRole)) return errorJson("Forbidden", 403);

    const limit = enforceRouteRateLimit({ request, route: "/api/companies", scope: context.companyGroupId, max: 10, windowMs: 60 * 60_000 });
    if (!limit.ok) return limit.response;

    const parsed = companyCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details.", fields: z.flattenError(parsed.error).fieldErrors }, { status: 422 });
    const d = parsed.data;

    // Everyone added to the new company must already belong to this group; the creator is always an owner.
    const selectedUsers = [...d.users];
    if (!selectedUsers.some((user) => user.userId === context.userId)) selectedUsers.push({ userId: context.userId, businessRole: "OWNER" });
    const known = await activeGroupMemberIds(context.companyGroupId, selectedUsers.map((u) => u.userId));
    const stranger = selectedUsers.find((u) => !known.has(u.userId));
    if (stranger) return NextResponse.json({ error: "Everyone you add must already be a member of this group.", fields: { users: ["Add the person to the group first."] } }, { status: 422 });

    const name = d.name;
    const countryCode = d.countryCode;
    const baseCurrency = d.baseCurrency;
    const email = d.email ?? "hello@example.com";
    const body = d as unknown as Record<string, string | null | undefined>;
    const parseString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

    const created = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          countryCode,
          baseCurrency,
          planTier: "FREE",
          subscriptionStatus: "FREE",
        },
        select: { id: true },
      });

      await tx.businessProfile.create({
        data: {
          workspaceId: workspace.id,
          companyName: name,
          proprietorName: parseString(body.proprietorName) ?? name,
          address: parseString(body.address) ?? "Not provided",
          email,
          phone: parseString(body.phone),
          website: parseString(body.website),
          panNumber: parseString(body.panNumber) ?? "NOTPROVIDED",
          udyamNumber: parseString(body.udyamNumber),
          gstin: parseString(body.gstin),
          bankName: parseString(body.bankName) ?? "Not provided",
          accountName: parseString(body.accountName) ?? name,
          accountNumber: parseString(body.accountNumber) ?? "Not provided",
          ifscCode: parseString(body.ifscCode) ?? "Not provided",
        },
      });

      const link = await tx.companyGroupWorkspace.create({
        data: {
          companyGroupId: context.companyGroupId,
          workspaceId: workspace.id,
          relationType: parseString(body.relationType) ?? "MEMBER",
          isPrimary: false,
          isActive: true,
        },
        select: { id: true },
      });

      for (const user of selectedUsers) {
        const groupMember = await tx.companyGroupMember.upsert({
          where: {
            companyGroupId_userId: {
              companyGroupId: context.companyGroupId,
              userId: user.userId,
            },
          },
          update: { isActive: true },
          create: {
            companyGroupId: context.companyGroupId,
            userId: user.userId,
            // Company-level roles must not grant group administration privileges.
            role: "MEMBER",
            groupRole: "MEMBER",
            accessMode: "SPECIFIC_COMPANIES",
            isActive: true,
          },
          select: { id: true, accessMode: true },
        });

        if (!ALL_COMPANIES_ACCESS_MODES.has(groupMember.accessMode)) {
          await tx.companyGroupMemberWorkspaceAccess.upsert({
            where: {
              companyGroupMemberId_workspaceId: {
                companyGroupMemberId: groupMember.id,
                workspaceId: workspace.id,
              },
            },
            update: { accessRole: user.businessRole, isActive: true },
            create: {
              companyGroupMemberId: groupMember.id,
              workspaceId: workspace.id,
              accessRole: user.businessRole,
              isActive: true,
            },
          });
        }
      }

      await tx.workspaceUser.createMany({
        data: selectedUsers.map((user) => ({
          userId: user.userId,
          workspaceId: workspace.id,
          role: workspaceRoleForBusinessRole(user.businessRole),
          businessRole: user.businessRole,
          isActive: true,
        })),
      });

      return tx.companyGroupWorkspace.findUniqueOrThrow({ where: { id: link.id }, select: companySelect });
    });

    void logActivity({ workspaceId: context.workspaceId, action: "company.created", status: "SUCCESS", actor: { userId: context.userId, email: null }, entity: { type: "company", id: created.workspaceId }, metadata: { name, countryCode, baseCurrency, members: selectedUsers.length } });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[companies/POST]", error);
    return errorJson("Internal server error", 500);
  }
}
