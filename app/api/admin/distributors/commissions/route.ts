import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { Prisma } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function GET() {
  try {
    await verifySuperAdmin();

    const rows = await prisma.distributorCommission.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
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
        distributorName: r.distributor.name,
        couponCode: r.coupon?.code ?? null,
        workspaceName: r.workspace.name,
        listAmount: toNumber(r.listAmount),
        paidAmount: toNumber(r.paidAmount),
        marginPercent: toNumber(r.marginPercent),
        commissionAmount: toNumber(r.commissionAmount),
      })),
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load commissions");
  }
}
