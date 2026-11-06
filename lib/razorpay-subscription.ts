import Razorpay from "razorpay";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeDistributorCouponCode, decimalToNumber } from "@/lib/distributor-coupon";
import {
  amountMajorToGatewayMinor,
  getListPriceForInterval,
  isValidInterval,
  paidMatchesPlan,
  type SubscriptionIntervalKey,
} from "@/lib/subscription-checkout";
import {
  PRICING_REGIONS,
  getPricingRegion,
  normalizeGatewayCurrency,
  razorpayMinorAmountToMajor,
  roundMajorAmount,
  type PricingRegion,
} from "@/lib/pricing";
import { finalizeSubscriptionPayment } from "@/lib/subscription-payment";
import {
  couponAllowsTier,
  couponIsInValidityWindow,
} from "@/lib/distributor-margin";
import { logDistributorEvent } from "@/lib/observability-distributor";

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export type CreateSubscriptionOrderInput = {
  workspaceId: string;
  userId: string;
  interval: SubscriptionIntervalKey;
  distributorCouponCode?: string | null;
  resellerCouponCode?: string | null;
  /** Optional UI override; must be a valid region code or omitted. */
  pricingRegion?: PricingRegion | null;
};



async function assertCouponUsableForCheckout(
  coupon: {
    id: string;
    customerDiscountPercent: Prisma.Decimal | number;
    distributor: { status: string };
    maxUses: number | null;
    usedCount: number;
    allowedTiers: string;
    startsAt: Date | null;
    endsAt: Date | null;
    firstPurchaseOnly: boolean;
  },
  interval: SubscriptionIntervalKey,
  workspaceId: string,
  opts?: { skipFirstPurchaseCheck?: boolean },
) {
  if (!couponAllowsTier(coupon.allowedTiers, interval)) {
    throw new Error("This coupon is not valid for the selected plan");
  }
  if (!couponIsInValidityWindow(coupon.startsAt, coupon.endsAt)) {
    throw new Error("This coupon is not valid at this time");
  }
  if (coupon.distributor.status !== "ACTIVE") {
    throw new Error("Invalid or inactive distributor coupon");
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    throw new Error("This coupon has reached its usage limit");
  }
  if (!opts?.skipFirstPurchaseCheck && coupon.firstPurchaseOnly) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { hasEverSubscribed: true },
    });
    const prior = await prisma.billingTransaction.count({
      where: { workspaceId, status: "PAID" },
    });
    if (prior > 0 || ws?.hasEverSubscribed) {
      throw new Error("This coupon is only valid for your first subscription purchase");
    }
  }
}

