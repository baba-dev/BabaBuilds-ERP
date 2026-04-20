import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";
import { PLAN_INTERVALS, getPlanPriceFromInterval, getPricingRegion, type PlanInterval, type PricingRegion } from "@/lib/pricing";

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured');
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const interval = body?.interval as PlanInterval | undefined;
    const explicitRegion = body?.pricingRegion as PricingRegion | undefined;
    if (!interval || !PLAN_INTERVALS.includes(interval) || interval === "QUARTERLY") {
      return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: (session as any).workspaceId },
      select: { countryCode: true, baseCurrency: true },
    });

    const planPrice = getPlanPriceFromInterval({
      interval,
      region: getPricingRegion({
        explicitRegion,
        billingCountryCode: workspace?.countryCode,
        explicitCurrency: workspace?.baseCurrency,
      }),
    });

    const options = {
      amount: planPrice.amountMinor,
      currency: planPrice.currency,
      receipt: `receipt_${Date.now()}_${(session.user as any).id.substring(0, 5)}`,
      notes: {
        userId: (session.user as any).id,
        workspaceId: (session as any).workspaceId,
        interval: planPrice.interval,
        pricingRegion: planPrice.region,
        pricingCurrency: planPrice.currency,
        pricingAmountMajor: String(planPrice.amountMajor),
      },
    };

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create(options);

    return NextResponse.json({ 
      id: order.id, 
      amount: order.amount, 
      currency: order.currency 
    });

  } catch (error) {
    console.error("Razorpay Order Error:", error);
    return NextResponse.json({ error: "Failed to initialize checkout" }, { status: 500 });
  }
}
