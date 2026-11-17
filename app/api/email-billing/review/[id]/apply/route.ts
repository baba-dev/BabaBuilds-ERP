import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';
import { mailBillingReviewApplySchema, parseJsonBody } from '@/lib/email-billing/validation';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const item = await prisma.mailBillingReviewItem.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingReviewApplySchema, await req.json().catch(() => ({})));
    const updated = await prisma.$transaction(async (tx) => {
      if (body.action === 'IGNORE_DOMAIN' && item.domainId) await tx.mailBillingDomain.update({ where: { id: item.domainId }, data: { status: 'IGNORED' } });
      if (body.action === 'PAUSE_SUBSCRIPTION' && item.subscriptionId) await tx.mailBillingSubscription.update({ where: { id: item.subscriptionId }, data: { billingStatus: 'PAUSED' } });
      return tx.mailBillingReviewItem.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedByUserId: auth.userId } });
    });
    auditEmailBilling(auth, 'review_applied', { type: 'mail_billing_review_item', id }, { action: body.action, type: item.type }, req);
    return NextResponse.json({ item: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid review action' }, { status: 400 }); }
}
