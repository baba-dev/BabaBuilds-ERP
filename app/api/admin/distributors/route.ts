import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { Prisma } from "@prisma/client";

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
    const body = await req.json();

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const defaultMarginPercent =
      typeof body?.defaultMarginPercent === "number" ? body.defaultMarginPercent : 10;

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    const distributor = await prisma.distributor.create({
      data: {
        name,
        email,
        defaultMarginPercent,
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

    return NextResponse.json({ distributor, coupon }, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error, "Failed to create distributor");
  }
}
