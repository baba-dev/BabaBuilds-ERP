import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../../authz";
import { authOptions } from "@/lib/auth";
import { logDistributorAudit } from "@/lib/distributor-audit";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Link a User account to this distributor for read-only partner portal access.
 * POST { userEmail: string } — set partner; POST { clear: true } — remove link from any user.
 */
export async function POST(req: Request, context: RouteContext) {
  try {
    await verifySuperAdmin();
    const session = await getServerSession(authOptions);
    const actorEmail = session?.user?.email ?? null;

    const { id: distributorId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const dist = await prisma.distributor.findUnique({ where: { id: distributorId } });
    if (!dist) {
      return NextResponse.json({ error: "Distributor not found" }, { status: 404 });
    }

    if (body?.clear === true) {
      await prisma.user.updateMany({
        where: { distributorPartnerId: distributorId },
        data: { distributorPartnerId: null },
      });
      await logDistributorAudit({
        distributorId,
        actorEmail,
        action: "partner.portal_unlinked",
        metadata: {},
      });
      return NextResponse.json({ ok: true });
    }

    const userEmail =
      typeof body?.userEmail === "string" ? body.userEmail.trim().toLowerCase() : "";
    if (!userEmail) {
      return NextResponse.json({ error: "userEmail is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.updateMany({
      where: { distributorPartnerId: distributorId },
      data: { distributorPartnerId: null },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { distributorPartnerId: distributorId },
    });

    await logDistributorAudit({
      distributorId,
      actorEmail,
      action: "partner.portal_linked",
      metadata: { userEmail },
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (error) {
    return handleAdminApiError(error, "Failed to link partner user");
  }
}
