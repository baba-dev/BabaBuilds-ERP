import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageCompanies, errorJson, parseString, parseWorkspaceUsers, requireCompanyGroupContext, requireMultiCompanyAccess } from "./_shared";

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

    const links = await prisma.companyGroupWorkspace.findMany({
      where: { companyGroupId: result.context.companyGroupId },
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

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return errorJson("Invalid JSON body", 400);

    const name = parseString(body.name) ?? parseString(body.companyName);
    if (!name) return errorJson("Company name is required", 400);

    const selectedUsers = parseWorkspaceUsers(body.users ?? body.selectedUsers ?? body.userIds);
    if (!selectedUsers.some((user) => user.userId === context.userId)) selectedUsers.push({ userId: context.userId, businessRole: "OWNER" });

    const countryCode = parseString(body.countryCode) ?? "IN";
    const baseCurrency = parseString(body.baseCurrency) ?? "INR";
    const email = parseString(body.email) ?? "hello@example.com";

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

      await tx.workspaceUser.createMany({
        data: selectedUsers.map((user) => ({
          userId: user.userId,
          workspaceId: workspace.id,
          role: user.businessRole === "OWNER" ? "OWNER" : "MEMBER",
          businessRole: user.businessRole,
          isActive: true,
        })),
      });

      return tx.companyGroupWorkspace.findUniqueOrThrow({ where: { id: link.id }, select: companySelect });
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[companies/POST]", error);
    return errorJson("Internal server error", 500);
  }
}
