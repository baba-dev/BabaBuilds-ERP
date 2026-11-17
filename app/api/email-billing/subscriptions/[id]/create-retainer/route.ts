import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import { resolveMailBillingReviewItems } from '@/lib/email-billing/review';
import { mailBillingCreateRetainerSchema, parseJsonBody } from '@/lib/email-billing/validation';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('billing', { legacy: 'invoices.create' });
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const sub = await prisma.mailBillingSubscription.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { domain: true, plan: true } });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const body = parseJsonBody(mailBillingCreateRetainerSchema, await req.json().catch(() => ({})));
    const calc = calculateMailBilling({ plan: sub.plan, subscription: sub, syncedMailboxCount: sub.domain.mailboxCount, domain: sub.domain.domain });
    if (calc.reviewRequired) return NextResponse.json({ error: calc.reviewReason }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const retainer = await tx.retainer.create({ data: { workspaceId: auth.workspaceId, clientId: sub.clientId, currency: calc.currency, frequency: body.frequency || sub.plan?.frequency || 'MONTHLY', nextBillingDate: body.nextBillingDate ? new Date(body.nextBillingDate) : new Date(), amount: calc.totalRecurringAmount, serviceName: `Email Billing - ${sub.domain.domain}`, items: { create: calc.lineItems.map((i) => ({ title: i.title, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: 0 })) } }, include: { items: true } });
      const subscription = await tx.mailBillingSubscription.update({ where: { id }, data: { retainerId: retainer.id, billingStatus: 'ACTIVE', pendingMailboxCount: null } });
      return { retainer, subscription };
    });
    await resolveMailBillingReviewItems(auth.workspaceId, { domainId: sub.domainId, subscriptionId: id, types: ['DOMAIN_MISSING_RETAINER', 'DOMAIN_MISSING_SUBSCRIPTION', 'MAILBOX_COUNT_CHANGED'] }, auth.userId);
    auditEmailBilling(auth, 'subscription_retainer_created', { type: 'mail_billing_subscription', id }, { retainerId: result.retainer.id, amount: calc.totalRecurringAmount, currency: calc.currency }, req);
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid retainer request' }, { status: 400 }); }
}
