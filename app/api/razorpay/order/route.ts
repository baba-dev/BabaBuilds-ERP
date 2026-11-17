import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createSubscriptionRazorpayOrder } from "@/lib/razorpay-subscription";
import type { SubscriptionIntervalKey } from "@/lib/subscription-checkout";
import type { PricingRegion } from "@/lib/pricing";
import { PRICING_REGIONS } from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { getClientIp } from "@/lib/request-ip";

function orderKey(req: Request, workspaceId: string) {
  return `razorpay-order:${workspaceId}:${getClientIp(req)}`;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = (session as { workspaceId?: string }).workspaceId;
    const userId = (session.user as { id?: string }).id;
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Missing workspace context" }, { status: 400 });
    }

    const rl = await checkRateLimit(orderKey(req, workspaceId), 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Try again shortly.", retryAfterMs: rl.retryAfterMs },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { interval, distributorCouponCode, resellerCouponCode, pricingRegion: rawRegion } = body as {
      interval?: string;
      distributorCouponCode?: string | null;
      resellerCouponCode?: string | null;
      pricingRegion?: string | null;
    };

    const pricingRegion =
      typeof rawRegion === "string" && PRICING_REGIONS.includes(rawRegion as PricingRegion)
        ? (rawRegion as PricingRegion)
        : undefined;

    const result = await createSubscriptionRazorpayOrder({
      workspaceId,
      userId,
      interval: interval as SubscriptionIntervalKey,
      distributorCouponCode: distributorCouponCode ?? undefined,
      resellerCouponCode: resellerCouponCode ?? undefined,
      pricingRegion,
    });

    return NextResponse.json({
      id: result.order.id,
      amount: result.order.amount,
      currency: result.order.currency,
      listAmountInr: result.listAmountInr,
      chargeAmountInr: result.chargeAmountInr,
      distributorCouponId: result.distributorCouponId,
    });
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    const message = error instanceof Error ? error.message : "Failed to initialize checkout";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
