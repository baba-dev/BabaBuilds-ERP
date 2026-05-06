import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";
import Razorpay from "razorpay";
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';

// Force node runtime for cron if needed, though standard Edge might be fine
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return unauthorizedCronResponse();

  const results = {
    checked: 0,
    synced: 0,
    failed: 0,
    errors: [] as string[]
  };

  try {
    // 1. Fetch all pending invoices that have a provider payment link
    const pendingInvoices = await prisma.invoice.findMany({
      where: { 
        status: { in: ["PENDING", "PARTIALLY_PAID"] },
        providerPaymentLinkId: { not: null },
        providerGateway: { not: null }
      },
      include: {
        workspace: {
          include: { businessProfile: true }
        }
      }
    });

    const { decrypt } = await import('@/lib/encryption');

    for (const invoice of pendingInvoices) {
      results.checked++;
      const profile = invoice.workspace?.businessProfile;
      if (!profile) continue;

      try {
        if (invoice.providerGateway === "RAZORPAY" && profile.razorpayKeyId && profile.razorpayKeySecret) {
          const decryptedSecret = decrypt(profile.razorpayKeySecret);
          const rzp = new Razorpay({
            key_id: profile.razorpayKeyId,
            key_secret: decryptedSecret
          });

          // Fetch the payment link status
          // Note: using razorpay SDK to fetch payment link
          // The typings for paymentLink might be under rzp.paymentLink
          // Let's use it as any
          const rzpAny = rzp as any;
          const link = await rzpAny.paymentLink.fetch(invoice.providerPaymentLinkId!);
          
          if (link && link.status === "paid") {
            // It's paid! But we need the payment ID to record the transaction
            // A payment link can have multiple payments, but typically one successful.
            // We can fetch payments for this link:
            // But we don't necessarily need the exact payment ID. We can just mark it paid.
            await markInvoicePaid(invoice.id, invoice.workspaceId, Number(invoice.grandTotal), invoice.providerPaymentLinkId!);
            results.synced++;
          }
        } else if (invoice.providerGateway === "STRIPE" && profile.stripeSecretKey) {
          const decryptedSecret = decrypt(profile.stripeSecretKey);
          const stripe = new Stripe(decryptedSecret, { apiVersion: '2026-03-25.dahlia' as any });

          // Payment links themselves don't have a simple "status" in Stripe.
          // They generate Checkout Sessions. We have to list Checkout Sessions for this Payment Link 
          // and see if any are "paid" or "complete".
          const sessions = await stripe.checkout.sessions.list({
            payment_link: invoice.providerPaymentLinkId!,
            limit: 10, // usually just 1
          });

          const paidSession = sessions.data.find(s => s.payment_status === "paid");
          
          if (paidSession) {
            // Prefer payment_intent as the canonical reference so it matches any
            // Stripe webhook that fires later with the same PI ID. Fall back to the
            // session ID only if no PI is attached (e.g., free/zero-amount sessions).
            const providerRef =
              (typeof paidSession.payment_intent === "string" && paidSession.payment_intent)
                ? paidSession.payment_intent
                : paidSession.id;
            await markInvoicePaid(invoice.id, invoice.workspaceId, Number(invoice.grandTotal), providerRef);
            results.synced++;
          }
        }
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Invoice ${invoice.invoiceNumber}: ${err.message}`);
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, ...results }, { status: 500 });
  }
}

async function markInvoicePaid(invoiceId: string, workspaceId: string, amount: number, reference: string) {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, workspaceId } });
    if (!invoice || invoice.status === "PAID") return;

    await tx.invoice.updateMany({
      where: { id: invoiceId, workspaceId },
      data: {
        status: "PAID",
        amountReceived: amount,
        dateReceived: new Date()
      }
    });

    // Use upsert to be idempotent — if the cron fires twice (or a webhook already
    // recorded this reference), we must not create a duplicate BillingTransaction.
    await tx.billingTransaction.upsert({
      where: {
        workspaceId_providerReference: { workspaceId, providerReference: reference }
      },
      create: {
        workspaceId,
        amount,
        description: `Invoice ${invoice.invoiceNumber} Settlement (Auto-Sync)`,
        providerReference: reference,
        status: "PAID",
        transactionDate: new Date(),
      },
      update: {}, // idempotent — no-op if already recorded
    });
  });
}
