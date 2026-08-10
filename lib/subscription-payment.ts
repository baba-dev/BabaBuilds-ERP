import { prisma } from "@/lib/prisma";
import type { SubscriptionIntervalKey } from "@/lib/subscription-checkout";
import { tierFromInterval } from "@/lib/subscription-checkout";
import {
  computeCommissionAmount,
  couponAllowsTier,
  couponIsInValidityWindow,
  resolveEffectiveMargin,
} from "@/lib/distributor-margin";
import { DistributorCommissionStatus } from "@prisma/client";

function addBillingPeriod(base: Date, interval: SubscriptionIntervalKey): Date {
  const d = new Date(base);
  if (interval === "QUARTERLY") {
    d.setMonth(d.getMonth() + 3);
  } else if (interval === "YEARLY" || interval === "TEAM_YEARLY") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

export type FinalizeSubscriptionInput = {
  workspaceId: string;
  amountPaid: number;
  subscriptionListAmount: number;
  interval: SubscriptionIntervalKey;
  providerReference: string;
  receiptUrl?: string | null;
  description: string;
  distributorCouponId: string | null;
  billingProviderCustomerId?: string | null;
  billingProvider?: "RAZORPAY" | "STRIPE";
  billingContractType?: "PREPAID" | "RECURRING";
  billingProviderSubscriptionId?: string | null;
  currency?: string;
};

/**
 * Extends subscription, records billing transaction (idempotent by provider ref),
 * and creates distributor commission when a coupon was used.
 */
export async function finalizeSubscriptionPayment(input: FinalizeSubscriptionInput) {
  const tier = tierFromInterval(input.interval);
  const verifiedInterval = input.interval;
  const currency = input.currency ?? "INR";

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { subscriptionEndsAt: true, subscriptionStatus: true, hasEverSubscribed: true },
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const isCurrentlyActivePaid =
    (workspace.subscriptionStatus === "PRO" || workspace.subscriptionStatus === "TEAM") &&
    workspace.subscriptionEndsAt &&
    new Date(workspace.subscriptionEndsAt) > new Date();

  const baseDate = isCurrentlyActivePaid ? new Date(workspace.subscriptionEndsAt!) : new Date();
  const newExpirationDate = addBillingPeriod(baseDate, verifiedInterval);

  await prisma.$transaction(async (tx) => {
    const priorPaidCount = await tx.billingTransaction.count({
      where: { workspaceId: input.workspaceId, status: "PAID" },
    });

    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: {
        subscriptionStatus: tier,
        planTier: tier,
        planInterval: verifiedInterval,
        subscriptionEndsAt: newExpirationDate,
        billingProviderId: input.billingProviderCustomerId ?? input.providerReference,
        billingProvider: input.billingProvider ?? "RAZORPAY",
        billingContractType: input.billingContractType ?? "PREPAID",
        billingProviderSubscriptionId: input.billingProviderSubscriptionId ?? null,
        subscriptionCancelAtPeriodEnd: false,
        subscriptionCancelRequestedAt: null,
        subscriptionCancelEffectiveAt: null,
        subscriptionCancellationLastError: null,
        hasEverSubscribed: true,
        signupIntentJson: null,
      },
    });

    const billingTx = await tx.billingTransaction.upsert({
      where: {
        workspaceId_providerReference: {
          workspaceId: input.workspaceId,
          providerReference: input.providerReference,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        amount: input.amountPaid,
        status: "PAID",
        description: input.description,
        providerReference: input.providerReference,
        transactionDate: new Date(),
        receiptUrl: input.receiptUrl ?? null,
        subscriptionListAmount: input.subscriptionListAmount,
        distributorCouponId: input.distributorCouponId,
        subscriptionCurrency: currency,
        subscriptionInterval: verifiedInterval,
      },
      update: {},
    });

    if (!input.distributorCouponId) return;

    const coupon = await tx.distributorCoupon.findUnique({
      where: { id: input.distributorCouponId },
      include: { distributor: true },
    });
    if (!coupon) return;

    if (!couponAllowsTier(coupon.allowedTiers, verifiedInterval)) {
      return;
    }
    if (!couponIsInValidityWindow(coupon.startsAt, coupon.endsAt)) {
      return;
    }
    if (coupon.firstPurchaseOnly && (priorPaidCount > 0 || workspace.hasEverSubscribed)) {
      return;
    }

    const { marginPercent, marginBasis } = resolveEffectiveMargin(coupon.distributor, coupon, verifiedInterval);
    const listAmt = input.subscriptionListAmount;
    const commissionAmount = computeCommissionAmount(
      listAmt,
      input.amountPaid,
      marginPercent,
      marginBasis,
    );

    const existing = await tx.distributorCommission.findUnique({
      where: { billingTransactionId: billingTx.id },
    });
    if (existing) return;

    await tx.distributorCommission.create({
      data: {
        distributorId: coupon.distributorId,
        couponId: coupon.id,
        workspaceId: input.workspaceId,
        billingTransactionId: billingTx.id,
        listAmount: listAmt,
        paidAmount: input.amountPaid,
        marginPercent,
        commissionAmount,
        status: DistributorCommissionStatus.PENDING,
        marginBasisUsed: marginBasis,
      },
    });

    await tx.distributorCoupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
  });
}

export async function reverseDistributorCommissionForBillingTx(
  billingTransactionId: string,
  reason: string,
): Promise<boolean> {
  const row = await prisma.distributorCommission.findUnique({
    where: { billingTransactionId },
  });
  if (!row || row.status === DistributorCommissionStatus.VOID || row.status === DistributorCommissionStatus.CLAWED_BACK) {
    return false;
  }
  if (row.status === DistributorCommissionStatus.PAID) {
    await prisma.distributorCommission.update({
      where: { id: row.id },
      data: {
        status: DistributorCommissionStatus.CLAWED_BACK,
        clawbackReason: reason,
        reversedAt: new Date(),
      },
    });
    return true;
  }
  await prisma.distributorCommission.update({
    where: { id: row.id },
    data: {
      status: DistributorCommissionStatus.VOID,
      clawbackReason: reason,
      reversedAt: new Date(),
    },
  });
  return true;
}
