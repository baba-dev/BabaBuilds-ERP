import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';
import { commitShopOrderPayment } from '@/lib/shop/commit-shop-order-payment';
import { timingSafeEqualString } from '@/lib/security/signature';
import { isModuleEnabled } from '@/lib/modules';

/**
 * POST /api/shop/[slug]/verify
 * Verifies Razorpay payment signature and commits payment state.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limit = await enforceRouteRateLimit({ request, route: '/api/shop/verify', scope: slug.toLowerCase(), max: 40, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const body = await request.json();
    const { shopOrderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!shopOrderId) return NextResponse.json({ error: 'Missing order reference.' }, { status: 400 });

    // Load the order + workspace profile
    const order = await prisma.shopOrder.findFirst({
      where:   { id: shopOrderId, workspace: { businessProfile: { shopSlug: slug.toLowerCase() } } },
      include: {
        workspace: {
          include: { businessProfile: true },
        },
      },
    });

    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (order.status !== 'PENDING' && order.status !== 'PAID') {
      return NextResponse.json({ error: `Order not payable in ${order.status} state.` }, { status: 409 });
    }

    const profile = order.workspace.businessProfile;
    if (!profile) return NextResponse.json({ error: 'Workspace not configured.' }, { status: 400 });

    if (!(await isModuleEnabled(order.workspaceId, 'SHOP'))) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // ── Razorpay signature verification ──────────────────────────────────────
    if (order.gateway === 'RAZORPAY') {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return NextResponse.json({ error: 'Missing Razorpay payment details.' }, { status: 400 });
      }
      if (!order.razorpayOrderId || razorpayOrderId !== order.razorpayOrderId) {
        return NextResponse.json({ error: 'Gateway order mismatch.' }, { status: 400 });
      }
      const decryptedSecret = decrypt(profile.razorpayKeySecret!);
      const expectedSig     = crypto
        .createHmac('sha256', decryptedSecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (!timingSafeEqualString(expectedSig, razorpaySignature)) {
        await prisma.shopOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });
      }
    }
    const commitResult = await commitShopOrderPayment({
      workspaceId: order.workspaceId,
      expectedSlug: slug,
      shopOrderId: order.id,
      source: "VERIFY",
      gatewayBinding: {
        gateway: "RAZORPAY",
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      },
    });
    if (!commitResult.ok) {
      const status =
        commitResult.code === "ORDER_NOT_FOUND" ? 404 :
        commitResult.code === "VERIFY_BINDING_FAILED" ? 400 :
        commitResult.code === "ORDER_NOT_PAYABLE" ? 409 :
        commitResult.code === "STOCK_COMMIT_FAILED" ? 409 :
        400;
      return NextResponse.json({ error: commitResult.message, code: commitResult.code, refundDue: commitResult.refundDue ?? false }, { status });
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified. Thank you for your purchase!',
      orderId: commitResult.orderId,
      alreadyPaid: commitResult.alreadyPaid,
    });
  } catch (error) {
    console.error('Shop verify error:', error);
    return NextResponse.json({ error: 'Failed to verify payment.' }, { status: 500 });
  }
}
