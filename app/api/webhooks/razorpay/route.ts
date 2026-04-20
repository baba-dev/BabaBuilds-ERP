import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { processRazorpaySubscriptionPaymentVerified } from '@/lib/razorpay-subscription';

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

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity ?? event.payload?.payment;
      if (!paymentEntity?.id) {
        return NextResponse.json({ status: 'ignored' });
      }

      const notes = paymentEntity.notes as Record<string, string | undefined> | undefined;
      const workspaceId = notes?.workspaceId;
      const interval = notes?.interval;

      if (workspaceId && interval) {
        try {
          await processRazorpaySubscriptionPaymentVerified(paymentEntity.id, workspaceId);
        } catch (e) {
          console.error('Razorpay webhook subscription finalize failed:', e);
          return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Razorpay Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
