import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { getClientIp } from "@/lib/request-ip";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const limited = checkRateLimit(`reseller-preview:${ip}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly.", retryAfterMs: limited.retryAfterMs },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code) {
      return NextResponse.json({ error: "Coupon code is required." }, { status: 400 });
    }

    const coupon = await prisma.resellerCoupon.findFirst({
      where: { code, isActive: true },
      include: {
        reseller: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!coupon || coupon.reseller.status !== "ACTIVE") {
      return NextResponse.json({ error: "Invalid or inactive reseller coupon." }, { status: 404 });
    }

    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: "Coupon usage limit reached." }, { status: 409 });
    }

    return NextResponse.json({
      coupon: {
        id: coupon.id,
        code: coupon.code,
        resellerId: coupon.resellerId,
        resellerName: coupon.reseller.name,
        discountPercent: toNumber(coupon.discountValue),
        commissionPercent: toNumber(coupon.commissionPercent),
        firstPurchaseOnly: coupon.firstPurchaseOnly,
        firstYearOnly: coupon.firstYearOnly,
      },
    });
  } catch (error) {
    console.error("POST /api/reseller/coupon/preview error", error);
    return NextResponse.json({ error: "Failed to preview coupon" }, { status: 500 });
  }
}
