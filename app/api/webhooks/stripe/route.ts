import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF", "ISK",
]);

function toSmallestUnit(amount: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) return Math.round(amount);
  return Math.round(amount * 100);
}

async function markInvoicePaid(invoiceId: string, workspaceId: string, amount: number, reference: string): Promise<boolean> {
  let settledNow = false;
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId } });
    if (!invoice || invoice.status === "PAID") return;

    await tx.invoice.updateMany({
      where: { id: invoiceId, workspaceId },
      data: {
        status: "PAID",
        amountReceived: amount,
        dateReceived: new Date(),
      },
    });

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
      update: {},
    });
    settledNow = true;
  });

  try {
    invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (err) {
    noteDashboardCacheIncident("invalidationFailures", {
      workspaceId,
      entity: "invoice",
      action: "stripe_webhook_payment",
      error: String(err),
    });
  }

  return settledNow;
}

export async function POST(req: Request) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = new Stripe(process.env.STRIPE_WEBHOOK_VERIFY_KEY ?? "sk_test_webhook_verify_placeholder", {
    apiVersion: "2026-03-25.dahlia",
  });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const linkId = typeof session.payment_link === "string" ? session.payment_link : null;
      if (!linkId) {
        return NextResponse.json({ status: "ignored_missing_link" });
      }

      const invoice = await prisma.invoice.findFirst({
        where: { providerPaymentLinkId: linkId, providerGateway: "STRIPE" },
        include: { workspace: true },
      });
      if (!invoice) {
        return NextResponse.json({ status: "ignored_invoice_not_found" });
      }

      const expectedAmount = toSmallestUnit(Number(invoice.grandTotal), invoice.workspace.baseCurrency ?? "INR");
      const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
      if (amountTotal === null || amountTotal !== expectedAmount) {
        return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
      }
      if (session.payment_status !== "paid") {
        return NextResponse.json({ status: "ignored_not_paid" });
      }

      const providerReference =
        typeof session.payment_intent === "string" && session.payment_intent
          ? session.payment_intent
          : session.id;

      await markInvoicePaid(invoice.id, invoice.workspaceId, Number(invoice.grandTotal), providerReference);
      return NextResponse.json({ status: "ok" });
    }

    if (event.type === "charge.refunded" || event.type === "charge.dispute.funds_withdrawn") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;

      if (!paymentIntent) {
        return NextResponse.json({ status: "ignored_missing_payment_intent" });
      }

      await prisma.billingTransaction.updateMany({
        where: {
          providerReference: paymentIntent,
          status: { not: "REFUNDED" },
        },
        data: { status: "REFUNDED" },
      });
      return NextResponse.json({ status: "ok" });
    }

    return NextResponse.json({ status: "ignored_event_type" });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
