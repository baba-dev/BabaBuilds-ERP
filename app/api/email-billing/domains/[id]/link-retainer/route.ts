import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { resolveMailBillingReviewItems } from '@/lib/email-billing/review';
import { mailBillingLinkRetainerSchema, parseJsonBody } from '@/lib/email-billing/validation';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('invoices.edit');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const domain = await prisma.mailBillingDomain.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { subscriptions: true } });
  if (!domain) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingLinkRetainerSchema, await req.json().catch(() => ({})));
    const retainer = await prisma.retainer.findFirst({ where: { id: body.retainerId, workspaceId: auth.workspaceId } });
    if (!retainer) return NextResponse.json({ error: 'Retainer not found' }, { status: 404 });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.mailBillingDomain.update({ where: { id }, data: { retainerId: retainer.id, clientId: domain.clientId ?? retainer.clientId } });
      const subscription = domain.subscriptions[0]
        ? await tx.mailBillingSubscription.update({ where: { id: domain.subscriptions[0].id }, data: { retainerId: retainer.id, clientId: retainer.clientId, billingStatus: 'ACTIVE' } })
        : null;
      return subscription;
    });
    await resolveMailBillingReviewItems(auth.workspaceId, { domainId: id, subscriptionId: updated?.id, types: ['DOMAIN_MISSING_RETAINER'] }, auth.userId);
    return NextResponse.json({ subscription: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid retainer link' }, { status: 400 }); }
}
