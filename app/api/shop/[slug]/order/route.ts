import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import Razorpay from 'razorpay';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';
import { isModuleEnabled } from '@/lib/modules';
import { normalizeGstin, validateGstin } from '@/lib/gst/gstin';
import { resolveClientGstState } from '@/lib/gst/client-state';
import { supplierChargesGst } from '@/lib/msme/threshold';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { priceShopOrder, toMinorUnits } from '@/lib/shop/pricing';

type BusinessProfileWithSecrets = { stripeSecretKey?: string | null };

const bodySchema = z.object({
  items: z.array(z.object({ productId: z.string().trim().min(1).max(40), quantity: z.number().int().min(1).max(99) })).min(1).max(30),
  buyerName: z.string().trim().min(1, 'Please enter your name.').max(120),
  buyerEmail: z.string().trim().email('Please enter a valid email.').max(120),
  buyerPhone: z.string().trim().max(24).optional().nullable(),
  buyerNote: z.string().trim().max(500).optional().nullable(),
  shippingAddress: z.string().trim().min(10, 'Please enter your full delivery address.').max(400),
  buyerStateCode: z.string().trim().max(2).optional().nullable(),
  buyerGstin: z.string().trim().max(20).optional().nullable(),
});

/**
 * POST /api/shop/[slug]/order
 * Public endpoint, no sign-in. Prices the basket from the catalogue (never from the browser), adds GST, and starts a
 * payment with the shop's gateway (Razorpay or Stripe). The order stays PENDING until the payment is confirmed.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limit = enforceRouteRateLimit({ request, route: '/api/shop/order', scope: slug.toLowerCase(), max: 20, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Please check the order details.', code: 'INVALID_ORDER', fields: parsed.error.flatten().fieldErrors }, { status: 422 });
    }
    const d = parsed.data;

    const profile = await prisma.businessProfile.findUnique({ where: { shopSlug: slug.toLowerCase() }, include: { workspace: { select: { id: true, countryCode: true, baseCurrency: true } } } });
    if (!profile || !profile.shopEnabled || !(await isModuleEnabled(profile.workspaceId, 'SHOP'))) {
      return NextResponse.json({ error: 'Shop not found.' }, { status: 404 });
    }

    const gstinInput = normalizeGstin(d.buyerGstin);
    if (gstinInput && !validateGstin(gstinInput).valid) {
      return NextResponse.json({ error: 'The GSTIN entered is not valid.', code: 'GSTIN_INVALID' }, { status: 422 });
    }
    const buyerState = resolveClientGstState(d.buyerStateCode ?? null, gstinInput || null);

    const ids = [...new Set(d.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { workspaceId: profile.workspaceId, id: { in: ids }, showInShop: true, archivedAt: null, currentStock: { gt: 0 }, status: { in: ['IN_STOCK', 'LOW_STOCK'] } },
      select: { id: true, name: true, sku: true, baselinePrice: true, gstRate: true, currentStock: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Ask for the same product twice and the quantities are added, so stock is checked against the whole amount.
    const wanted = new Map<string, number>();
    for (const i of d.items) wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.quantity);
    for (const [id, qty] of wanted) {
      const p = byId.get(id);
      if (!p) return NextResponse.json({ error: 'One of the products is no longer available.', code: 'PRODUCT_UNAVAILABLE' }, { status: 404 });
      if (qty > p.currentStock) return NextResponse.json({ error: `Only ${p.currentStock} of ${p.name} left in stock.`, code: 'INSUFFICIENT_STOCK' }, { status: 409 });
    }

    const countryCode = profile.workspace?.countryCode || 'IN';
    const chargesGst = supplierChargesGst(profile, countryCode);
    const priced = priceShopOrder(
      [...wanted].map(([id, quantity]) => { const p = byId.get(id)!; return { productId: id, name: p.name, sku: p.sku, quantity, unitPrice: Number(p.baselinePrice ?? 0), taxRate: p.gstRate ?? 0 }; }),
      chargesGst,
    );
    if (priced.total <= 0) return NextResponse.json({ error: 'This order has no value.', code: 'ZERO_TOTAL' }, { status: 422 });
    const currency = (profile.workspace?.baseCurrency || 'INR').toUpperCase();

    const hasRazorpay = !!(profile.razorpayKeyId && profile.razorpayKeySecret);
    const profileSecrets = profile as typeof profile & BusinessProfileWithSecrets;
    const hasStripe = !!(profile.stripePublishableKey && profileSecrets.stripeSecretKey);
    const gateway = hasRazorpay && profile.defaultGateway !== 'STRIPE' ? 'RAZORPAY' : hasStripe ? 'STRIPE' : null;
    if (!gateway) return NextResponse.json({ error: 'Payment gateway not configured for this shop.' }, { status: 400 });

    const order = await prisma.shopOrder.create({
      data: {
        workspaceId: profile.workspaceId, buyerName: d.buyerName, buyerEmail: d.buyerEmail, buyerPhone: d.buyerPhone || null, buyerNote: d.buyerNote || null,
        shippingAddress: d.shippingAddress, buyerStateCode: buyerState, buyerGstin: gstinInput || null,
        subtotal: new Prisma.Decimal(priced.subtotal), taxTotal: new Prisma.Decimal(priced.tax), amount: new Prisma.Decimal(priced.total), currency, gateway, status: 'PENDING',
        items: { create: priced.lines.map((l) => ({ productId: l.productId, productName: l.name, sku: l.sku, quantity: l.quantity, unitPrice: new Prisma.Decimal(l.unitPrice), taxRate: l.taxRate, lineTax: new Prisma.Decimal(l.lineTax), lineTotal: new Prisma.Decimal(l.lineTotal) })) },
      },
      include: { items: true },
    });

    void dispatchNotification({ event: 'SHOP_ORDER_CREATED', workspaceId: profile.workspaceId, data: { orderId: order.id, itemCount: order.items.length, buyerName: d.buyerName, buyerEmail: d.buyerEmail, amount: `${currency} ${priced.total.toFixed(2)}`, status: order.status } }).catch(() => null);
    void logActivity({ action: 'shop_order_create', status: 'SUCCESS', workspaceId: profile.workspaceId, actor: { userId: null, email: d.buyerEmail }, entity: { type: 'shop_order', id: order.id }, metadata: { source: 'public_shop', lines: order.items.length, gateway, amount: priced.total, tax: priced.tax, currency }, request });

    if (gateway === 'RAZORPAY') {
      const rzp = new Razorpay({ key_id: profile.razorpayKeyId!, key_secret: decrypt(profile.razorpayKeySecret!) });
      const rzpOrder = await rzp.orders.create({ amount: toMinorUnits(priced.total, currency), currency, receipt: `shop_${order.id.substring(0, 10)}`, notes: { shopOrderId: order.id, buyerEmail: d.buyerEmail } });
      await prisma.shopOrder.update({ where: { id: order.id }, data: { razorpayOrderId: rzpOrder.id } });
      return NextResponse.json({
        gateway: 'RAZORPAY', orderId: order.id, rpOrderId: rzpOrder.id, amount: rzpOrder.amount, currency: rzpOrder.currency, keyId: profile.razorpayKeyId,
        prefill: { name: d.buyerName, email: d.buyerEmail, contact: d.buyerPhone || '' }, shopName: profile.companyName, itemCount: order.items.length, total: priced.total,
      });
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(decrypt(profileSecrets.stripeSecretKey!), { apiVersion: '2026-03-25.dahlia' });
    const cur = currency.toLowerCase();
    const base = process.env.NEXTAUTH_URL ?? '';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        ...priced.lines.map((l) => ({ price_data: { currency: cur, unit_amount: toMinorUnits(l.unitPrice, currency), product_data: { name: l.name, description: `SKU ${l.sku}` } }, quantity: l.quantity })),
        ...(priced.tax > 0 ? [{ price_data: { currency: cur, unit_amount: toMinorUnits(priced.tax, currency), product_data: { name: 'GST' } }, quantity: 1 }] : []),
      ],
      mode: 'payment',
      success_url: `${base}/shop/${slug}?payment=success&order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/shop/${slug}?payment=cancelled`,
      metadata: { shopOrderId: order.id, buyerEmail: d.buyerEmail },
      customer_email: d.buyerEmail,
    });
    await prisma.shopOrder.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return NextResponse.json({ gateway: 'STRIPE', orderId: order.id, sessionUrl: session.url, total: priced.total });
  } catch (error) {
    console.error('Shop order error:', error);
    return NextResponse.json({ error: 'Failed to create order.' }, { status: 500 });
  }
}
