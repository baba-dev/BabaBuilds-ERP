import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import Razorpay from "razorpay";
import crypto from "crypto";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { timingSafeEqualString } from "@/lib/security/signature";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF", "ISK",
]);

function toSmallestUnit(amount: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) {
    return Math.round(amount);
  }
  return Math.round(amount * 100);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const gateway = url.searchParams.get("gateway");

    // ── STRIPE VERIFICATION FLOW ─────────────────────────────────────────
    if (gateway === "stripe") {
      const sessionId = url.searchParams.get("session_id");
      if (!sessionId) {
        return NextResponse.redirect(new URL("/payments/failure?reason=missing_session", req.url));
      }

      // We cannot query the invoice directly by session_id because we only saved `paymentLinkId`.
      // We must find the invoice that MIGHT belong to this session.
      // Wait, we don't know the workspaceId yet to get the Stripe Secret Key!
      // This is a bootstrap problem: we need the secret key to fetch the session, 
      // but we need the session to know the paymentLinkId to find the workspace!
      
      const linkId = url.searchParams.get("link_id");
      if (!linkId) {
        return NextResponse.redirect(new URL("/payments/failure?reason=missing_link_id", req.url));
      }

      const invoice = await prisma.invoice.findFirst({
        where: { providerPaymentLinkId: linkId, providerGateway: "STRIPE" },
        include: { workspace: { include: { businessProfile: true } }, client: true }
      });

      if (!invoice || !invoice.workspace?.businessProfile?.stripeSecretKey) {
        return NextResponse.redirect(new URL("/payments/failure?reason=invoice_not_found", req.url));
      }

      // If already paid, just show success
      if (invoice.status === "PAID") {
        return NextResponse.redirect(new URL("/payments/success", req.url));
      }

      const { decrypt } = await import('@/lib/encryption');
      const decryptedSecret = decrypt(invoice.workspace.businessProfile.stripeSecretKey);
      
      const stripe = new Stripe(decryptedSecret, { apiVersion: '2026-03-25.dahlia' as Stripe.LatestApiVersion });
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const expectedAmount = toSmallestUnit(Number(invoice.grandTotal), invoice.workspace.baseCurrency ?? "INR");
      const paidAmount = typeof session.amount_total === "number" ? session.amount_total : null;
      const paymentLinkMatches = typeof session.payment_link === "string" && session.payment_link === linkId;
      const amountMatches = paidAmount !== null && paidAmount === expectedAmount;
      const isPaid = session.payment_status === "paid";
      const isComplete = session.status === "complete";

      if (isPaid && isComplete && paymentLinkMatches && amountMatches) {
        const providerReference =
          typeof session.payment_intent === "string" && session.payment_intent
            ? session.payment_intent
            : session.id;
        const settled = await markInvoicePaid(invoice.id, invoice.workspaceId, Number(invoice.grandTotal), providerReference);
        if (settled) {
          dispatchNotification({
            event: 'INVOICE_PAID',
            workspaceId: invoice.workspaceId,
            data: {
              invoiceNumber: invoice.invoiceNumber,
              clientName: invoice.clientName,
              amount: String(invoice.grandTotal ?? invoice.totalAmount),
            },
          }).catch(() => null);
        }
        return NextResponse.redirect(new URL("/payments/success", req.url));
      }

      if (!paymentLinkMatches) {
        return NextResponse.redirect(new URL("/payments/failure?reason=payment_link_mismatch", req.url));
      }
      if (!amountMatches) {
        return NextResponse.redirect(new URL("/payments/failure?reason=amount_mismatch", req.url));
      }
      return NextResponse.redirect(new URL("/payments/failure?reason=not_paid", req.url));
    }


    // ── RAZORPAY VERIFICATION FLOW ───────────────────────────────────────
    const razorpayPaymentId = url.searchParams.get("razorpay_payment_id");
    const razorpayPaymentLinkId = url.searchParams.get("razorpay_payment_link_id");
    const razorpaySignature = url.searchParams.get("razorpay_signature");
    const razorpayStatus = url.searchParams.get("razorpay_payment_link_status");
    const razorpayPaymentLinkReferenceId = url.searchParams.get("razorpay_payment_link_reference_id");

    if (razorpayPaymentLinkId && razorpayPaymentId && razorpaySignature && razorpayStatus === "paid") {
      const invoice = await prisma.invoice.findFirst({
        where: { providerPaymentLinkId: razorpayPaymentLinkId, providerGateway: "RAZORPAY" },
        include: { workspace: { include: { businessProfile: true } }, client: true }
      });

      if (!invoice || !invoice.workspace?.businessProfile?.razorpayKeySecret) {
        return NextResponse.redirect(new URL("/payments/failure?reason=invoice_not_found", req.url));
      }

      if (invoice.status === "PAID") {
        return NextResponse.redirect(new URL("/payments/success", req.url));
      }

      const { decrypt } = await import('@/lib/encryption');
      const decryptedSecret = decrypt(invoice.workspace.businessProfile.razorpayKeySecret);

      // Verify Razorpay signature
      // Format: payment_link_id + "|" + payment_link_reference_id + "|" + payment_link_status + "|" + payment_id
      const payload = `${razorpayPaymentLinkId}|${razorpayPaymentLinkReferenceId}|${razorpayStatus}|${razorpayPaymentId}`;
      const generatedSignature = crypto
        .createHmac("sha256", decryptedSecret)
        .update(payload)
        .digest("hex");

      if (!timingSafeEqualString(generatedSignature, razorpaySignature)) {
        console.error("Razorpay signature mismatch for invoice", invoice.id);
        return NextResponse.redirect(new URL("/payments/failure?reason=invalid_signature", req.url));
      }

      const rzp = new Razorpay({
        key_id: invoice.workspace.businessProfile.razorpayKeyId!,
        key_secret: decryptedSecret,
      });

      const payment = await rzp.payments.fetch(razorpayPaymentId);
      if (payment.status === "captured") {
        const settled = await markInvoicePaid(invoice.id, invoice.workspaceId, Number(invoice.grandTotal), razorpayPaymentId);
        if (settled) {
          dispatchNotification({
            event: 'INVOICE_PAID',
            workspaceId: invoice.workspaceId,
            data: {
              invoiceNumber: invoice.invoiceNumber,
              clientName: invoice.clientName,
              amount: String(invoice.grandTotal ?? invoice.totalAmount),
            },
          }).catch(() => null);
        }
        return NextResponse.redirect(new URL("/payments/success", req.url));
      }

      return NextResponse.redirect(new URL("/payments/failure?reason=not_paid", req.url));
    }

    return NextResponse.redirect(new URL("/payments/failure?reason=invalid_gateway", req.url));
  } catch (error) {
    console.error("Payment redirect verification error:", error);
    return NextResponse.redirect(new URL("/payments/failure?reason=system_error", req.url));
  }
}

