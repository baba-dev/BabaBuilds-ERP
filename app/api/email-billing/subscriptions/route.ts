import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../_lib/auth';
import { auditEmailBilling } from '../_lib/audit';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import { resolveMailBillingReviewItems } from '@/lib/email-billing/review';
import { mailBillingSubscriptionCreateSchema, parseJsonBody } from '@/lib/email-billing/validation';

export async function GET() {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ subscriptions: await prisma.mailBillingSubscription.findMany({ where: { workspaceId: auth.workspaceId }, include: { domain: true, client: true, plan: true, retainer: true }, orderBy: { createdAt: 'desc' } }) });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailBilling('billing');
  if ('response' in auth) return auth.response;
  try {
    const body = parseJsonBody(mailBillingSubscriptionCreateSchema, await req.json().catch(() => ({})));
    const domain = await prisma.mailBillingDomain.findFirst({ where: { id: body.domainId, workspaceId: auth.workspaceId } });
    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    const clientId = body.clientId || domain.clientId || '';
    const client = await prisma.client.findFirst({ where: { id: clientId, workspaceId: auth.workspaceId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    const plan = body.planId ? await prisma.mailBillingPlan.findFirst({ where: { id: body.planId, workspaceId: auth.workspaceId } }) : null;
    if (body.planId && !plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    const calc = calculateMailBilling({ plan, subscription: null, syncedMailboxCount: domain.mailboxCount, domain: domain.domain });
    const sub = await prisma.$transaction(async (tx) => {
      const subscription = await tx.mailBillingSubscription.upsert({
        where: { workspaceId_domainId: { workspaceId: auth.workspaceId, domainId: domain.id } },
        create: { workspaceId: auth.workspaceId, domainId: domain.id, clientId: client.id, planId: plan?.id, billingStatus: 'REVIEW_REQUIRED', billingModeSnapshot: calc.billingMode, currencySnapshot: calc.currency, basePriceSnapshot: calc.baseAmount, includedMailboxesSnapshot: calc.includedMailboxes, extraMailboxPriceSnapshot: plan?.extraMailboxPrice ?? 0, billableMailboxCount: calc.billableMailboxCount, lastSyncedMailboxCount: domain.mailboxCount, notes: body.notes ?? null },
        update: { clientId: client.id, planId: plan?.id, billingModeSnapshot: calc.billingMode, currencySnapshot: calc.currency, basePriceSnapshot: calc.baseAmount, includedMailboxesSnapshot: calc.includedMailboxes, extraMailboxPriceSnapshot: plan?.extraMailboxPrice ?? 0, billableMailboxCount: calc.billableMailboxCount, lastSyncedMailboxCount: domain.mailboxCount, notes: body.notes ?? null },
      });
      await tx.mailBillingDomain.update({ where: { id: domain.id }, data: { clientId: client.id } });
      return subscription;
    });
    await resolveMailBillingReviewItems(auth.workspaceId, { domainId: domain.id, types: ['DOMAIN_MISSING_CLIENT', 'DOMAIN_MISSING_SUBSCRIPTION'] }, auth.userId);
    auditEmailBilling(auth, 'subscription_created', { type: 'mail_billing_subscription', id: sub.id }, { domainId: domain.id, clientId: client.id, planId: plan?.id ?? null }, req);
    return NextResponse.json({ subscription: sub }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid subscription' }, { status: 400 });
  }
}
