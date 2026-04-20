import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { DistributorCommissionStatus, DistributorPayoutStatus, Prisma } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function GET() {
  try {
    await verifySuperAdmin();
    const payouts = await prisma.distributorPayout.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        distributor: { select: { id: true, name: true, email: true } },
        _count: { select: { commissions: true } },
      },
    });
    return NextResponse.json({
      items: payouts.map((p) => ({
        id: p.id,
        distributorId: p.distributorId,
        distributorName: p.distributor.name,
        status: p.status,
        periodLabel: p.periodLabel,
        totalAmount: toNumber(p.totalAmount),
        method: p.method,
        reference: p.reference,
        paidAt: p.paidAt,
        commissionCount: p._count.commissions,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load payouts");
  }
}

/**
 * POST { distributorId, commissionIds[], method?, reference?, periodLabel? }
 * Marks commissions PAID and records a payout batch.
 */
export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();
    const distributorId = typeof body?.distributorId === "string" ? body.distributorId : null;
    const commissionIds = Array.isArray(body?.commissionIds) ? body.commissionIds.filter((x: unknown) => typeof x === "string") : [];
    if (!distributorId || commissionIds.length === 0) {
      return NextResponse.json({ error: "distributorId and commissionIds required" }, { status: 400 });
    }

    const method = typeof body?.method === "string" ? body.method : "MANUAL";
    const reference = typeof body?.reference === "string" ? body.reference : null;
    const periodLabel = typeof body?.periodLabel === "string" ? body.periodLabel : null;

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.distributorCommission.findMany({
        where: {
          id: { in: commissionIds },
          distributorId,
          status: { in: [DistributorCommissionStatus.PENDING, DistributorCommissionStatus.APPROVED] },
        },
      });
      if (rows.length !== commissionIds.length) {
        throw new Error("Some commissions are missing or not payable");
      }
      const total = rows.reduce((s, r) => s + toNumber(r.commissionAmount), 0);

      const payout = await tx.distributorPayout.create({
        data: {
          distributorId,
          status: DistributorPayoutStatus.PAID,
          periodLabel,
          totalAmount: total,
          method,
          reference,
          paidAt: new Date(),
        },
      });

      await tx.distributorCommission.updateMany({
        where: { id: { in: commissionIds } },
        data: {
          status: DistributorCommissionStatus.PAID,
          payoutId: payout.id,
        },
      });

      return { payout, total };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error, "Payout failed");
  }
}
