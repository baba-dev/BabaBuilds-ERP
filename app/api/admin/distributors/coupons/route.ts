import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { Prisma, DistributorMarginBasis } from "@prisma/client";

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
        marginBasis: c.marginBasis,
        allowedTiers: c.allowedTiers,
        firstPurchaseOnly: c.firstPurchaseOnly,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
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

    const marginBasis =
      body?.marginBasis === "PAID"
        ? DistributorMarginBasis.PAID
        : body?.marginBasis === "LIST"
          ? DistributorMarginBasis.LIST
          : null;

    const coupon = await prisma.distributorCoupon.create({
      data: {
        distributorId,
        code,
        customerDiscountPercent:
          typeof body?.customerDiscountPercent === "number" ? body.customerDiscountPercent : 10,
        marginPercent:
          typeof body?.marginPercent === "number" ? body.marginPercent : toNumber(distributor.defaultMarginPercent),
        ...(marginBasis ? { marginBasis } : {}),
        allowedTiers: typeof body?.allowedTiers === "string" ? body.allowedTiers : "PRO,TEAM",
        firstPurchaseOnly: body?.firstPurchaseOnly === true,
        startsAt: body?.startsAt ? new Date(body.startsAt) : null,
        endsAt: body?.endsAt ? new Date(body.endsAt) : null,
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
      marginBasis?: DistributorMarginBasis | null;
      maxUses?: number | null;
      allowedTiers?: string;
      firstPurchaseOnly?: boolean;
      startsAt?: Date | null;
      endsAt?: Date | null;
    } = {};

    if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
    if (body?.customerDiscountPercent != null) data.customerDiscountPercent = Number(body.customerDiscountPercent);
    if (body?.marginPercent != null) data.marginPercent = Number(body.marginPercent);
    if (body?.marginBasis === "LIST" || body?.marginBasis === "PAID") {
      data.marginBasis = body.marginBasis as DistributorMarginBasis;
    } else if (body?.marginBasis === null) {
      data.marginBasis = null;
    }
    if (body?.maxUses === null || typeof body?.maxUses === "number") data.maxUses = body.maxUses;
    if (typeof body?.allowedTiers === "string") data.allowedTiers = body.allowedTiers;
    if (typeof body?.firstPurchaseOnly === "boolean") data.firstPurchaseOnly = body.firstPurchaseOnly;
    if (body?.startsAt === null) data.startsAt = null;
    else if (body?.startsAt) data.startsAt = new Date(body.startsAt);
    if (body?.endsAt === null) data.endsAt = null;
    else if (body?.endsAt) data.endsAt = new Date(body.endsAt);

    const coupon = await prisma.distributorCoupon.update({
      where: { id: couponId },
      data,
    });

    return NextResponse.json({ coupon });
  } catch (error) {
    return handleAdminApiError(error, "Failed to update coupon");
  }
}
