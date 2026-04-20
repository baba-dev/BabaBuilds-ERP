import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, DistributorCommissionStatus } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

/**
 * Read-only partner portal data for the logged-in user linked to a Distributor.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!session || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { distributorPartnerId: true, email: true },
    });
    if (!user?.distributorPartnerId) {
      return NextResponse.json({ error: "Not a partner account" }, { status: 403 });
    }

    const distributor = await prisma.distributor.findUnique({
      where: { id: user.distributorPartnerId },
      include: {
        coupons: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            code: true,
            isActive: true,
            usedCount: true,
            maxUses: true,
            customerDiscountPercent: true,
            marginPercent: true,
          },
        },
        _count: {
          select: { attributions: true, commissions: true },
        },
      },
    });

    if (!distributor) {
      return NextResponse.json({ error: "Partner record not found" }, { status: 404 });
    }

    const agg = await prisma.distributorCommission.aggregate({
      where: {
        distributorId: distributor.id,
        status: { in: [DistributorCommissionStatus.PENDING, DistributorCommissionStatus.APPROVED] },
      },
      _sum: { commissionAmount: true },
    });

    const paidAgg = await prisma.distributorCommission.aggregate({
      where: {
        distributorId: distributor.id,
        status: DistributorCommissionStatus.PAID,
      },
      _sum: { commissionAmount: true },
    });

    const recent = await prisma.distributorCommission.findMany({
      where: { distributorId: distributor.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        workspace: { select: { name: true } },
        coupon: { select: { code: true } },
      },
    });

    return NextResponse.json({
      distributor: {
        id: distributor.id,
        name: distributor.name,
        email: distributor.email,
        status: distributor.status,
        defaultMarginBasis: distributor.defaultMarginBasis,
      },
      counts: {
        attributions: distributor._count.attributions,
        commissions: distributor._count.commissions,
      },
      outstandingCommission: toNumber(agg._sum.commissionAmount),
      paidCommission: toNumber(paidAgg._sum.commissionAmount),
      coupons: distributor.coupons.map((c) => ({
        id: c.id,
        code: c.code,
        isActive: c.isActive,
        usedCount: c.usedCount,
        maxUses: c.maxUses,
        customerDiscountPercent: toNumber(c.customerDiscountPercent),
        marginPercent: toNumber(c.marginPercent),
      })),
      recentCommissions: recent.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        workspaceName: r.workspace.name,
        couponCode: r.coupon?.code ?? null,
        commissionAmount: toNumber(r.commissionAmount),
        listAmount: toNumber(r.listAmount),
        paidAmount: toNumber(r.paidAmount),
      })),
    });
  } catch (error) {
    console.error("GET /api/partner/distributor", error);
    return NextResponse.json({ error: "Failed to load partner data" }, { status: 500 });
  }
}
