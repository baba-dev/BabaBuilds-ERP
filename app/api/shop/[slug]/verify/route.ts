import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

/**
 * POST /api/shop/[slug]/verify
 * Verifies Razorpay payment signature, marks order PAID,
 * auto-generates an ERP invoice, and optionally emails the buyer.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await request.json();
    const { serviceOrderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!serviceOrderId) return NextResponse.json({ error: 'Missing order reference.' }, { status: 400 });

    // Load the order + workspace profile
    const order = await prisma.serviceOrder.findFirst({
      where:   { id: serviceOrderId },
      include: {
        serviceTemplate: true,
        workspace: {
          include: { businessProfile: true },
        },
      },
    });

    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (order.status === 'PAID') return NextResponse.json({ success: true, alreadyPaid: true });

    const profile = order.workspace.businessProfile;
    if (!profile) return NextResponse.json({ error: 'Workspace not configured.' }, { status: 400 });

    // ── Razorpay signature verification ──────────────────────────────────────
    if (order.gateway === 'RAZORPAY') {
      if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return NextResponse.json({ error: 'Missing Razorpay payment details.' }, { status: 400 });
      }
      const decryptedSecret = decrypt(profile.razorpayKeySecret!);
      const expectedSig     = crypto
        .createHmac('sha256', decryptedSecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (expectedSig !== razorpaySignature) {
        await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });
      }

      await prisma.serviceOrder.update({
        where: { id: order.id },
        data:  { razorpayPaymentId, razorpaySignature, status: 'PAID' },
      });
    }

    // ── Auto-generate ERP Invoice ─────────────────────────────────────────────
    try {
      const workspaceId   = order.workspaceId;
      const financialYear = new Date().getFullYear().toString();
      const billingMonth  = new Date().toLocaleString('default', { month: 'long' });

      // Get next invoice number
      const lastInvoice = await prisma.invoice.findFirst({
        where:   { workspaceId },
        orderBy: { createdAt: 'desc' },
        select:  { invoiceNumber: true },
      });
      const nextNum       = lastInvoice
        ? String(parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '') || '0') + 1).padStart(4, '0')
        : '0001';
      const invoiceNumber = `SHOP-${nextNum}`;

      const invoice = await prisma.invoice.create({
        data: {
          workspaceId,
          invoiceNumber,
          financialYear,
          billingMonth,
          invoiceDate:        new Date(),
          clientName:         order.buyerName,
          serviceDescription: `${order.serviceTemplate.name} [E-Commerce Sale]`,
          subtotal:           order.amount,
          taxRate:            0,
          taxAmount:          0,
          grandTotal:         order.amount,
          taxMode:            'exempt',
          totalAmount:        order.amount,
          pdfPath:            '',
          status:             'PAID',
          amountReceived:     Number(order.amount),
          dateReceived:       new Date(),
          items: {
            create: [
              {
                description: `${order.serviceTemplate.name} — E-Commerce Shop Purchase`,
                quantity: 1,
                unitPrice: order.amount,
                taxRate: 0,
                totalAmount: order.amount,
              }
            ]
          }
        },
      });

      // Link invoice to order
      await prisma.serviceOrder.update({
        where: { id: order.id },
        data:  { linkedInvoiceId: invoice.id },
      });
    } catch (invoiceErr) {
      // Non-fatal: log but don't fail the payment confirmation  
      console.error('Auto-invoice generation failed (non-fatal):', invoiceErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified. Thank you for your purchase!',
      orderId: order.id,
    });
  } catch (error) {
    console.error('Shop verify error:', error);
    return NextResponse.json({ error: 'Failed to verify payment.' }, { status: 500 });
  }
}