export async function createSubscriptionRazorpayOrder(input: CreateSubscriptionOrderInput) {
  const { workspaceId, userId, interval } = input;

  if (!isValidInterval(interval)) {
    throw new Error("Invalid plan selected");
  }

  let coupon: {
    id: string;
    customerDiscountPercent: Prisma.Decimal | number;
    distributor: { status: string };
    maxUses: number | null;
    usedCount: number;
    allowedTiers: string;
    startsAt: Date | null;
    endsAt: Date | null;
    firstPurchaseOnly: boolean;
  } | null = null;

  const rawCode = input.distributorCouponCode?.trim();
  const rawResellerCode = input.resellerCouponCode?.trim();
  let appliedResellerCouponId: string | null = null;
  let appliedDistributorCouponId: string | null = null;

  if (rawResellerCode) {
    const resellerCode = rawResellerCode.toUpperCase();
    const resellerCoupon = await prisma.resellerCoupon.findFirst({
      where: { code: resellerCode, isActive: true },
      include: {
        reseller: { select: { status: true, id: true } },
      },
    });
    if (!resellerCoupon || resellerCoupon.reseller.status !== "ACTIVE") {
      throw new Error("Invalid or inactive reseller coupon");
    }
    if (resellerCoupon.maxUses != null && resellerCoupon.usedCount >= resellerCoupon.maxUses) {
      throw new Error("This reseller coupon has reached its usage limit");
    }
    if (resellerCoupon.firstPurchaseOnly) {
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { hasEverSubscribed: true },
      });
      const prior = await prisma.billingTransaction.count({
        where: { workspaceId, status: "PAID" },
      });
      if (prior > 0 || ws?.hasEverSubscribed) {
        throw new Error("This reseller coupon is only valid for your first subscription purchase");
      }
    }
    coupon = {
      id: resellerCoupon.id,
      customerDiscountPercent: resellerCoupon.discountValue,
      distributor: { status: "ACTIVE" },
      maxUses: resellerCoupon.maxUses,
      usedCount: resellerCoupon.usedCount,
      allowedTiers: "PRO,TEAM",
      startsAt: resellerCoupon.startsAt,
      endsAt: resellerCoupon.endsAt,
      firstPurchaseOnly: resellerCoupon.firstPurchaseOnly,
    };
    appliedResellerCouponId = resellerCoupon.id;
  }
  if (rawCode) {
    const code = normalizeDistributorCouponCode(rawCode);
    const found = await prisma.distributorCoupon.findFirst({
      where: { code, isActive: true },
      include: { distributor: { select: { status: true } } },
    });
    if (!found) {
      throw new Error("Invalid or inactive distributor coupon");
    }
    await assertCouponUsableForCheckout(found, interval, workspaceId);
    coupon = found;
    appliedDistributorCouponId = found.id;
    appliedResellerCouponId = null;
  } else if (!coupon) {
    const attr = await prisma.distributorAttribution.findUnique({
      where: { workspaceId },
      include: {
        coupon: {
          include: { distributor: { select: { status: true } } },
        },
      },
    });
    if (attr?.coupon?.isActive) {
      await assertCouponUsableForCheckout(attr.coupon, interval, workspaceId);
      coupon = attr.coupon;
      appliedDistributorCouponId = attr.coupon.id;
    }
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { countryCode: true, baseCurrency: true },
  });

  const pricingRegion = getPricingRegion({
    explicitRegion: input.pricingRegion ?? undefined,
    billingCountryCode: workspace?.countryCode,
    explicitCurrency: workspace?.baseCurrency,
  });

  const listPrice = getListPriceForInterval(interval, pricingRegion);
  const currency = listPrice.currency;
  const listMajor = listPrice.amountMajor;

  const discountPct = coupon
    ? decimalToNumber(coupon.customerDiscountPercent as Prisma.Decimal | number | null | undefined)
    : 0;
  const chargeMajor = coupon
    ? roundMajorAmount(listMajor * (1 - Math.min(100, Math.max(0, discountPct)) / 100), currency)
    : listMajor;

  const amountMinor = amountMajorToGatewayMinor(chargeMajor, currency);

  const notes: Record<string, string> = {
    userId,
    workspaceId,
    interval,
    listAmountMajor: String(listMajor),
    chargeAmountMajor: String(chargeMajor),
    listAmountInr: String(listMajor),
    chargeAmountInr: String(chargeMajor),
    currency,
    pricingRegion,
  };
  if (coupon) {
    if (appliedDistributorCouponId) {
      notes.distributorCouponId = appliedDistributorCouponId;
    }
    if (appliedResellerCouponId) {
      notes.resellerCouponId = appliedResellerCouponId;
    }
    notes.customerDiscountPercent = String(discountPct);
  }

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: amountMinor,
    currency,
    receipt: `sub_${Date.now()}_${userId.substring(0, 5)}`,
    notes,
  });

  logDistributorEvent("subscription_order_created", {
    workspaceId,
    orderId: order.id,
    interval,
    listAmountInr: listMajor,
    chargeAmountInr: chargeMajor,
    couponId: coupon?.id ?? null,
  });

  return {
    order,
    listAmountInr: listMajor,
    chargeAmountInr: chargeMajor,
    distributorCouponId: appliedDistributorCouponId,
  };
}

/**
 * After a successful Razorpay payment, verify amount vs order notes and finalize subscription + distributor commission.
 */
