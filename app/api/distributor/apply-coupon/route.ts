import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeDistributorCouponCode, decimalToNumber } from "@/lib/distributor-coupon";
import { couponIsInValidityWindow } from "@/lib/distributor-margin";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { getClientIp } from "@/lib/request-ip";

function clientKey(req: Request) {
  return `apply-coupon:${getClientIp(req)}`;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const attr = await prisma.distributorAttribution.findUnique({
      where: { workspaceId },
      include: {
        coupon: {
          select: {
            id: true,
            code: true,
            customerDiscountPercent: true,
            marginPercent: true,
            isActive: true,
          },
        },
      },
    });

    if (!attr) {
      return NextResponse.json({ attribution: null });
    }

    return NextResponse.json({
      attribution: {
        couponId: attr.coupon.id,
        code: attr.coupon.code,
        customerDiscountPercent: decimalToNumber(attr.coupon.customerDiscountPercent),
        marginPercent: decimalToNumber(attr.coupon.marginPercent),
        isActive: attr.coupon.isActive,
      },
    });
  } catch (error) {
    console.error("GET /api/distributor/apply-coupon", error);
    return NextResponse.json({ error: "Failed to load coupon" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const limited = await checkRateLimit(clientKey(req), 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Try again shortly.", retryAfterMs: limited.retryAfterMs },
        { status: 429 },
      );
    }

    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.code === "string" ? body.code : "";
    if (!raw.trim()) {
      await prisma.distributorAttribution.deleteMany({ where: { workspaceId } });
      return NextResponse.json({ attribution: null });
    }

    const code = normalizeDistributorCouponCode(raw);
    const coupon = await prisma.distributorCoupon.findFirst({
      where: { code, isActive: true },
      include: { distributor: { select: { id: true, status: true } } },
    });

    if (!coupon || coupon.distributor.status !== "ACTIVE") {
      return NextResponse.json({ error: "Invalid or inactive coupon code" }, { status: 404 });
    }

    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ error: "This coupon has reached its usage limit" }, { status: 409 });
    }

    if (!couponIsInValidityWindow(coupon.startsAt, coupon.endsAt)) {
      return NextResponse.json({ error: "This coupon is not valid at this time" }, { status: 400 });
    }

    if (coupon.firstPurchaseOnly) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { hasEverSubscribed: true },
      });
      const prior = await prisma.billingTransaction.count({
        where: { workspaceId, status: "PAID" },
      });
      if (prior > 0 || ws?.hasEverSubscribed) {
        return NextResponse.json(
          { error: "This coupon is only valid for your first subscription purchase" },
          { status: 400 },
        );
      }
    }

    await prisma.distributorAttribution.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        couponId: coupon.id,
        distributorId: coupon.distributorId,
      },
      update: {
        couponId: coupon.id,
        distributorId: coupon.distributorId,
        appliedAt: new Date(),
      },
    });

    return NextResponse.json({
      attribution: {
        couponId: coupon.id,
        code: coupon.code,
        customerDiscountPercent: decimalToNumber(coupon.customerDiscountPercent),
        marginPercent: decimalToNumber(coupon.marginPercent),
      },
    });
  } catch (error) {
    console.error("POST /api/distributor/apply-coupon", error);
    return NextResponse.json({ error: "Failed to apply coupon" }, { status: 500 });
  }
}
