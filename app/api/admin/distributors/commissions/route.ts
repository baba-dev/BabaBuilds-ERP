import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { Prisma, DistributorCommissionStatus } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function GET() {
  try {
    await verifySuperAdmin();

    const rows = await prisma.distributorCommission.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        distributor: { select: { id: true, name: true, email: true } },
        coupon: { select: { id: true, code: true } },
        workspace: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        marginBasisUsed: r.marginBasisUsed,
        distributorId: r.distributorId,
        distributorName: r.distributor.name,
        couponCode: r.coupon?.code ?? null,
        workspaceName: r.workspace.name,
        listAmount: toNumber(r.listAmount),
        paidAmount: toNumber(r.paidAmount),
        marginPercent: toNumber(r.marginPercent),
        commissionAmount: toNumber(r.commissionAmount),
        payoutId: r.payoutId,
        clawbackReason: r.clawbackReason,
      })),
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load commissions");
  }
}

/** POST { commissionIds: string[], status: "APPROVED" } */
export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();
    const ids = Array.isArray(body?.commissionIds) ? body.commissionIds.filter((x: unknown) => typeof x === "string") : [];
    const status = body?.status === "APPROVED" ? DistributorCommissionStatus.APPROVED : null;
    if (!ids.length || !status) {
      return NextResponse.json({ error: "commissionIds and status APPROVED required" }, { status: 400 });
    }

    await prisma.distributorCommission.updateMany({
      where: {
        id: { in: ids },
        status: DistributorCommissionStatus.PENDING,
      },
      data: { status },
    });

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (error) {
    return handleAdminApiError(error, "Failed to update commissions");
  }
}
