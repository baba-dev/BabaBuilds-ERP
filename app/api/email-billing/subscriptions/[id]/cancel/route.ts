import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const existing = await prisma.mailBillingSubscription.findFirst({ where: { id, workspaceId: auth.workspaceId } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const subscription = await prisma.mailBillingSubscription.update({ where: { id }, data: { billingStatus: 'CANCELLED', cancelledAt: existing.cancelledAt ?? new Date(), trialEndsAt: null } });
  auditEmailBilling(auth, 'subscription_cancelled', { type: 'mail_billing_subscription', id }, { from: existing.billingStatus, to: 'CANCELLED' }, req);
  return NextResponse.json({ subscription });
}
