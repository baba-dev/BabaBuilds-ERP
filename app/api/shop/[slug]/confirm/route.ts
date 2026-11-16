import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { isModuleEnabled } from '@/lib/modules';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { commitShopOrderPayment } from '@/lib/shop/commit-shop-order-payment';
import { toMinorUnits } from '@/lib/shop/pricing';

const body = z.object({ orderId: z.string().trim().min(1).max(40), sessionId: z.string().trim().min(5).max(200) });

/**
 * POST /api/shop/[slug]/confirm
 * Called when the buyer returns from Stripe Checkout. The payment is confirmed with Stripe itself (never trusted from the
 * browser): the session must be paid, belong to this order, and match its amount and currency.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limit = enforceRouteRateLimit({ request, route: '/api/shop/confirm', scope: slug.toLowerCase(), max: 40, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Missing payment details.' }, { status: 400 });
    const { orderId, sessionId } = parsed.data;

    const order = await prisma.shopOrder.findFirst({ where: { id: orderId, workspace: { businessProfile: { shopSlug: slug.toLowerCase() } } }, include: { workspace: { include: { businessProfile: true } } } });
    if (!order || order.gateway !== 'STRIPE' || order.stripeSessionId !== sessionId) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (!(await isModuleEnabled(order.workspaceId, 'SHOP'))) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const secret = (order.workspace.businessProfile as { stripeSecretKey?: string | null } | null)?.stripeSecretKey;
    if (!secret) return NextResponse.json({ error: 'Workspace not configured.' }, { status: 400 });

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(decrypt(secret), { apiVersion: '2026-03-25.dahlia' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.shopOrderId !== order.id) return NextResponse.json({ error: 'This payment does not belong to the order.' }, { status: 400 });
    if (session.payment_status !== 'paid') return NextResponse.json({ error: 'The payment has not been completed.', code: 'NOT_PAID' }, { status: 409 });

    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
    const result = await commitShopOrderPayment({
      workspaceId: order.workspaceId, shopOrderId: order.id, expectedSlug: slug, source: 'STRIPE',
      gatewayBinding: { gateway: 'STRIPE', paymentId: pi, amountSubunits: session.amount_total ?? toMinorUnits(-1, order.currency), currency: session.currency ?? null },
    });
    if (!result.ok) {
      const status = result.code === 'ORDER_NOT_FOUND' ? 404 : result.code === 'VERIFY_BINDING_FAILED' ? 400 : 409;
      return NextResponse.json({ error: result.message, code: result.code, refundDue: result.refundDue ?? false }, { status });
    }
    return NextResponse.json({ success: true, orderId: result.orderId, alreadyPaid: result.alreadyPaid });
  } catch (error) {
    console.error('Shop confirm error:', error);
    return NextResponse.json({ error: 'Failed to confirm the payment.' }, { status: 500 });
  }
}
