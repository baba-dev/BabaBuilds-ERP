import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { Prisma } from "@prisma/client";
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

async function invalidateWorkspaceDashboard(workspaceId: string, action: string) {
  try {
    invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (err) {
    noteDashboardCacheIncident("invalidationFailures", {
      workspaceId,
      entity: "invoice",
      action,
      error: String(err),
    });
  }
}

async function markInvoicePaid(invoiceId: string, workspaceId: string, amount: number, reference: string): Promise<boolean> {
  let settledNow = false;
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId } });
    if (!invoice || invoice.status === "PAID" || invoice.status === "VOID") return;

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

  await invalidateWorkspaceDashboard(workspaceId, "stripe_webhook_payment");
  return settledNow;
}

async function updateInvoiceStateFromBillingReference(params: {
  providerReference: string;
  status: "PENDING" | "PARTIALLY_PAID" | "PAID";
  reason: string;
}): Promise<number> {
  const txRows = await prisma.billingTransaction.findMany({
    where: { providerReference: params.providerReference },
    select: { workspaceId: true, description: true },
  });
  if (txRows.length === 0) return 0;

  let updates = 0;
  const touchedWorkspaceIds = new Set<string>();
  for (const row of txRows) {
    const match = row.description.match(/^Invoice\s+(.+?)\s+Settlement/i);
    const invoiceNumber = match?.[1]?.trim();
    if (!invoiceNumber) continue;
    const updated = await prisma.invoice.updateMany({
      where: { workspaceId: row.workspaceId, invoiceNumber, status: { not: "VOID" } },
      data:
        params.status === "PAID"
          ? { status: params.status, dateReceived: new Date() }
          : { status: params.status, dateReceived: null, amountReceived: 0 },
    });
    updates += updated.count;
    if (updated.count > 0) touchedWorkspaceIds.add(row.workspaceId);
  }

  await Promise.all(Array.from(touchedWorkspaceIds).map((workspaceId) => invalidateWorkspaceDashboard(workspaceId, params.reason)));
  return updates;
}

async function markBillingFailedByProviderReference(providerReference: string): Promise<number> {
  return prisma.billingTransaction.updateMany({
    where: { providerReference, status: { not: "FAILED" } },
    data: { status: "FAILED" },
  }).then((r) => r.count);
}

async function markBillingRefundedByProviderReference(providerReference: string): Promise<number> {
  return prisma.billingTransaction.updateMany({
    where: { providerReference, status: { not: "REFUNDED" } },
    data: { status: "REFUNDED" },
  }).then((r) => r.count);
}

async function markBillingPaidByProviderReference(providerReference: string): Promise<number> {
  return prisma.billingTransaction.updateMany({
    where: { providerReference, status: { not: "PAID" } },
    data: { status: "PAID" },
  }).then((r) => r.count);
}

async function reserveStripeWebhookEvent(event: Stripe.Event) {
  const payload = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
  try {
    await prisma.processedWebhookEvent.create({
      data: {
        provider: "STRIPE",
        eventId: event.id,
        eventType: event.type,
        payload,
      },
    });
    return { duplicate: false };
  } catch (error) {
    const msg = String(error);
    if (msg.includes("Unique constraint") || msg.includes("processedWebhookEvent")) {
      return { duplicate: true };
    }
    throw error;
  }
}

