import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createSubscriptionRazorpayOrder } from "@/lib/razorpay-subscription";
import type { SubscriptionIntervalKey } from "@/lib/subscription-checkout";

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

    const body = await req.json();
    const { interval, distributorCouponCode } = body as {
      interval?: string;
      distributorCouponCode?: string | null;
    };

    const result = await createSubscriptionRazorpayOrder({
      workspaceId,
      userId,
      interval: interval as SubscriptionIntervalKey,
      distributorCouponCode: distributorCouponCode ?? undefined,
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
