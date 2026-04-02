import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const PRICING = {
  MONTHLY: 200,
  QUARTERLY: 550,
  YEARLY: 2300,
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { interval } = body; // "MONTHLY", "QUARTERLY", or "YEARLY"

    if (!PRICING[interval as keyof typeof PRICING]) {
      return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });
    }

    // Razorpay expects amounts in the smallest currency unit (paise for INR)
    const amountInPaise = PRICING[interval as keyof typeof PRICING] * 100;

    const options = {
      amount: amountInPaise,
      currency: "INR", // Adjust if you expand to international gateways later
      receipt: `receipt_${Date.now()}_${(session.user as any).id.substring(0, 5)}`,
      notes: {
        userId: (session.user as any).id,
        workspaceId: (session as any).workspaceId,
        interval: interval,
      },
    };

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