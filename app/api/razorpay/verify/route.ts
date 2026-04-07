import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import Razorpay from "razorpay";

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
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = (session as any).workspaceId;
    const body = await req.json().catch(() => ({}));
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment identifiers" }, { status: 400 });
    }

    // 2. CRYPTOGRAPHIC SIGNATURE VERIFICATION
    // Prevents "Man-in-the-middle" attacks where a user spoofs a successful payment
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
    }

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      console.error("⚠️ Security Alert: Invalid payment signature detected.");
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    // 3. FETCH SOURCE OF TRUTH FROM RAZORPAY
    // We fetch the payment directly from the gateway to verify the ACTUAL amount paid
    const razorpay = getRazorpayClient();
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    const amountPaid = Number(payment.amount) / 100; // Convert from Paise to INR

    // 4. FETCH CURRENT WORKSPACE STATE (THE RENEWAL FIX)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { subscriptionEndsAt: true, subscriptionStatus: true }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // --- LOGIC: DETERMINE THE STARTING POINT FOR THE NEW PLAN ---
    // If they are currently PRO and their expiry is in the future, we append to that date.
    // Otherwise (FREE, Expired, or Suspended), we start from today.
    const isCurrentlyActivePro = 
      workspace.subscriptionStatus === "PRO" && 
      workspace.subscriptionEndsAt && 
      new Date(workspace.subscriptionEndsAt) > new Date();

    const baseDate = isCurrentlyActivePro 
      ? new Date(workspace.subscriptionEndsAt!) 
      : new Date();

    // 5. CALCULATE NEW EXPIRATION BASED ON AMOUNT PAID
    let verifiedInterval = "MONTHLY";
    const newExpirationDate = new Date(baseDate);

    if (amountPaid >= 2300) {
      verifiedInterval = "YEARLY";
      newExpirationDate.setFullYear(newExpirationDate.getFullYear() + 1);
    } else if (amountPaid >= 550) {
      verifiedInterval = "QUARTERLY";
      newExpirationDate.setMonth(newExpirationDate.getMonth() + 3);
    } else if (amountPaid >= 200) {
      verifiedInterval = "MONTHLY";
      newExpirationDate.setMonth(newExpirationDate.getMonth() + 1);
    } else {
      return NextResponse.json({ error: "Insufficient payment amount detected." }, { status: 400 });
    }

    // 6. SECURELY UPGRADE THE WORKSPACE
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        subscriptionStatus: "PRO",
        planTier: "PRO",
        planInterval: verifiedInterval,
        subscriptionEndsAt: newExpirationDate, // This is now properly stacked
        billingProviderId: payment.customer_id || razorpay_payment_id,
        paymentMethodMask: payment.method === 'card' 
          ? `•••• ${payment.card?.last4}` 
          : (payment.vpa || "UPI/NetBanking")
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: isCurrentlyActivePro 
        ? "Subscription extended successfully!" 
        : "Welcome to Pro Agency!" 
    });

  } catch (error) {
    console.error("Razorpay Verification Error:", error);
    return NextResponse.json({ error: "Failed to verify payment securely" }, { status: 500 });
  }
}