import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import Razorpay from 'razorpay';

/**
 * POST /api/shop/[slug]/order
 * Public endpoint — no auth required.
 * Creates a payment order (Razorpay or Stripe) for a shop service purchase.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await request.json();
    const { serviceId, buyerName, buyerEmail, buyerPhone, buyerNote } = body;

    if (!serviceId || !buyerName || !buyerEmail) {
      return NextResponse.json({ error: 'Missing required buyer information.' }, { status: 400 });
    }

    // Load workspace profile
    const profile = await prisma.businessProfile.findUnique({
      where: { shopSlug: slug.toLowerCase() },
      include: {
        workspace: {
          include: {
            serviceTemplates: {
              where: { id: serviceId, showInShop: true },
            },
          },
        },
      },
    });

    if (!profile || !profile.shopEnabled) {
      return NextResponse.json({ error: 'Shop not found.' }, { status: 404 });
    }

    const service = profile.workspace.serviceTemplates[0];
    if (!service) {
      return NextResponse.json({ error: 'Service not found or not available in shop.' }, { status: 404 });
    }

    const amount   = Number(service.defaultPrice);
    const currency = profile.workspace ? 'INR' : 'INR'; // extend for multi-currency later

    // Determine which gateway to use
    const hasRazorpay = !!(profile.razorpayKeyId && profile.razorpayKeySecret);
    const hasStripe   = !!(profile.stripePublishableKey && (profile as any).stripeSecretKey);
    const gateway     = hasRazorpay && profile.defaultGateway !== 'STRIPE'
      ? 'RAZORPAY'
      : hasStripe ? 'STRIPE' : null;

    if (!gateway) {
      return NextResponse.json({ error: 'Payment gateway not configured for this shop.' }, { status: 400 });
    }

    // Create DB record in PENDING state
    const order = await prisma.serviceOrder.create({
      data: {
        workspaceId:       profile.workspaceId,
        serviceTemplateId: service.id,
        buyerName,
        buyerEmail,
        buyerPhone:        buyerPhone || null,
        buyerNote:         buyerNote  || null,
        amount,
        currency,
        gateway,
        status: 'PENDING',
      },
    });

    if (gateway === 'RAZORPAY') {
      const decryptedSecret = decrypt(profile.razorpayKeySecret!);
      const rzp = new Razorpay({ key_id: profile.razorpayKeyId!, key_secret: decryptedSecret });
      const rzpOrder = await rzp.orders.create({
        amount:   Math.round(amount * 100), // paise
        currency: 'INR',
        receipt:  `shop_${order.id.substring(0, 10)}`,
        notes:    { serviceOrderId: order.id, serviceName: service.name, buyerEmail },
      });

      await prisma.serviceOrder.update({
        where: { id: order.id },
        data:  { razorpayOrderId: rzpOrder.id },
      });

      return NextResponse.json({
        gateway:    'RAZORPAY',
        orderId:    order.id,
        rpOrderId:  rzpOrder.id,
        amount:     rzpOrder.amount,
        currency:   rzpOrder.currency,
        keyId:      profile.razorpayKeyId,
        prefill:    { name: buyerName, email: buyerEmail, contact: buyerPhone || '' },
        shopName:   profile.companyName,
        serviceName: service.name,
      });
    }

    // STRIPE path
    if (gateway === 'STRIPE') {
      const Stripe = (await import('stripe')).default;
      const decryptedSecret = decrypt((profile as any).stripeSecretKey!);
      const stripe = new Stripe(decryptedSecret, { apiVersion: '2026-03-25.dahlia' });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency:    'usd',
            unit_amount: Math.round(amount * 100),
            product_data: { name: service.name, description: service.description || undefined },
          },
          quantity: 1,
        }],
        mode:         'payment',
        success_url:  `${process.env.NEXTAUTH_URL}/shop/${slug}?payment=success&order=${order.id}`,
        cancel_url:   `${process.env.NEXTAUTH_URL}/shop/${slug}?payment=cancelled`,
        metadata:     { serviceOrderId: order.id, buyerEmail },
        customer_email: buyerEmail,
      });

      await prisma.serviceOrder.update({
        where: { id: order.id },
        data:  { stripeSessionId: session.id },
      });

      return NextResponse.json({
        gateway:     'STRIPE',
        orderId:     order.id,
        sessionUrl:  session.url,  // Redirect buyer here
      });
    }

    return NextResponse.json({ error: 'Unknown gateway error.' }, { status: 500 });
  } catch (error) {
    console.error('Shop order error:', error);
    return NextResponse.json({ error: 'Failed to create order.' }, { status: 500 });
  }
}
