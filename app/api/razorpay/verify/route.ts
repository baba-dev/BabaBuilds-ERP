import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import Razorpay from "razorpay";
import {
  acquireFinancialIdempotency,
  buildRequestHash,
  consumeFinancialIdempotency,
  releaseFinancialIdempotency,
} from "@/lib/financial-idempotency";
import { getPricingRegion, resolvePricingIntervalByAmount, type PricingRegion } from "@/lib/pricing";

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
  let idempotencyContext: { workspaceId: string; operation: string; idempotencyKey: string } | null = null;
  let idempotencyConsumed = false;
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = (session as any).workspaceId;
    const body = await req.json().catch(() => ({}));
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    const operation = "RAZORPAY_SUBSCRIPTION_VERIFY";

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing payment identifiers" }, { status: 400 });
    }
    const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || razorpay_payment_id;
    const requestHash = buildRequestHash({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    const acquired = await acquireFinancialIdempotency({
      workspaceId,
      operation,
      idempotencyKey,
      requestHash,
    });
    idempotencyContext = { workspaceId, operation, idempotencyKey };
    if (acquired.kind === "hash_mismatch") {
      return NextResponse.json({ error: "Conflicting idempotency payload." }, { status: 409 });
    }
    if (acquired.kind === "in_progress") {
      return NextResponse.json({ error: "Verification request already in progress." }, { status: 409 });
    }
    if (acquired.kind === "replay") {
      return NextResponse.json({ ...(acquired.responseBody as object), replayed: true });
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
    const amountPaid = Number(payment.amount) / 100;
    const paymentCurrency = String(payment.currency ?? "INR").toUpperCase();

    // 4. FETCH CURRENT WORKSPACE STATE (THE RENEWAL FIX)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { subscriptionEndsAt: true, subscriptionStatus: true, countryCode: true, baseCurrency: true }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // --- LOGIC: DETERMINE THE STARTING POINT FOR THE NEW PLAN ---
    // If they are currently PRO and their expiry is in the future, we append to that date.
    // Otherwise (FREE, Expired, or Suspended), we start from today.
    const isCurrentlyActivePro = 
      (workspace.subscriptionStatus === "PRO" || workspace.subscriptionStatus === "TEAM") && 
      workspace.subscriptionEndsAt && 
      new Date(workspace.subscriptionEndsAt) > new Date();

    const baseDate = isCurrentlyActivePro 
      ? new Date(workspace.subscriptionEndsAt!) 
      : new Date();

    // 5. CALCULATE NEW EXPIRATION BASED ON EXACT AMOUNT PAID
    // Use exact plan amount matching so a higher-tier threshold cannot
    // accidentally classify a lower plan (for example TEAM_MONTHLY as QUARTERLY).
    const requestedRegion = (body?.pricingRegion as PricingRegion | undefined) ?? undefined;
    const notesRegion = (payment.notes?.pricingRegion as PricingRegion | undefined) ?? undefined;
    const resolvedRegion = getPricingRegion({
      explicitRegion: requestedRegion ?? notesRegion,
      billingCountryCode: workspace.countryCode,
      explicitCurrency: paymentCurrency || workspace.baseCurrency,
    });
    const verifiedInterval = resolvePricingIntervalByAmount({
      amountMajor: amountPaid,
      currency: paymentCurrency,
      region: resolvedRegion,
    });
    if (!verifiedInterval) {
      return NextResponse.json({ error: "Unrecognized payment amount detected." }, { status: 400 });
    }
    let verifiedTier = "PRO";
    const newExpirationDate = new Date(baseDate);

    if (verifiedInterval === "TEAM_YEARLY") {
      verifiedTier = "TEAM";
      newExpirationDate.setFullYear(newExpirationDate.getFullYear() + 1);
    } else if (verifiedInterval === "YEARLY") {
      verifiedTier = "PRO";
      newExpirationDate.setFullYear(newExpirationDate.getFullYear() + 1);
    } else if (verifiedInterval === "QUARTERLY") {
      verifiedTier = "PRO";
      newExpirationDate.setMonth(newExpirationDate.getMonth() + 3);
    } else if (verifiedInterval === "TEAM_MONTHLY") {
      verifiedTier = "TEAM";
      newExpirationDate.setMonth(newExpirationDate.getMonth() + 1);
    } else if (verifiedInterval === "MONTHLY") {
      verifiedTier = "PRO";
      newExpirationDate.setMonth(newExpirationDate.getMonth() + 1);
    }

    // 6. SECURELY UPGRADE THE WORKSPACE
    await prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id: workspaceId },
        data: {
          subscriptionStatus: verifiedTier,
          planTier: verifiedTier,
          planInterval: verifiedInterval,
          subscriptionEndsAt: newExpirationDate,
          billingProviderId: payment.customer_id || razorpay_payment_id,
          paymentMethodMask: payment.method === 'card'
            ? `•••• ${payment.card?.last4}`
            : (payment.vpa || "UPI/NetBanking"),
        },
      });
      await tx.billingTransaction.upsert({
        where: {
          workspaceId_providerReference: {
            workspaceId,
            providerReference: razorpay_payment_id
          }
        },
        create: {
          workspaceId,
          amount: amountPaid,
          status: "PAID",
          description: `Subscription ${verifiedTier} (${verifiedInterval}) via Razorpay`,
          providerReference: razorpay_payment_id,
          transactionDate: new Date(),
        },
        update: {}
      });
    });

    const responseBody = { 
      success: true, 
      message: isCurrentlyActivePro 
        ? "Subscription extended successfully!" 
        : "Welcome to Pro Agency!" 
    };
    await consumeFinancialIdempotency({ workspaceId, operation, idempotencyKey, responseBody });
    idempotencyConsumed = true;
    return NextResponse.json(responseBody);

  } catch (error) {
    console.error("Razorpay Verification Error:", error);
    return NextResponse.json({ error: "Failed to verify payment securely" }, { status: 500 });
  } finally {
    if (idempotencyContext && !idempotencyConsumed) {
      await releaseFinancialIdempotency(idempotencyContext);
    }
  }
}
