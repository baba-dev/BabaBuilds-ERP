import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../../../_lib/auth';
import { calculateMailBilling } from '@/lib/email-billing/billing-calculator';
import { resolveMailBillingReviewItems } from '@/lib/email-billing/review';
import { mailBillingCreateRetainerSchema, parseJsonBody } from '@/lib/email-billing/validation';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailBilling('invoices.create');
  if ('response' in auth) return auth.response;
  const { id } = await params;
  const domain = await prisma.mailBillingDomain.findFirst({ where: { id, workspaceId: auth.workspaceId }, include: { subscriptions: { include: { plan: true } } } });
  if (!domain) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!domain.clientId) return NextResponse.json({ error: 'Map a client before creating a retainer' }, { status: 400 });
  try {
    const body = parseJsonBody(mailBillingCreateRetainerSchema, await req.json().catch(() => ({})));
    const result = await prisma.$transaction(async (tx) => {
      let sub = domain.subscriptions[0];
      if (!sub) {
        sub = await tx.mailBillingSubscription.create({ data: { workspaceId: auth.workspaceId, domainId: domain.id, clientId: domain.clientId!, billingStatus: 'REVIEW_REQUIRED', billingModeSnapshot: body.billingMode ?? 'FIXED', currencySnapshot: body.currency, basePriceSnapshot: body.amount, billableMailboxCount: body.billingMode === 'PER_MAILBOX' ? Math.max(domain.mailboxCount, 1) : 1, lastSyncedMailboxCount: domain.mailboxCount, notes: domain.billingNotes }, include: { plan: true } });
      }
      const calc = calculateMailBilling({ plan: sub.plan, subscription: sub, syncedMailboxCount: domain.mailboxCount, domain: domain.domain });
      if (calc.reviewRequired) throw new Error(calc.reviewReason ?? 'Review required before creating retainer');
      const retainer = await tx.retainer.create({ data: { workspaceId: auth.workspaceId, clientId: domain.clientId!, currency: calc.currency, frequency: body.frequency || sub.plan?.frequency || 'MONTHLY', nextBillingDate: body.nextBillingDate ? new Date(body.nextBillingDate) : new Date(), amount: calc.totalRecurringAmount, serviceName: `Email Billing - ${domain.domain}`, items: { create: calc.lineItems.map((i) => ({ title: i.title, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: 0 })) } }, include: { items: true } });
      await tx.mailBillingSubscription.update({ where: { id: sub.id }, data: { retainerId: retainer.id, billingStatus: 'ACTIVE', pendingMailboxCount: null } });
      await tx.mailBillingDomain.update({ where: { id }, data: { retainerId: retainer.id, billingMode: sub.billingModeSnapshot, billingNotes: sub.notes } });
      return { retainer, subscriptionId: sub.id };
    });
    await resolveMailBillingReviewItems(auth.workspaceId, { domainId: id, subscriptionId: result.subscriptionId, types: ['DOMAIN_MISSING_SUBSCRIPTION', 'DOMAIN_MISSING_RETAINER'] }, auth.userId);
    return NextResponse.json({ retainer: result.retainer }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid retainer request' }, { status: 400 }); }
}
