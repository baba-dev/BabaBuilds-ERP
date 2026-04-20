import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

function generateReferralCode(seed: string) {
  const normalized = seed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5)
    .padEnd(5, "X");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${normalized}-${suffix}`;
}

async function getSessionContext() {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  return { session, workspaceId, userId };
}

export async function GET() {
  try {
    const { session, workspaceId, userId } = await getSessionContext();
    if (!session || !workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.customerReferralProfile.findUnique({
      where: { userId },
      include: {
        redemptions: {
          orderBy: { createdAt: "desc" },
          include: {
            referredWorkspace: { select: { id: true, name: true } },
            rewards: true,
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ profile: null, stats: null });
    }

    const totalRewards = profile.redemptions.flatMap((redemption) => redemption.rewards);
    const walletCredits = totalRewards
      .filter((reward) => reward.rewardType === "WALLET_CREDIT")
      .reduce((sum, reward) => sum + toNumber(reward.walletCreditAmount), 0);
    const freeMonths = totalRewards
      .filter((reward) => reward.rewardType === "FREE_MONTH")
      .reduce((sum, reward) => sum + (reward.freeMonthsCount ?? 0), 0);

    return NextResponse.json({
      profile: {
        id: profile.id,
        code: profile.code,
        isActive: profile.isActive,
        totalReferrals: profile.totalReferrals,
        successfulReferrals: profile.successfulReferrals,
        createdAt: profile.createdAt,
      },
      redemptions: profile.redemptions.map((redemption) => ({
        id: redemption.id,
        referredWorkspaceName: redemption.referredWorkspace.name,
        friendDiscountPercent: toNumber(redemption.friendDiscountPercent),
        convertedAt: redemption.convertedAt,
        createdAt: redemption.createdAt,
        rewards: redemption.rewards,
      })),
      stats: {
        walletCredits,
        freeMonths,
      },
    });
  } catch (error) {
    console.error("GET /api/referrals error", error);
    return NextResponse.json({ error: "Failed to fetch referral profile" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { session, workspaceId, userId } = await getSessionContext();
    if (!session || !workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.customerReferralProfile.findUnique({ where: { userId } });
    if (existing) {
      return NextResponse.json({ profile: existing });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    const seed = workspace?.name || session.user?.name || "BABA";

    const profile = await prisma.customerReferralProfile.create({
      data: {
        userId,
        workspaceId,
        code: generateReferralCode(seed),
      },
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    console.error("POST /api/referrals error", error);
    return NextResponse.json({ error: "Failed to create referral profile" }, { status: 500 });
  }
}
