import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { auditEmailBilling } from '../../../_lib/audit';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import { createMailRetainer } from '@/lib/email-billing/lifecycle';
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

    // During a trial the retainer is created up front but starts billing when the trial ends, and the subscription stays TRIALING.
    const trialing = sub.billingStatus === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt.getTime() > Date.now();
    const nextBillingDate = body.nextBillingDate ? new Date(body.nextBillingDate) : trialing ? sub.trialEndsAt! : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const retainer = await createMailRetainer(tx, {
        workspaceId: auth.workspaceId, subscription: sub, calc, frequency: body.frequency, nextBillingDate, actorUserId: auth.userId,
      });
      const subscription = await tx.mailBillingSubscription.update({
        where: { id },
        data: { retainerId: retainer.id, billingStatus: trialing ? 'TRIALING' : 'ACTIVE', pendingMailboxCount: null },
      });
      return { retainer, subscription };
    });
    await resolveMailBillingReviewItems(auth.workspaceId, { domainId: sub.domainId, subscriptionId: id, types: ['DOMAIN_MISSING_RETAINER', 'DOMAIN_MISSING_SUBSCRIPTION', 'MAILBOX_COUNT_CHANGED'] }, auth.userId);
    auditEmailBilling(auth, 'subscription_retainer_created', { type: 'mail_billing_subscription', id }, { retainerId: result.retainer.id, amount: calc.totalRecurringAmount, currency: calc.currency, startsOn: nextBillingDate.toISOString().slice(0, 10) }, req);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid retainer request' }, { status: 400 });
  }
}