async function markInvoicePaid(invoiceId: string, workspaceId: string, amount: number, reference: string): Promise<boolean> {
  let settledNow = false;
  await prisma.$transaction(async (tx) => {
    // Re-verify inside the transaction to prevent race conditions and cross-tenant leakage
    const invoice = await tx.invoice.findFirst({ 
      where: { 
        id: invoiceId,
        workspaceId // Critical scoping check
      } 
    });
    if (!invoice || invoice.status === "PAID") return;

    await tx.invoice.updateMany({
      where: { id: invoiceId, workspaceId },
      data: {
        status: "PAID",
        amountReceived: amount,
        dateReceived: new Date(),
      },
    });

    // Use upsert — idempotent if this redirect fires more than once, or if the
    // sync-payments cron already recorded the same provider reference.
    await tx.billingTransaction.upsert({
      where: {
        workspaceId_providerReference: { workspaceId, providerReference: reference },
      },
      create: {
        workspaceId,
        amount,
        description: `Invoice ${invoice.invoiceNumber} Settlement`,
        providerReference: reference,
        status: "PAID",
        transactionDate: new Date(),
      },
      update: {}, // idempotent — no-op if already recorded
    });
    settledNow = true;
  });

  // Invalidate the in-process dashboard cache so the workspace sees the updated
  // revenue / outstanding totals immediately without waiting for TTL expiry.
  try {
    await invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (err) {
    noteDashboardCacheIncident("invalidationFailures", {
      workspaceId,
      entity: "invoice",
      action: "gateway_payment",
      error: String(err),
    });
  }
  return settledNow;
}
