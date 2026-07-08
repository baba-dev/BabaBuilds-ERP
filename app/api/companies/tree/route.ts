import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorJson, requireCompanyGroupContext, requireMultiCompanyAccess } from "../_shared";

export async function GET() {
  try {
    const result = await requireCompanyGroupContext();
    if ("response" in result) return result.response;
    const moduleResponse = await requireMultiCompanyAccess(result.context);
    if (moduleResponse) return moduleResponse;

    const group = await prisma.companyGroup.findUnique({
      where: { id: result.context.companyGroupId },
      select: {
        id: true,
        name: true,
        planTier: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        billingWorkspaceId: true,
        workspaces: {
          where: { isActive: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            relationType: true,
            isPrimary: true,
            workspace: {
              select: {
                id: true,
                name: true,
                countryCode: true,
                baseCurrency: true,
                businessProfile: { select: { companyName: true, email: true, phone: true, gstin: true, panNumber: true } },
              },
            },
          },
        },
        members: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, userId: true, groupRole: true, role: true, accessMode: true, user: { select: { name: true, email: true } } },
        },
      },
    });

    if (!group) return errorJson("Company group not found", 404);
    return NextResponse.json({ data: group, currentUserGroupRole: result.context.groupRole });
  } catch (error) {
    console.error("[companies/tree/GET]", error);
    return errorJson("Internal server error", 500);
  }
}
