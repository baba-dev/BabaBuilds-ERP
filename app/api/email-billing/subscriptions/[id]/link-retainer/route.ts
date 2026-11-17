import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';
import { resolveMailBillingReviewItems } from '@/lib/email-billing/review';
import { mailBillingLinkRetainerSchema, parseJsonBody } from '@/lib/email-billing/validation';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const sub = await prisma.mailBillingSubscription.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingLinkRetainerSchema, await req.json().catch(() => ({})));
    const retainer = await prisma.retainer.findFirst({ where: { id: body.retainerId, workspaceId: auth.workspaceId } });
    if (!retainer) return NextResponse.json({ error: 'Retainer not found' }, { status: 404 });
    const subscription = await prisma.mailBillingSubscription.update({
      where: { id },
      data: { retainerId: retainer.id, billingStatus: retainer.status === 'ACTIVE' ? 'ACTIVE' : 'REVIEW_REQUIRED' },
    });
    await resolveMailBillingReviewItems(auth.workspaceId, { domainId: sub.domainId, subscriptionId: id, types: ['DOMAIN_MISSING_RETAINER'] }, auth.userId);
    auditEmailBilling(auth, 'subscription_retainer_linked', { type: 'mail_billing_subscription', id }, { retainerId: retainer.id }, req);
    return NextResponse.json({ subscription });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid retainer link' }, { status: 400 });
  }
}