async function finalizeStripeWebhookEvent(eventId: string, status: "PROCESSED" | "FAILED", errorMessage?: string) {
  await prisma.processedWebhookEvent.updateMany({
    where: { provider: "STRIPE", eventId },
    data: {
      status,
      errorMessage: errorMessage?.slice(0, 1000) ?? null,
      processedAt: new Date(),
    },
  });
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
    const reservation = await reserveStripeWebhookEvent(event);
    if (reservation.duplicate) {
      return NextResponse.json({ status: "duplicate_ignored" });
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const linkId = typeof session.payment_link === "string" ? session.payment_link : null;
      if (!linkId) {
        await finalizeStripeWebhookEvent(event.id, "PROCESSED");
        return NextResponse.json({ status: "ignored_missing_link" });
      }

      const invoice = await prisma.invoice.findFirst({
        where: { providerPaymentLinkId: linkId, providerGateway: "STRIPE" },
        include: { workspace: true },
      });
      if (!invoice) {
        await finalizeStripeWebhookEvent(event.id, "PROCESSED");
        return NextResponse.json({ status: "ignored_invoice_not_found" });
      }

      const expectedAmount = toSmallestUnit(Number(invoice.grandTotal), invoice.workspace.baseCurrency ?? "INR");
      const amountTotal = typeof session.amount_total === "number" ? session.amount_total : null;
      if (amountTotal === null || amountTotal !== expectedAmount) {
        await finalizeStripeWebhookEvent(event.id, "FAILED", "amount_mismatch");
        return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
      }
      if (session.payment_status !== "paid") {
        await finalizeStripeWebhookEvent(event.id, "PROCESSED");
        return NextResponse.json({ status: "ignored_not_paid" });
      }

      const providerReference =
        typeof session.payment_intent === "string" && session.payment_intent
          ? session.payment_intent
          : session.id;

      await markInvoicePaid(invoice.id, invoice.workspaceId, Number(invoice.grandTotal), providerReference);
      await finalizeStripeWebhookEvent(event.id, "PROCESSED");
      return NextResponse.json({ status: "ok" });
    }

    if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const providerReference =
        typeof session.payment_intent === "string" && session.payment_intent
          ? session.payment_intent
          : session.id;
      await markBillingFailedByProviderReference(providerReference);
      await finalizeStripeWebhookEvent(event.id, "PROCESSED");
      return NextResponse.json({ status: "ok" });
    }

    if (event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
      const intent = event.data.object as Stripe.PaymentIntent;
      await markBillingFailedByProviderReference(intent.id);
      await updateInvoiceStateFromBillingReference({
        providerReference: intent.id,
        status: "PENDING",
        reason: "stripe_webhook_payment_failed",
      });
      await finalizeStripeWebhookEvent(event.id, "PROCESSED");
      return NextResponse.json({ status: "ok" });
    }

    if (
      event.type === "charge.refunded" ||
      event.type === "refund.updated" ||
      event.type === "charge.dispute.funds_withdrawn"
    ) {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;

      if (!paymentIntent) {
        await finalizeStripeWebhookEvent(event.id, "PROCESSED");
        return NextResponse.json({ status: "ignored_missing_payment_intent" });
      }

      await markBillingRefundedByProviderReference(paymentIntent);
      await updateInvoiceStateFromBillingReference({
        providerReference: paymentIntent,
        status: "PENDING",
        reason: "stripe_webhook_refund_or_dispute",
      });
      await finalizeStripeWebhookEvent(event.id, "PROCESSED");
      return NextResponse.json({ status: "ok" });
    }

    if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntent =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null;
      if (!paymentIntent) {
        await finalizeStripeWebhookEvent(event.id, "PROCESSED");
        return NextResponse.json({ status: "ignored_missing_payment_intent" });
      }
      await prisma.billingTransaction.updateMany({
        where: { providerReference: paymentIntent },
        data: { status: "DISPUTED" },
      });
      await finalizeStripeWebhookEvent(event.id, "PROCESSED");
      return NextResponse.json({ status: "ok" });
    }

    if (event.type === "charge.dispute.funds_reinstated") {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntent =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id ?? null;
      if (!paymentIntent) {
        await finalizeStripeWebhookEvent(event.id, "PROCESSED");
        return NextResponse.json({ status: "ignored_missing_payment_intent" });
      }
      await markBillingPaidByProviderReference(paymentIntent);
      await updateInvoiceStateFromBillingReference({
        providerReference: paymentIntent,
        status: "PAID",
        reason: "stripe_webhook_funds_reinstated",
      });
      await finalizeStripeWebhookEvent(event.id, "PROCESSED");
      return NextResponse.json({ status: "ok" });
    }

    await finalizeStripeWebhookEvent(event.id, "PROCESSED");
    return NextResponse.json({ status: "ignored_event_type" });
  } catch (error) {
    await finalizeStripeWebhookEvent(event.id, "FAILED", String(error)).catch(() => null);
    console.error("Stripe webhook processing error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
