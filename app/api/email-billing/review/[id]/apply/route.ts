import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';
import { applyBillableQuantity } from '@/lib/email-billing/quantity';
import { mailBillingReviewApplySchema, parseJsonBody } from '@/lib/email-billing/validation';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const item = await prisma.mailBillingReviewItem.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingReviewApplySchema, await req.json().catch(() => ({})));
    if (body.action === 'APPLY_MAILBOX_COUNT') {
      if (!item.subscriptionId) return NextResponse.json({ error: 'This item is not linked to a subscription' }, { status: 400 });
      const sub = await prisma.mailBillingSubscription.findFirst({ where: { id: item.subscriptionId, workspaceId: auth.workspaceId }, select: { pendingMailboxCount: true, billingStatus: true } });
      if (!sub || sub.pendingMailboxCount === null) return NextResponse.json({ error: 'No pending mailbox count to apply' }, { status: 400 });
      if (sub.billingStatus === 'CANCELLED') return NextResponse.json({ error: 'A cancelled subscription cannot be changed' }, { status: 409 });
      const result = await applyBillableQuantity({ workspaceId: auth.workspaceId, subscriptionId: item.subscriptionId, toCount: sub.pendingMailboxCount, source: 'APPROVED', actorUserId: auth.userId });
      if (!result.changed && result.reason === 'CONFLICT') return NextResponse.json({ error: 'The subscription changed while applying; try again' }, { status: 409 });
      const resolved = await prisma.mailBillingReviewItem.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId: auth.userId } });
      auditEmailBilling(auth, 'review_applied', { type: 'mail_billing_review_item', id }, { action: body.action, type: item.type }, req);
      return NextResponse.json({ item: resolved, result });
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (body.action === 'IGNORE_DOMAIN' && item.domainId) await tx.mailBillingDomain.update({ where: { id: item.domainId }, data: { status: 'IGNORED' } });
      if (body.action === 'PAUSE_SUBSCRIPTION' && item.subscriptionId) await tx.mailBillingSubscription.update({ where: { id: item.subscriptionId }, data: { billingStatus: 'PAUSED' } });
      return tx.mailBillingReviewItem.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId: auth.userId } });
    });
    auditEmailBilling(auth, 'review_applied', { type: 'mail_billing_review_item', id }, { action: body.action, type: item.type }, req);
    return NextResponse.json({ item: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid review action' }, { status: 400 }); }
}
