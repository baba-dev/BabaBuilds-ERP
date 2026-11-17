import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../_lib/auth';
import { auditEmailBilling } from '../../_lib/audit';
import { mailBillingSubscriptionPatchSchema, parseJsonBody } from '@/lib/email-billing/validation';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const subscription = await prisma.mailBillingSubscription.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: { domain: true, client: true, plan: true, retainer: { include: { items: true } }, reviewItems: true },
  });
  if (!subscription) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ subscription });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.mailBillingSubscription.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingSubscriptionPatchSchema, await req.json().catch(() => ({})));
    const subscription = await prisma.mailBillingSubscription.update({
      where: { id },
      data: {
        billingStatus: body.billingStatus ?? existing.billingStatus,
        billableMailboxCount: body.billableMailboxCount ?? existing.billableMailboxCount,
        autoUpdateQuantity: body.autoUpdateQuantity ?? existing.autoUpdateQuantity,
        nextReviewAt: body.nextReviewAt ? new Date(body.nextReviewAt) : existing.nextReviewAt,
        notes: body.notes ?? existing.notes,
      },
    });
    auditEmailBilling(auth, 'subscription_updated', { type: 'mail_billing_subscription', id }, { fields: Object.keys(body), billingStatus: subscription.billingStatus }, req);
    return NextResponse.json({ subscription });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid subscription update' }, { status: 400 });
  }
}
