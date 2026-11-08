import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import Razorpay from 'razorpay';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';
import { Prisma } from '@prisma/client';
import { isModuleEnabled } from '@/lib/modules';
import { normalizeGstin, validateGstin } from '@/lib/gst/gstin';
import { resolveClientGstState } from '@/lib/gst/client-state';

type BusinessProfileWithSecrets = {
  stripeSecretKey?: string | null;
};

/**
 * POST /api/shop/[slug]/order
 * Public endpoint — no auth required.
 * Creates a payment order (Razorpay or Stripe) for a product checkout.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await request.json();
    const { items, buyerName, buyerEmail, buyerPhone, buyerNote, buyerStateCode, buyerGstin } = body as {
      items?: unknown[];
      buyerName?: string;
      buyerEmail?: string;
      buyerPhone?: string;
      buyerNote?: string;
      buyerStateCode?: string;
      buyerGstin?: string;
    };

    if (!Array.isArray(items) || items.length === 0 || !buyerName || !buyerEmail) {
      return NextResponse.json({ error: 'Missing required buyer information.' }, { status: 400 });
    }

    // Load workspace profile
    const profile = await prisma.businessProfile.findUnique({
      where: { shopSlug: slug.toLowerCase() },
      include: { workspace: true },
    });

    if (!profile || !profile.shopEnabled) {
      return NextResponse.json({ error: 'Shop not found.' }, { status: 404 });
    }

    if (!(await isModuleEnabled(profile.workspaceId, 'SHOP'))) {
      return NextResponse.json({ error: 'Shop not found.' }, { status: 404 });
    }

    // Place of supply for the GST invoice: a valid GSTIN fixes the state; otherwise the delivery state chosen.
    const gstinInput = normalizeGstin(buyerGstin);
    if (gstinInput && !validateGstin(gstinInput).valid) {
      return NextResponse.json({ error: 'The GSTIN entered is not valid.', code: 'GSTIN_INVALID' }, { status: 422 });
    }
    const buyerState = resolveClientGstState(buyerStateCode ?? null, gstinInput || null);

    const normalizedItems = items
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const productId = String((item as { productId?: unknown }).productId || '').trim();
        const quantity = Number((item as { quantity?: unknown }).quantity ?? 0);
        return productId && Number.isFinite(quantity) && quantity > 0
          ? { productId, quantity: Math.floor(quantity) }
          : null;
      })
      .filter((item: { productId: string; quantity: number } | null): item is { productId: string; quantity: number } => Boolean(item));

    if (normalizedItems.length === 0) {
      return NextResponse.json({ error: 'No valid product lines were provided.' }, { status: 400 });
    }

    const requestedProductIds = Array.from(new Set(normalizedItems.map((item: { productId: string }) => item.productId)));
    const products = await prisma.product.findMany({
      where: {
        workspaceId: profile.workspaceId,
        id: { in: requestedProductIds },
        showInShop: true,
        currentStock: { gt: 0 },
        status: { in: ['IN_STOCK', 'LOW_STOCK'] },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        baselinePrice: true,
        currentStock: true,
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const lineItems: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }> = [];

    for (const item of normalizedItems) {
      const product = productById.get(item.productId);
      if (!product) {
        return NextResponse.json({ error: 'Product is not available in this shop.' }, { status: 404 });
      }
      if (item.quantity > product.currentStock) {
        return NextResponse.json(
          { error: `Insufficient stock for ${product.name}. Requested ${item.quantity}, available ${product.currentStock}.` },
          { status: 409 },
        );
      }
      const unitPrice = new Prisma.Decimal(product.baselinePrice ?? 0);
      const lineTotal = unitPrice.mul(item.quantity);
      lineItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      });
    }

    const subtotalDecimal = lineItems.reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
    const amountDecimal = subtotalDecimal;
    const amount = Number(amountDecimal.toFixed(2));
    const currency = profile.workspace ? 'INR' : 'INR'; // extend for multi-currency later

    // Determine which gateway to use
    const hasRazorpay = !!(profile.razorpayKeyId && profile.razorpayKeySecret);
    const profileSecrets = profile as typeof profile & BusinessProfileWithSecrets;
    const hasStripe   = !!(profile.stripePublishableKey && profileSecrets.stripeSecretKey);
    const gateway     = hasRazorpay && profile.defaultGateway !== 'STRIPE'
      ? 'RAZORPAY'
      : hasStripe ? 'STRIPE' : null;

    if (!gateway) {
      return NextResponse.json({ error: 'Payment gateway not configured for this shop.' }, { status: 400 });
    }

    // Create DB record in PENDING state
    const order = await prisma.shopOrder.create({
      data: {
        workspaceId: profile.workspaceId,
        buyerName,
        buyerEmail,
        buyerPhone: buyerPhone || null,
        buyerNote: buyerNote || null,
        buyerStateCode: buyerState,
        buyerGstin: gstinInput || null,
        subtotal: subtotalDecimal,
        taxTotal: 0,
        amount: amountDecimal,
        currency,
        gateway,
        status: 'PENDING',
        items: {
          create: lineItems.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: 0,
            lineTax: 0,
            lineTotal: item.lineTotal,
          })),
        },
      },
      include: { items: true },
    });

    dispatchNotification({
      event: 'SHOP_ORDER_CREATED',
      workspaceId: profile.workspaceId,
      data: {
        orderId: order.id,
        itemCount: order.items.length,
        buyerName,
        buyerEmail,
        amount: `${currency} ${amount}`,
        status: order.status,
      },
    }).catch(() => null);

    await logActivity({
      action: 'shop_order_create',
      status: 'SUCCESS',
      workspaceId: profile.workspaceId,
      actor: {
        userId: null,
        email: buyerEmail,
      },
      entity: {
        type: 'shop_order',
        id: order.id,
      },
      metadata: {
        source: 'public_shop',
        items: order.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
        })),
        gateway,
        amount,
        currency,
        buyerName,
        buyerPhone: buyerPhone || null,
      },
      request,
    });

    if (gateway === 'RAZORPAY') {
      const decryptedSecret = decrypt(profile.razorpayKeySecret!);
      const rzp = new Razorpay({ key_id: profile.razorpayKeyId!, key_secret: decryptedSecret });
      const rzpOrder = await rzp.orders.create({
        amount:   Math.round(amount * 100), // paise
        currency: 'INR',
        receipt:  `shop_${order.id.substring(0, 10)}`,
        notes:    { shopOrderId: order.id, buyerEmail },
      });

      await prisma.shopOrder.update({
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
        itemCount: order.items.length,
      });
    }

    // STRIPE path
    if (gateway === 'STRIPE') {
      const Stripe = (await import('stripe')).default;
      const decryptedSecret = decrypt(profileSecrets.stripeSecretKey!);
      const stripe = new Stripe(decryptedSecret, { apiVersion: '2026-03-25.dahlia' });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems.map((item) => ({
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(Number(item.unitPrice.toFixed(2)) * 100),
            product_data: { name: item.productName, description: `SKU ${item.sku}` },
          },
          quantity: item.quantity,
        })),
        mode:         'payment',
        success_url:  `${process.env.NEXTAUTH_URL}/shop/${slug}?payment=success&order=${order.id}`,
        cancel_url:   `${process.env.NEXTAUTH_URL}/shop/${slug}?payment=cancelled`,
        metadata:     { shopOrderId: order.id, buyerEmail },
        customer_email: buyerEmail,
      });

      await prisma.shopOrder.update({
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
