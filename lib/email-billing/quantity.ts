import 'server-only';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { addRetainerEvent } from '@/lib/retainers/events';
import { afterRetainerChange } from '@/lib/retainers/save';
import { calculateMailBilling } from './billing-calculator';
import { createMailBillingReviewItem, resolveMailBillingReviewItems } from './review';
import { loadMailBillingSettings, type EffectiveMailBillingSettings } from './settings';
import { cycleStart, planRetainerItemSync, pickBillableCount, prorateIncrease, remainingCycleFraction, utcDay } from './usage-math';

export type QuantitySource = 'AUTO' | 'APPROVED' | 'MANUAL';
export type ApplyQuantityResult =
  | { changed: false; reason: 'UNCHANGED' | 'CONFLICT' }
  | { changed: true; fromCount: number; toCount: number; prorationAmount: number; currency: string; retainerUpdated: boolean };

export class MailSubscriptionNotFoundError extends Error {
  constructor() { super('Subscription not found'); this.name = 'MailSubscriptionNotFoundError'; }
}

const subscriptionInclude = {
  domain: true,
  plan: true,
  retainer: { include: { items: true } },
} as const;

/**
 * Sets a subscription's billable mailbox count and carries it through to the linked retainer:
 *  - managed retainer lines are updated, created or removed (lines a person added are left alone);
 *  - an increase part-way through a cycle queues a prorated one-off charge as pending usage on the retainer, so it is
 *    billed on the next invoice by the existing retainer engine; decreases take effect from the next invoice, no credit;
 *  - the change is written to the MailBillingChange ledger and the retainer history.
 * Everything is one transaction, guarded so a concurrent change cannot be applied twice.
 */
export async function applyBillableQuantity(args: {
  workspaceId: string; subscriptionId: string; toCount: number; source: QuantitySource; actorUserId?: string | null; now?: Date;
  settings?: EffectiveMailBillingSettings;
}): Promise<ApplyQuantityResult> {
  const { workspaceId, subscriptionId, source } = args;
  const now = args.now ?? new Date();
  const toCount = Math.max(0, Math.trunc(args.toCount));
  const sub = await prisma.mailBillingSubscription.findFirst({ where: { id: subscriptionId, workspaceId }, include: subscriptionInclude });
  if (!sub) throw new MailSubscriptionNotFoundError();
  const fromCount = sub.billableMailboxCount;
  if (fromCount === toCount) return { changed: false, reason: 'UNCHANGED' };
  const settings = args.settings ?? (await loadMailBillingSettings(workspaceId));

  const calcFor = (count: number) => calculateMailBilling({
    plan: sub.plan, subscription: { ...sub, billableMailboxCount: count }, syncedMailboxCount: count, domain: sub.domain.domain,
  });
  const before = calcFor(fromCount);
  const after = calcFor(toCount);
  const retainer = sub.retainer;
  const retainerLive = Boolean(retainer && retainer.status === 'ACTIVE' && after.billingMode !== 'MANUAL');

  let prorationAmount = 0;
  let fraction = 0;
  if (retainerLive && retainer && settings.prorateIncreases && toCount > fromCount) {
    fraction = remainingCycleFraction(now, retainer.nextBillingDate, retainer.frequency);
    prorationAmount = prorateIncrease(after.totalRecurringAmount - before.totalRecurringAmount, fraction);
  }

  const outcome = await prisma.$transaction(async (tx) => {
    // Optimistic guard: only the caller that still sees the count we started from may change it.
    const claimed = await tx.mailBillingSubscription.updateMany({
      where: { id: sub.id, workspaceId, billableMailboxCount: fromCount },
      data: {
        billableMailboxCount: toCount,
        pendingMailboxCount: null,
        lastSyncedMailboxCount: toCount,
        ...(sub.billingStatus === 'REVIEW_REQUIRED' && retainer?.status === 'ACTIVE' ? { billingStatus: 'ACTIVE' } : {}),
      },
    });
    if (claimed.count === 0) return null;

    let meteredUsageId: string | null = null;
    if (retainer && after.billingMode !== 'MANUAL') {
      const sync = planRetainerItemSync(retainer.items, after.lineItems, sub.domain.domain);
      for (const u of sync.update) await tx.retainerItem.update({ where: { id: u.id }, data: { quantity: u.quantity, unitPrice: u.unitPrice } });
      if (sync.create.length) await tx.retainerItem.createMany({ data: sync.create.map((c) => ({ ...c, retainerId: retainer.id })) });
      if (sync.remove.length) await tx.retainerItem.deleteMany({ where: { id: { in: sync.remove }, retainerId: retainer.id } });
      await tx.retainer.update({ where: { id: retainer.id }, data: { amount: after.totalRecurringAmount } });

      if (prorationAmount > 0) {
        const added = toCount - fromCount;
        const usage = await tx.meteredUsage.create({
          data: {
            retainerId: retainer.id,
            description: `Prorated: +${added} mailbox${added === 1 ? '' : 'es'} on ${sub.domain.domain} (${Math.round(fraction * 100)}% of the cycle)`,
            quantity: 1,
            unitPrice: prorationAmount,
            status: 'PENDING',
          },
        });
        meteredUsageId = usage.id;
      }
      await addRetainerEvent(tx, {
        workspaceId, retainerId: retainer.id, type: 'EDITED', actorUserId: args.actorUserId ?? null,
        message: `Email hosting mailboxes ${fromCount} -> ${toCount} (${sub.domain.domain})`,
        metadata: { source: `email_hosting_${source.toLowerCase()}`, fromCount, toCount, prorationAmount },
      });
    }
    await tx.mailBillingChange.create({
      data: { workspaceId, subscriptionId: sub.id, source, fromCount, toCount, currency: after.currency, prorationAmount, meteredUsageId, actorUserId: args.actorUserId ?? null },
    });
    return { meteredUsageId };
  });
  if (!outcome) return { changed: false, reason: 'CONFLICT' };

  await resolveMailBillingReviewItems(workspaceId, { subscriptionId: sub.id, types: ['MAILBOX_COUNT_CHANGED'] }, args.actorUserId ?? undefined);
  if (retainer) await afterRetainerChange(workspaceId, 'email_hosting_quantity');
  void logActivity({
    workspaceId, action: 'email_billing.quantity_changed', status: 'SUCCESS',
    actor: { userId: args.actorUserId ?? 'system', email: args.actorUserId ? null : 'system' },
    entity: { type: 'mail_billing_subscription', id: sub.id },
    metadata: { source, fromCount, toCount, prorationAmount, retainerUpdated: Boolean(retainer) },
  });
  return { changed: true, fromCount, toCount, prorationAmount, currency: after.currency, retainerUpdated: Boolean(retainer) && after.billingMode !== 'MANUAL' };
}

