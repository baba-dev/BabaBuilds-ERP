import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";
import {
  acquireFinancialIdempotency,
  buildRequestHash,
  consumeFinancialIdempotency,
  releaseFinancialIdempotency,
} from "@/lib/financial-idempotency";
import { processRazorpaySubscriptionPaymentVerified } from "@/lib/razorpay-subscription";
import { timingSafeEqualString } from "@/lib/security/signature";

export async function POST(req: Request) {
  let idempotencyContext: { workspaceId: string; operation: string; idempotencyKey: string } | null = null;
  let idempotencyConsumed = false;
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as { workspaceId?: string }).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = (session as { workspaceId: string }).workspaceId;
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

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: "Payment gateway not configured" }, { status: 500 });
    }

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (!timingSafeEqualString(generatedSignature, razorpay_signature)) {
      console.error("⚠️ Security Alert: Invalid payment signature detected.");
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    await processRazorpaySubscriptionPaymentVerified(razorpay_payment_id, workspaceId);

    const responseBody = {
      success: true,
      message: "Subscription updated successfully.",
    };
    await consumeFinancialIdempotency({ workspaceId, operation, idempotencyKey, responseBody });
    idempotencyConsumed = true;
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Razorpay Verification Error:", error);
    const message = error instanceof Error ? error.message : "Failed to verify payment securely";
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    if (idempotencyContext && !idempotencyConsumed) {
      await releaseFinancialIdempotency(idempotencyContext);
    }
  }
}
