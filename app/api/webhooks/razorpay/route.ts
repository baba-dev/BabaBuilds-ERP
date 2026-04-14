import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret || !signature) {
      return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    // Only process payment captures or successful order payments
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const paymentEntity = event.payload.payment.entity;
      const notes = paymentEntity.notes;

      const workspaceId = notes?.workspaceId;
      const interval = notes?.interval;

      if (workspaceId && interval) {
        const workspace = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { subscriptionEndsAt: true, subscriptionStatus: true }
        });

        if (workspace) {
          const isCurrentlyActivePro = 
            (workspace.subscriptionStatus === "PRO" || workspace.subscriptionStatus === "TEAM") && 
            workspace.subscriptionEndsAt && 
            new Date(workspace.subscriptionEndsAt) > new Date();

          const baseDate = isCurrentlyActivePro 
            ? new Date(workspace.subscriptionEndsAt!) 
            : new Date();

          const endsAt = new Date(baseDate);
          
          if (interval.includes("MONTHLY")) {
            endsAt.setMonth(endsAt.getMonth() + 1);
          } else if (interval === "QUARTERLY") {
            endsAt.setMonth(endsAt.getMonth() + 3);
          } else if (interval.includes("YEARLY")) {
            endsAt.setFullYear(endsAt.getFullYear() + 1);
          }
          
          let planTier = "PRO";
          if (interval.includes("TEAM")) {
            planTier = "TEAM";
          }

          await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
              subscriptionStatus: planTier, 
              planTier: planTier,
              planInterval: interval,
              subscriptionEndsAt: endsAt,
              billingProviderId: paymentEntity.customer_id || null,
            },
          });

          // Record the BillingTransaction securely & idempotently
          await prisma.billingTransaction.upsert({
            where: {
              workspaceId_providerReference: {
                workspaceId,
                providerReference: paymentEntity.id
              }
            },
            create: {
              workspaceId,
              transactionDate: new Date(),
              amount: paymentEntity.amount / 100, // Convert poise back to INR
              status: "PAID",
              description: `Subscription Upgrade (${interval.replace("_", " ")}) via Webhook`,
              providerReference: paymentEntity.id,
              receiptUrl: paymentEntity.receipt_url || null,
            },
            update: {} // If webhook retriggers, don't duplicate
          });
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Razorpay Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
