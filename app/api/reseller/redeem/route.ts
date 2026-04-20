import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";

    if (!code) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }

    const coupon = await prisma.resellerCoupon.findFirst({
      where: { code, isActive: true },
      include: {
        reseller: {
          select: {
            id: true,
            name: true,
            defaultCustomerDiscount: true,
            defaultCommissionPercent: true,
          },
        },
      },
    });

    if (!coupon) {
      return NextResponse.json({ error: "Coupon not found or inactive" }, { status: 404 });
    }

    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: "Coupon usage limit reached" }, { status: 409 });
    }

    const lead = await prisma.$transaction(async (tx) => {
      const existing = await tx.resellerLead.findUnique({
        where: { workspaceId },
        select: { id: true },
      });

      if (existing) {
        return tx.resellerLead.update({
          where: { id: existing.id },
          data: {
            couponId: coupon.id,
            resellerId: coupon.resellerId,
            stage: "QUALIFIED",
          },
        });
      }

      await tx.resellerCoupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });

      return tx.resellerLead.create({
        data: {
          resellerId: coupon.resellerId,
          couponId: coupon.id,
          workspaceId,
          stage: "QUALIFIED",
          conversionAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      leadId: lead.id,
      resellerName: coupon.reseller.name,
      customerDiscountPercent: toNumber(coupon.discountValue),
      resellerCommissionPercent: toNumber(coupon.commissionPercent),
      message: "Coupon applied. Your workspace is now tracked under the reseller program.",
    });
  } catch (error) {
    console.error("POST /api/reseller/redeem error", error);
    return NextResponse.json({ error: "Failed to apply reseller coupon" }, { status: 500 });
  }
}
