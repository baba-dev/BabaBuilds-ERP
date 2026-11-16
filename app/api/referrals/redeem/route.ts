import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { logActivity } from "@/lib/security/activity-log";

/** What a redemption is worth is decided here, never by the caller. */
const FRIEND_DISCOUNT_PERCENT = 20;
const CODE_PATTERN = /^[A-Z0-9-]{4,24}$/;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id?: string } | undefined)?.id ?? "";
    const limit = enforceRouteRateLimit({ request: req, route: "/api/referrals/redeem", scope: `${workspaceId}:${userId}`, max: 5, windowMs: 60 * 60_000 });
    if (!limit.ok) return limit.response;

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    // Any reward type or discount in the request is ignored: callers must not choose their own reward.
    const friendDiscountPercent = FRIEND_DISCOUNT_PERCENT;
    const rewardType = "WALLET_CREDIT" as const;

    if (!code || !CODE_PATTERN.test(code)) {
      return NextResponse.json({ error: "Enter a valid referral code" }, { status: 400 });
    }

    const profile = await prisma.customerReferralProfile.findFirst({
      where: { code, isActive: true },
      select: { id: true, workspaceId: true, userId: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "Referral code not found" }, { status: 404 });
    }
    // Your own code, or a code from another workspace you own, earns nothing.
    if (profile.workspaceId === workspaceId || profile.userId === userId) {
      return NextResponse.json({ error: "You cannot redeem your own referral code" }, { status: 400 });
    }

    const existing = await prisma.customerReferralRedemption.findUnique({
      where: { referredWorkspaceId: workspaceId },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "This workspace has already used a referral code" }, { status: 409 });
    }

    const redemption = await prisma.$transaction(async (tx) => {
      const createdRedemption = await tx.customerReferralRedemption.create({
        data: {
          profileId: profile.id,
          referredWorkspaceId: workspaceId,
          friendDiscountPercent,
          convertedAt: new Date(),
        },
      });

      await tx.customerReferralReward.create({
        data: {
          redemptionId: createdRedemption.id,
          referrerWorkspaceId: profile.workspaceId,
          rewardType,
          rewardStatus: "APPROVED",
          walletCreditAmount: 10,
          freeMonthsCount: null,
          notes: "Auto-created from referral redemption",
        },
      });

      await tx.customerReferralProfile.update({
        where: { id: profile.id },
        data: {
          totalReferrals: { increment: 1 },
          successfulReferrals: { increment: 1 },
        },
      });

      return createdRedemption;
    });

    void logActivity({ workspaceId, action: "referral.redeemed", status: "SUCCESS", actor: { userId, email: null }, entity: { type: "referral_redemption", id: redemption.id } });
    return NextResponse.json({ redemption }, { status: 201 });
  } catch (error) {
    console.error("POST /api/referrals/redeem error", error);
    return NextResponse.json({ error: "Failed to redeem referral code" }, { status: 500 });
  }
}
