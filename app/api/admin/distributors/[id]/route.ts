import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  try {
    await verifySuperAdmin();
    const { id } = await context.params;
    const body = await req.json();

    const data: {
      name?: string;
      email?: string;
      status?: string;
      defaultMarginPercent?: number;
    } = {};

    if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body?.email === "string" && body.email.trim()) {
      data.email = body.email.trim().toLowerCase();
    }
    if (body?.status === "ACTIVE" || body?.status === "INACTIVE") data.status = body.status;
    if (typeof body?.defaultMarginPercent === "number") data.defaultMarginPercent = body.defaultMarginPercent;

    const distributor = await prisma.distributor.update({
      where: { id },
      data,
    });

    return NextResponse.json({ distributor });
  } catch (error) {
    return handleAdminApiError(error, "Failed to update distributor");
  }
}
