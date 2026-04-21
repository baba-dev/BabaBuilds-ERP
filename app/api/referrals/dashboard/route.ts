import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const toNumber = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

function daysUntil(date: Date | null) {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const email = session?.user?.email?.toLowerCase() ?? "";

    if (!session || !workspaceId || !userId || !email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await prisma.workspaceUser.findFirst({
      where: { workspaceId, userId, isActive: true },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [profile, resellerAccount] = await Promise.all([
      prisma.customerReferralProfile.findUnique({
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
      }),
      prisma.resellerAccount.findFirst({
        where: { email, status: "ACTIVE" },
        include: {
          coupons: {
            orderBy: { createdAt: "desc" },
            include: {
              leads: {
                include: {
                  workspace: {
                    select: {
                      id: true,
                      name: true,
                      billingTransactions: {
                        where: { status: "PAID" },
                        select: { id: true, amount: true, transactionDate: true },
                      },
                    },
                  },
                },
              },
            },
          },
          leads: {
            orderBy: { createdAt: "desc" },
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  billingTransactions: {
                    where: { status: "PAID" },
                    select: { id: true, amount: true, transactionDate: true },
                  },
                },
              },
              coupon: { select: { id: true, code: true } },
            },
          },
          commissions: {
            orderBy: { createdAt: "desc" },
            include: {
              billingTransaction: {
                select: {
                  id: true,
                  transactionDate: true,
                  amount: true,
                  status: true,
                  providerReference: true,
                },
              },
              lead: {
                select: {
                  id: true,
                  workspace: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const totalRewards = (profile?.redemptions ?? []).flatMap((redemption) => redemption.rewards);
    const walletCredits = totalRewards
      .filter((reward) => reward.rewardType === "WALLET_CREDIT")
      .reduce((sum, reward) => sum + toNumber(reward.walletCreditAmount), 0);
    const freeMonths = totalRewards
      .filter((reward) => reward.rewardType === "FREE_MONTH")
      .reduce((sum, reward) => sum + (reward.freeMonthsCount ?? 0), 0);

    const leads = resellerAccount?.leads ?? [];
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter((lead) => lead.stage === "QUALIFIED").length;
    const wonLeads = leads.filter((lead) => lead.stage === "WON").length;
    const lostLeads = leads.filter((lead) => lead.stage === "LOST").length;
    const conversionRate = totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(2)) : 0;
    const totalRevenue = leads.reduce(
      (sum, lead) =>
        sum +
        lead.workspace.billingTransactions.reduce((acc, tx) => acc + toNumber(tx.amount), 0),
      0,
    );

    const commissionTotals = (resellerAccount?.commissions ?? []).reduce(
      (acc, item) => {
        const amount = toNumber(item.commissionAmount);
        if (item.status === "PAID") acc.paid += amount;
        else if (item.status === "APPROVED") acc.approved += amount;
        else if (item.status === "PENDING") acc.pending += amount;
        return acc;
      },
      { paid: 0, approved: 0, pending: 0 },
    );

    const pipeline = leads.map((lead) => ({
      id: lead.id,
      stage: lead.stage,
      workspaceId: lead.workspace.id,
      workspaceName: lead.workspace.name,
      couponCode: lead.coupon?.code ?? null,
      createdAt: lead.createdAt,
      conversionAt: lead.conversionAt,
      paidTransactions: lead.workspace.billingTransactions.length,
      revenue: lead.workspace.billingTransactions.reduce((sum, tx) => sum + toNumber(tx.amount), 0),
    }));

    const coupons = (resellerAccount?.coupons ?? []).map((coupon) => {
      const won = coupon.leads.filter((lead) => lead.stage === "WON").length;
      const conversion = coupon.leads.length > 0 ? Number(((won / coupon.leads.length) * 100).toFixed(2)) : 0;
      return {
        id: coupon.id,
        code: coupon.code,
        isActive: coupon.isActive,
        usedCount: coupon.usedCount,
        maxUses: coupon.maxUses,
        discountValue: toNumber(coupon.discountValue),
        commissionPercent: toNumber(coupon.commissionPercent),
        createdAt: coupon.createdAt,
        startsAt: coupon.startsAt,
        endsAt: coupon.endsAt,
        daysRemaining: daysUntil(coupon.endsAt),
        leadCount: coupon.leads.length,
        conversionRate: conversion,
      };
    });

    const commissions = (resellerAccount?.commissions ?? []).map((commission) => ({
      id: commission.id,
      status: commission.status,
      dealAmount: toNumber(commission.dealAmount),
      commissionPercent: toNumber(commission.commissionPercent),
      commissionAmount: toNumber(commission.commissionAmount),
      createdAt: commission.createdAt,
      workspaceName: commission.lead?.workspace?.name ?? "Unknown workspace",
      providerReference: commission.billingTransaction?.providerReference ?? null,
      transactionDate: commission.billingTransaction?.transactionDate ?? null,
    }));

    const todayActions = [
      totalLeads === 0
        ? "Generate and share your first referral code."
        : `Review ${Math.max(0, totalLeads - wonLeads - lostLeads)} active pipeline leads.`,
      coupons.some((coupon) => coupon.isActive && coupon.daysRemaining != null && coupon.daysRemaining <= 14)
        ? "At least one active coupon is expiring soon — rotate or renew it."
        : "Keep one long-running coupon active for always-on partner campaigns.",
      commissionTotals.pending > 0
        ? "Pending commissions are available — verify deal notes for faster approval."
        : "No pending commissions. Keep pipeline moving to unlock your next payout.",
    ];

    return NextResponse.json({
      profile: profile
        ? {
            id: profile.id,
            code: profile.code,
            isActive: profile.isActive,
            totalReferrals: profile.totalReferrals,
            successfulReferrals: profile.successfulReferrals,
            createdAt: profile.createdAt,
          }
        : null,
      redemptions: (profile?.redemptions ?? []).map((redemption) => ({
        id: redemption.id,
        referredWorkspaceName: redemption.referredWorkspace.name,
        friendDiscountPercent: toNumber(redemption.friendDiscountPercent),
        convertedAt: redemption.convertedAt,
        createdAt: redemption.createdAt,
        rewards: redemption.rewards,
      })),
      customerStats: {
        walletCredits,
        freeMonths,
      },
      reseller: resellerAccount
        ? {
            id: resellerAccount.id,
            name: resellerAccount.name,
            email: resellerAccount.email,
            payoutTerms: resellerAccount.payoutTerms,
            defaultCustomerDiscount: toNumber(resellerAccount.defaultCustomerDiscount),
            defaultCommissionPercent: toNumber(resellerAccount.defaultCommissionPercent),
          }
        : null,
      overview: {
        totalLeads,
        qualifiedLeads,
        wonLeads,
        lostLeads,
        conversionRate,
        totalRevenue,
        activeCoupons: coupons.filter((coupon) => coupon.isActive).length,
        couponUsage: coupons.reduce((sum, coupon) => sum + coupon.usedCount, 0),
        pendingCommission: Number((commissionTotals.pending + commissionTotals.approved).toFixed(2)),
        paidCommission: Number(commissionTotals.paid.toFixed(2)),
      },
      todayActions,
      pipeline,
      coupons,
      commissions,
    });
  } catch (error) {
    console.error("GET /api/referrals/dashboard error", error);
    return NextResponse.json({ error: "Failed to load reseller dashboard data" }, { status: 500 });
  }
}