export type QuantityDecision =
  | { action: 'NONE' }
  | { action: 'APPLY'; toCount: number }
  | { action: 'REVIEW'; toCount: number };

/** What the daily job should do with one subscription, given today's reading and the cycle's earlier readings. */
export function decideQuantity(args: {
  billingStatus: string; billingMode: string; current: number; autoUpdateQuantity: boolean;
  latest: number; cycleCounts: number[]; settings: Pick<EffectiveMailBillingSettings, 'usageBillingPolicy' | 'autoUpdateRetainerQuantities'>;
}): QuantityDecision {
  if (args.billingStatus === 'CANCELLED' || args.billingMode === 'MANUAL') return { action: 'NONE' };
  const toCount = pickBillableCount(args.settings.usageBillingPolicy, args.latest, args.cycleCounts);
  if (toCount === args.current) return { action: 'NONE' };
  return args.autoUpdateQuantity || args.settings.autoUpdateRetainerQuantities ? { action: 'APPLY', toCount } : { action: 'REVIEW', toCount };
}

/** Evaluates one subscription after a fresh snapshot: applies the change, or queues it for review. */
export async function evaluateSubscriptionQuantity(args: { workspaceId: string; subscriptionId: string; latest: number; now: Date; settings: EffectiveMailBillingSettings }) {
  const { workspaceId, subscriptionId, now, settings } = args;
  const sub = await prisma.mailBillingSubscription.findFirst({
    where: { id: subscriptionId, workspaceId },
    include: { retainer: { select: { nextBillingDate: true, frequency: true } }, domain: { select: { domain: true } } },
  });
  if (!sub) return { action: 'NONE' } as QuantityDecision;

  let cycleCounts: number[] = [];
  if (settings.usageBillingPolicy === 'HIGH_WATER_MARK' && sub.retainer) {
    const since = utcDay(cycleStart(sub.retainer.nextBillingDate, sub.retainer.frequency));
    const rows = await prisma.mailUsageSnapshot.findMany({ where: { subscriptionId, capturedOn: { gte: since } }, select: { billableMailboxCount: true } });
    cycleCounts = rows.map((r) => r.billableMailboxCount);
  }
  const decision = decideQuantity({
    billingStatus: sub.billingStatus, billingMode: sub.billingModeSnapshot, current: sub.billableMailboxCount,
    autoUpdateQuantity: sub.autoUpdateQuantity, latest: args.latest, cycleCounts, settings,
  });
  if (decision.action === 'NONE' && sub.pendingMailboxCount !== null && sub.billingStatus !== 'CANCELLED') {
    // The count went back to what is billed: nothing left to approve.
    await prisma.mailBillingSubscription.update({ where: { id: subscriptionId }, data: { pendingMailboxCount: null } });
    await resolveMailBillingReviewItems(workspaceId, { subscriptionId, types: ['MAILBOX_COUNT_CHANGED'] });
  }
  if (decision.action === 'APPLY') {
    await applyBillableQuantity({ workspaceId, subscriptionId, toCount: decision.toCount, source: 'AUTO', now, settings });
  } else if (decision.action === 'REVIEW') {
    await prisma.mailBillingSubscription.update({ where: { id: subscriptionId }, data: { pendingMailboxCount: decision.toCount } });
    await createMailBillingReviewItem({
      workspaceId, domainId: sub.domainId, subscriptionId, type: 'MAILBOX_COUNT_CHANGED', severity: 'WARNING',
      title: `Mailbox count changed for ${sub.domain.domain}`,
      description: `Billable mailboxes changed from ${sub.billableMailboxCount} to ${decision.toCount}.`,
      suggestedAction: 'Approve the new quantity to update the retainer, or dismiss to keep billing as is.',
      oldValueJson: { mailboxCount: sub.billableMailboxCount }, newValueJson: { mailboxCount: decision.toCount },
    });
  }
  return decision;
}
