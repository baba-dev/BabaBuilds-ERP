import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { authOptions } from "@/lib/auth";
import { DistributorMarginBasis, Prisma } from "@prisma/client";
import { logDistributorAudit } from "@/lib/distributor-audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    await verifySuperAdmin();
    const session = await getServerSession(authOptions);
    const actorEmail = session?.user?.email ?? null;

    const { id } = await context.params;
    const body = await req.json();

    const data: {
      name?: string;
      email?: string;
      status?: string;
      defaultMarginPercent?: number;
      defaultMarginBasis?: DistributorMarginBasis;
      marginByPlanJson?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      notes?: string | null;
    } = {};

    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.email === "string" && body.email.trim()) {
      data.email = body.email.trim().toLowerCase();
    }
    if (body?.status === "ACTIVE" || body?.status === "INACTIVE") data.status = body.status;
    if (typeof body?.defaultMarginPercent === "number") data.defaultMarginPercent = body.defaultMarginPercent;
    if (body?.defaultMarginBasis === "LIST" || body?.defaultMarginBasis === "PAID") {
      data.defaultMarginBasis = body.defaultMarginBasis as DistributorMarginBasis;
    }
    if (body?.marginByPlanJson === null) {
      data.marginByPlanJson = Prisma.JsonNull;
    } else if (typeof body?.marginByPlanJson === "object" && body.marginByPlanJson !== null) {
      data.marginByPlanJson = body.marginByPlanJson as Prisma.InputJsonValue;
    }
    if (body?.notes !== undefined) data.notes = typeof body.notes === "string" ? body.notes : null;

    const distributor = await prisma.distributor.update({
      where: { id },
      data,
    });

    await logDistributorAudit({
      distributorId: id,
      actorEmail,
      action: "distributor.updated",
      metadata: { fields: Object.keys(data) },
    });

    return NextResponse.json({ distributor });
  } catch (error) {
    return handleAdminApiError(error, "Failed to update distributor");
  }
}
