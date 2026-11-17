import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { addRetainerEvent } from '@/lib/retainers/events';
import { afterRetainerChange } from '@/lib/retainers/save';
import { calculateMailBilling } from './billing-calculator';
import { createMailBillingReviewItem, resolveMailBillingReviewItems } from './review';

type Tx = Prisma.TransactionClient;

/** Creates the recurring retainer for a subscription from the calculator's lines. The retainer engine does the invoicing. */
export async function createMailRetainer(tx: Tx, args: {
  workspaceId: string;
  subscription: { id: string; clientId: string; plan: { frequency: string } | null; domain: { domain: string } };
  calc: ReturnType<typeof calculateMailBilling>;
  frequency?: string;
  nextBillingDate: Date;
  actorUserId?: string | null;
}) {
  const { workspaceId, subscription, calc } = args;
  const retainer = await tx.retainer.create({
    data: {
      workspaceId,
      clientId: subscription.clientId,
      currency: calc.currency,
      frequency: args.frequency || subscription.plan?.frequency || 'MONTHLY',
      nextBillingDate: args.nextBillingDate,
      amount: calc.totalRecurringAmount,
      serviceName: `Email Billing - ${subscription.domain.domain}`,
      items: { create: calc.lineItems.map((i) => ({ title: i.title, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: 0 })) },
    },
    include: { items: true },
  });
  await addRetainerEvent(tx, {
    workspaceId, retainerId: retainer.id, type: 'CREATED', actorUserId: args.actorUserId ?? null,
    message: `Email hosting subscription for ${subscription.domain.domain}`,
    metadata: { source: 'email_hosting', subscriptionId: subscription.id },
  });
  return retainer;
}

export type TrialConversionStats = { converted: number; needsReview: number; skipped: number; failed: number };

/**
 * Turns trials that have ended into billed subscriptions. Safe to run repeatedly: each subscription is claimed with a
 * conditional update, and a failure rolls back and is retried on the next run.
 *  - a linked active retainer is kept as is and the subscription becomes ACTIVE;
 *  - otherwise a retainer is created that bills from the trial end date (the retainer job invoices it);
 *  - manual-priced subscriptions, or a linked retainer that is not active, are sent to the review queue.
 */
export async function convertEndedTrials(args: { workspaceId?: string; now: Date }): Promise<TrialConversionStats> {
  const stats: TrialConversionStats = { converted: 0, needsReview: 0, skipped: 0, failed: 0 };
  const due = await prisma.mailBillingSubscription.findMany({
    where: { billingStatus: 'TRIALING', trialEndsAt: { lte: args.now }, ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}) },
    include: { domain: true, plan: true, retainer: { select: { id: true, status: true } } },
  });

  for (const sub of due) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const claimed = await tx.mailBillingSubscription.updateMany({ where: { id: sub.id, billingStatus: 'TRIALING' }, data: { billingStatus: 'REVIEW_REQUIRED' } });
        if (claimed.count === 0) return 'SKIPPED' as const;

        if (sub.retainer) {
          if (sub.retainer.status !== 'ACTIVE') return 'NEEDS_REVIEW' as const;
          await tx.mailBillingSubscription.update({ where: { id: sub.id }, data: { billingStatus: 'ACTIVE' } });
          return 'CONVERTED' as const;
        }
        const calc = calculateMailBilling({ plan: sub.plan, subscription: sub, syncedMailboxCount: sub.domain.mailboxCount, domain: sub.domain.domain });
        if (calc.reviewRequired) return 'NEEDS_REVIEW' as const;
        const retainer = await createMailRetainer(tx, {
          workspaceId: sub.workspaceId, subscription: sub, calc, nextBillingDate: sub.trialEndsAt ?? args.now,
        });
        await tx.mailBillingSubscription.update({ where: { id: sub.id }, data: { retainerId: retainer.id, billingStatus: 'ACTIVE', pendingMailboxCount: null } });
        await tx.mailBillingDomain.update({ where: { id: sub.domainId }, data: { retainerId: retainer.id, billingMode: sub.billingModeSnapshot } });
        return 'CONVERTED' as const;
      });

      if (outcome === 'SKIPPED') { stats.skipped++; continue; }
      if (outcome === 'NEEDS_REVIEW') {
        stats.needsReview++;
        await createMailBillingReviewItem({
          workspaceId: sub.workspaceId, domainId: sub.domainId, subscriptionId: sub.id, type: 'TRIAL_ENDED_NEEDS_RETAINER', severity: 'WARNING',
          title: `Trial ended for ${sub.domain.domain}: billing needs setup`,
          description: 'The trial period is over but no active retainer could be started automatically.',
          suggestedAction: 'Create or link an active retainer, or cancel the subscription.',
        });
      } else {
        stats.converted++;
        await resolveMailBillingReviewItems(sub.workspaceId, { subscriptionId: sub.id, types: ['DOMAIN_MISSING_RETAINER', 'DOMAIN_MISSING_SUBSCRIPTION'] });
        await afterRetainerChange(sub.workspaceId, 'email_hosting_trial_converted');
      }
      void logActivity({
        workspaceId: sub.workspaceId, action: 'email_billing.trial_ended', status: 'SUCCESS', actor: { userId: 'system', email: 'system' },
        entity: { type: 'mail_billing_subscription', id: sub.id }, metadata: { outcome },
      });
    } catch (error) {
      stats.failed++;
      console.error('Email hosting trial conversion failed:', sub.id, error);
    }
  }
  return stats;
}
