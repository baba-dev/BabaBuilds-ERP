import Razorpay from "razorpay";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeDistributorCouponCode, decimalToNumber } from "@/lib/distributor-coupon";
import {
  getListPriceInr,
  inrToPaise,
  isValidInterval,
  paidMatchesPlan,
  type SubscriptionIntervalKey,
} from "@/lib/subscription-checkout";
import { finalizeSubscriptionPayment } from "@/lib/subscription-payment";

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
};

export async function createSubscriptionRazorpayOrder(input: CreateSubscriptionOrderInput) {
  const { workspaceId, userId, interval } = input;

  if (!isValidInterval(interval)) {
    throw new Error("Invalid plan selected");
  }

  let coupon: {
    id: string;
    customerDiscountPercent: unknown;
    distributor: { status: string };
    maxUses: number | null;
    usedCount: number;
  } | null = null;

  const rawCode = input.distributorCouponCode?.trim();
  if (rawCode) {
    const code = normalizeDistributorCouponCode(rawCode);
    coupon = await prisma.distributorCoupon.findFirst({
      where: { code, isActive: true },
      include: { distributor: { select: { status: true } } },
    });
    if (!coupon || coupon.distributor.status !== "ACTIVE") {
      throw new Error("Invalid or inactive distributor coupon");
    }
    if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
      throw new Error("This coupon has reached its usage limit");
    }
  } else {
    const attr = await prisma.distributorAttribution.findUnique({
      where: { workspaceId },
      include: {
        coupon: {
          include: { distributor: { select: { status: true } } },
        },
      },
    });
    if (attr?.coupon?.isActive && attr.coupon.distributor.status === "ACTIVE") {
      coupon = attr.coupon;
    }
  }

  const listInr = getListPriceInr(interval);
  const discountPct = coupon
    ? decimalToNumber(coupon.customerDiscountPercent as Prisma.Decimal | number | null | undefined)
    : 0;
  const chargeInr = coupon
    ? Math.max(0, Math.round(listInr * (1 - Math.min(100, Math.max(0, discountPct)) / 100) * 100) / 100)
    : listInr;

  const amountPaise = inrToPaise(chargeInr);

  const notes: Record<string, string> = {
    userId,
    workspaceId,
    interval,
    listAmountInr: String(listInr),
    chargeAmountInr: String(chargeInr),
  };
  if (coupon) {
    notes.distributorCouponId = coupon.id;
    notes.customerDiscountPercent = String(discountPct);
  }

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: `sub_${Date.now()}_${userId.substring(0, 5)}`,
    notes,
  });

  return {
    order,
    listAmountInr: listInr,
    chargeAmountInr: chargeInr,
    distributorCouponId: coupon?.id ?? null,
  };
}

/**
 * After a successful Razorpay payment, verify amount vs order notes and finalize subscription + distributor commission.
 */
export async function processRazorpaySubscriptionPaymentVerified(paymentId: string, expectedWorkspaceId: string) {
  const razorpay = getRazorpayClient();
  const payment = await razorpay.payments.fetch(paymentId);
  const amountPaid = Number(payment.amount) / 100;

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

  const listFromNote = notes.listAmountInr != null ? Number(notes.listAmountInr) : getListPriceInr(interval);
  const couponId = notes.distributorCouponId ?? null;
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
    if (!paidMatchesPlan(amountPaid, interval, expectedDiscount)) {
      throw new Error("Insufficient payment amount for this plan and coupon");
    }
  } else {
    if (!paidMatchesPlan(amountPaid, interval, 0)) {
      throw new Error("Insufficient payment amount detected");
    }
  }

  const description = couponId
    ? `Subscription (${interval}) via Razorpay — distributor coupon`
    : `Subscription (${interval}) via Razorpay`;

  const customerId =
    typeof (payment as { customer_id?: string | null }).customer_id === "string"
      ? (payment as { customer_id: string }).customer_id
      : null;

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
  });
}
