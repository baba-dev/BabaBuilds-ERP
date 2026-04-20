import { NextResponse } from "next/server";
import crypto from "crypto";
import { processRazorpaySubscriptionPaymentVerified } from "@/lib/razorpay-subscription";
import { prisma } from "@/lib/prisma";
import { reverseDistributorCommissionForBillingTx } from "@/lib/subscription-payment";
import { logDistributorEvent } from "@/lib/observability-distributor";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret || !signature) {
      return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
    }

    const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    if (expectedSignature !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const paymentEntity = event.payload?.payment?.entity ?? event.payload?.payment;
      if (!paymentEntity?.id) {
        return NextResponse.json({ status: "ignored" });
      }

      const notes = paymentEntity.notes as Record<string, string | undefined> | undefined;
      const workspaceId = notes?.workspaceId;
      const interval = notes?.interval;

      if (workspaceId && interval) {
        try {
          await processRazorpaySubscriptionPaymentVerified(paymentEntity.id, workspaceId);
        } catch (e) {
          console.error("Razorpay webhook subscription finalize failed:", e);
          return NextResponse.json({ error: "Processing failed" }, { status: 500 });
        }
      }
    }

    // Refund processed — mark billing row and claw back / void partner commission
    if (event.event === "refund.processed" || event.event === "refund.created") {
      const refundEntity = event.payload?.refund?.entity ?? event.payload?.refund;
      const paymentId =
        typeof refundEntity?.payment_id === "string"
          ? refundEntity.payment_id
          : typeof refundEntity?.paymentId === "string"
            ? refundEntity.paymentId
            : null;
      if (paymentId) {
        const tx = await prisma.billingTransaction.findFirst({
          where: { providerReference: paymentId },
          select: { id: true, workspaceId: true },
        });
        if (tx) {
          await prisma.billingTransaction.update({
            where: { id: tx.id },
            data: { status: "REFUNDED" },
          });
          const reversed = await reverseDistributorCommissionForBillingTx(
            tx.id,
            `Razorpay refund webhook (${event.event})`,
          );
          logDistributorEvent("subscription_refund_processed", {
            workspaceId: tx.workspaceId,
            paymentId,
            commissionReversed: reversed,
          });
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Razorpay Webhook Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
