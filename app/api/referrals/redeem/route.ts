import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    const friendDiscountPercent =
      typeof body?.friendDiscountPercent === "number" ? body.friendDiscountPercent : 20;
    const rewardType = body?.rewardType === "FREE_MONTH" ? "FREE_MONTH" : "WALLET_CREDIT";

    if (!code) {
      return NextResponse.json({ error: "Referral code is required" }, { status: 400 });
    }

    const profile = await prisma.customerReferralProfile.findFirst({
      where: { code, isActive: true },
      select: { id: true, workspaceId: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "Referral code not found" }, { status: 404 });
    }
    if (profile.workspaceId === workspaceId) {
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
          walletCreditAmount: rewardType === "WALLET_CREDIT" ? 10 : null,
          freeMonthsCount: rewardType === "FREE_MONTH" ? 1 : null,
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

    return NextResponse.json({ redemption }, { status: 201 });
  } catch (error) {
    console.error("POST /api/referrals/redeem error", error);
    return NextResponse.json({ error: "Failed to redeem referral code" }, { status: 500 });
  }
}
