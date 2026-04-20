import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
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
    const coupons = await prisma.distributorCoupon.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        distributor: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({
      items: coupons.map((c) => ({
        id: c.id,
        code: c.code,
        distributorId: c.distributorId,
        distributorName: c.distributor.name,
        customerDiscountPercent: toNumber(c.customerDiscountPercent),
        marginPercent: toNumber(c.marginPercent),
        isActive: c.isActive,
        usedCount: c.usedCount,
        maxUses: c.maxUses,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load coupons");
  }
}

export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();
    const distributorId = typeof body?.distributorId === "string" ? body.distributorId : null;
    if (!distributorId) {
      return NextResponse.json({ error: "distributorId is required" }, { status: 400 });
    }

    const distributor = await prisma.distributor.findUnique({
      where: { id: distributorId },
    });
    if (!distributor) {
      return NextResponse.json({ error: "Distributor not found" }, { status: 404 });
    }

    const codeBase = distributor.name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 5)
      .padEnd(5, "X");
    const code = `${codeBase}-${randomSuffix(6)}`;

    const coupon = await prisma.distributorCoupon.create({
      data: {
        distributorId,
        code,
        customerDiscountPercent:
          typeof body?.customerDiscountPercent === "number" ? body.customerDiscountPercent : 10,
        marginPercent:
          typeof body?.marginPercent === "number" ? body.marginPercent : toNumber(distributor.defaultMarginPercent),
        maxUses: typeof body?.maxUses === "number" ? body.maxUses : null,
      },
    });

    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error, "Failed to create coupon");
  }
}

export async function PATCH(req: Request) {
  try {
    await verifySuperAdmin();
    const body = await req.json();
    const couponId = typeof body?.couponId === "string" ? body.couponId : null;
    if (!couponId) {
      return NextResponse.json({ error: "couponId is required" }, { status: 400 });
    }

    const data: {
      isActive?: boolean;
      customerDiscountPercent?: number;
      marginPercent?: number;
      maxUses?: number | null;
    } = {};

    if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
    if (body?.customerDiscountPercent != null) data.customerDiscountPercent = Number(body.customerDiscountPercent);
    if (body?.marginPercent != null) data.marginPercent = Number(body.marginPercent);
    if (body?.maxUses === null || typeof body?.maxUses === "number") data.maxUses = body.maxUses;

    const coupon = await prisma.distributorCoupon.update({
      where: { id: couponId },
      data,
    });

    return NextResponse.json({ coupon });
  } catch (error) {
    return handleAdminApiError(error, "Failed to update coupon");
  }
}
