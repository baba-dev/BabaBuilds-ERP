import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { Prisma, DistributorMarginBasis } from "@prisma/client";
import { logDistributorAudit } from "@/lib/distributor-audit";
import { authOptions } from "@/lib/auth";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

function randomSuffix(len: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function GET() {
  try {
    await verifySuperAdmin();

    const items = await prisma.distributor.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { coupons: true } },
      },
    });

    const commissionSums = await prisma.distributorCommission.groupBy({
      by: ["distributorId"],
      _sum: { commissionAmount: true },
    });
    const sumByDist = new Map(commissionSums.map((r) => [r.distributorId, toNumber(r._sum.commissionAmount)]));

    return NextResponse.json({
      items: items.map((d) => ({
        id: d.id,
        name: d.name,
        email: d.email,
        status: d.status,
        defaultMarginPercent: toNumber(d.defaultMarginPercent),
        defaultMarginBasis: d.defaultMarginBasis,
        marginByPlanJson: d.marginByPlanJson,
        couponCount: d._count.coupons,
        totalCommissionAmount: sumByDist.get(d.id) ?? 0,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load distributors");
  }
}

export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const session = await getServerSession(authOptions);
    const actorEmail = session?.user?.email ?? null;

    const body = await req.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const defaultMarginPercent =
      typeof body?.defaultMarginPercent === "number" ? body.defaultMarginPercent : 10;
    const defaultMarginBasis =
      body?.defaultMarginBasis === "PAID" ? DistributorMarginBasis.PAID : DistributorMarginBasis.LIST;
    const marginByPlanJson =
      body?.marginByPlanJson && typeof body.marginByPlanJson === "object"
        ? (body.marginByPlanJson as Prisma.InputJsonValue)
        : undefined;

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const distributor = await prisma.distributor.create({
      data: {
        name,
        email,
        defaultMarginPercent,
        defaultMarginBasis,
        ...(marginByPlanJson !== undefined ? { marginByPlanJson } : {}),
      },
    });

    const codeBase = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5)
      .padEnd(5, "X");
    const code = `${codeBase}-${randomSuffix(6)}`;

    const coupon = await prisma.distributorCoupon.create({
      data: {
        distributorId: distributor.id,
        code,
        customerDiscountPercent: typeof body?.customerDiscountPercent === "number" ? body.customerDiscountPercent : 10,
        marginPercent: defaultMarginPercent,
      },
    });

    await logDistributorAudit({
      distributorId: distributor.id,
      actorEmail,
      action: "distributor.created",
      metadata: { name, email, couponCode: code },
    });

    return NextResponse.json({ distributor, coupon }, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error, "Failed to create distributor");
  }
}