export async function processRazorpaySubscriptionPaymentVerified(paymentId: string, expectedWorkspaceId: string) {
  const razorpay = getRazorpayClient();
  const payment = await razorpay.payments.fetch(paymentId);
  const payCurrency = normalizeGatewayCurrency((payment as { currency?: string }).currency);
  const amountPaid = razorpayMinorAmountToMajor(Number(payment.amount), payCurrency);

  const notes = (payment.notes ?? {}) as Record<string, string | undefined>;
  const workspaceId = notes.workspaceId;
  const intervalRaw = notes.interval;

  if (!workspaceId || workspaceId !== expectedWorkspaceId) {
    throw new Error("Payment workspace mismatch");
  }
  if (!intervalRaw || !isValidInterval(intervalRaw)) {
    throw new Error("Invalid subscription interval on payment");
  }
  const interval = intervalRaw as SubscriptionIntervalKey;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { countryCode: true, baseCurrency: true },
  });

  const noteRegionRaw = notes.pricingRegion;
  const explicitRegionFromNote =
    typeof noteRegionRaw === "string" && PRICING_REGIONS.includes(noteRegionRaw as PricingRegion)
      ? (noteRegionRaw as PricingRegion)
      : undefined;

  const region = getPricingRegion({
    explicitRegion: explicitRegionFromNote,
    billingCountryCode: workspace?.countryCode,
    explicitCurrency: workspace?.baseCurrency,
  });

  if (notes.currency && normalizeGatewayCurrency(notes.currency) !== payCurrency) {
    throw new Error("Payment currency does not match order");
  }

  const listFromNote =
    notes.listAmountMajor != null
      ? Number(notes.listAmountMajor)
      : notes.listAmountInr != null
        ? Number(notes.listAmountInr)
        : getListPriceForInterval(interval, region).amountMajor;
  const couponId = notes.distributorCouponId ?? null;
  const resellerCouponId = notes.resellerCouponId ?? null;
  const discountPct =
    notes.customerDiscountPercent != null ? Number(notes.customerDiscountPercent) : 0;

  if (couponId) {
    const coupon = await prisma.distributorCoupon.findFirst({
      where: { id: couponId, isActive: true },
      include: { distributor: { select: { status: true } } },
    });
    if (!coupon || coupon.distributor.status !== "ACTIVE") {
      throw new Error("Coupon no longer valid");
    }
    const expectedDiscount = decimalToNumber(coupon.customerDiscountPercent);
    if (Math.abs(expectedDiscount - discountPct) > 0.01) {
      throw new Error("Coupon discount mismatch");
    }
    await assertCouponUsableForCheckout(coupon, interval, workspaceId, {
      skipFirstPurchaseCheck: true,
    });
    if (!paidMatchesPlan(amountPaid, interval, expectedDiscount, region)) {
      throw new Error("Insufficient payment amount for this plan and coupon");
    }
  } else {
    if (resellerCouponId) {
      const resellerCoupon = await prisma.resellerCoupon.findFirst({
        where: { id: resellerCouponId, isActive: true },
        include: { reseller: { select: { status: true } } },
      });
      if (!resellerCoupon || resellerCoupon.reseller.status !== "ACTIVE") {
        throw new Error("Reseller coupon no longer valid");
      }
      const expectedDiscount = decimalToNumber(resellerCoupon.discountValue);
      if (Math.abs(expectedDiscount - discountPct) > 0.01) {
        throw new Error("Reseller coupon discount mismatch");
      }
      if (!paidMatchesPlan(amountPaid, interval, expectedDiscount, region)) {
        throw new Error("Insufficient payment amount for this plan and reseller coupon");
      }
      await prisma.$transaction(async (tx) => {
        await tx.resellerCoupon.update({
          where: { id: resellerCoupon.id },
          data: { usedCount: { increment: 1 } },
        });
        await tx.resellerLead.upsert({
          where: { workspaceId },
          create: {
            workspaceId,
            resellerId: resellerCoupon.resellerId,
            couponId: resellerCoupon.id,
            stage: "WON",
            conversionAt: new Date(),
          },
          update: {
            resellerId: resellerCoupon.resellerId,
            couponId: resellerCoupon.id,
            stage: "WON",
            conversionAt: new Date(),
          },
        });
      });
    } else if (!paidMatchesPlan(amountPaid, interval, 0, region)) {
      throw new Error("Insufficient payment amount detected");
    }
  }

  const description = couponId
    ? `Subscription (${interval}) via Razorpay — distributor coupon`
    : resellerCouponId
      ? `Subscription (${interval}) via Razorpay — reseller coupon`
      : `Subscription (${interval}) via Razorpay`;

  const customerId =
    typeof (payment as { customer_id?: string | null }).customer_id === "string"
      ? (payment as { customer_id: string }).customer_id
      : null;

  logDistributorEvent("subscription_payment_verify", {
    workspaceId,
    paymentId,
    interval,
    amountPaid,
    currency: payCurrency,
    couponId: couponId ?? null,
  });

  await finalizeSubscriptionPayment({
    workspaceId,
    amountPaid,
    subscriptionListAmount: listFromNote,
    interval,
    providerReference: paymentId,
    receiptUrl: (payment as { receipt_url?: string }).receipt_url ?? null,
    description,
    distributorCouponId: couponId,
    billingProviderCustomerId: customerId,
    billingProvider: "RAZORPAY",
    billingContractType: "PREPAID",
    currency: payCurrency,
  });
}
