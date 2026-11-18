import 'server-only';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { afterRetainerChange } from '@/lib/retainers/save';
import { calculateMailBilling } from './billing-calculator';
import { createMailRetainer } from './lifecycle';
import { resolveMailBillingReviewItems } from './review';
import { loadMailBillingSettings } from './settings';
import { countBillableMailboxes, nextAnniversary, utcDay } from './usage-math';

export class SetupBillingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'SetupBillingError';
  }
}

const MAX_FUTURE_START_DAYS = 365;

export type SetupBillingInput = {
  workspaceId: string;
  userId?: string | null;
  domainId: string;
  planId: string;
  clientId: string;
  /** The day the domain was issued to the customer. Billing repeats on this day. Defaults to when the domain was first seen. */
  startDate?: Date;
  /** Free trial in days from today; billing then starts when it ends. */
  trialDays?: number;
  /** Overrides the computed first billing date (for example to bill the current term now). */
  firstBillingDate?: Date;
  /** Email each invoice to the client. Bulk setup turns this off until recipients are checked. */
  emailInvoices?: boolean;
  now?: Date;
};

export type SetupBillingResult = {
  subscriptionId: string;
  retainerId: string | null;
  status: string;
  startDate: Date;
  firstBillingDate: Date | null;
};

/**
 * Sets up billing for one hosted domain in one transaction: links the client, creates the subscription (pricing snapshotted
 * from the plan) and the recurring retainer. The first invoice date follows the issue date, so every domain is collected
 * on its own anniversary, and the existing retainer job then invoices and chases payment.
 */
export async function setupDomainBilling(input: SetupBillingInput): Promise<SetupBillingResult> {
  const { workspaceId } = input;
  const now = input.now ?? new Date();
  const [domain, plan, client, settings] = await Promise.all([
    prisma.mailBillingDomain.findFirst({ where: { id: input.domainId, workspaceId }, include: { subscriptions: true, mailboxes: { where: { status: 'ACTIVE' }, select: { status: true, isAdmin: true } } } }),
    prisma.mailBillingPlan.findFirst({ where: { id: input.planId, workspaceId, isActive: true } }),
    prisma.client.findFirst({ where: { id: input.clientId, workspaceId, archivedAt: null }, select: { id: true } }),
    loadMailBillingSettings(workspaceId),
  ]);
  if (!domain) throw new SetupBillingError('Domain not found.', 404);
  if (domain.status === 'REMOVED' || domain.status === 'IGNORED') throw new SetupBillingError('This domain is not being served, so it cannot be billed.', 409);
  if (!plan) throw new SetupBillingError('Plan not found or inactive.', 404);
  if (!client) throw new SetupBillingError('Client not found.', 404);
  const existing = domain.subscriptions[0];
  if (existing?.retainerId) throw new SetupBillingError('Billing is already set up for this domain.', 409);

  if (settings.billingModel === 'ACCRUAL') return setupAccrual({ input, now, domain, plan, clientId: client.id });

  const startDate = utcDay(input.startDate ?? domain.discoveredAt);
  if (startDate.getTime() > now.getTime() + MAX_FUTURE_START_DAYS * 86_400_000) throw new SetupBillingError('The start date is too far in the future.', 400);
  const trialDays = Math.max(0, Math.min(365, Math.trunc(input.trialDays ?? 0)));
  const trialEndsAt = trialDays > 0 ? new Date(now.getTime() + trialDays * 86_400_000) : null;

  const billable = countBillableMailboxes(domain.mailboxes, { ignoreAdmins: settings.ignoreAdminMailboxesFromBilling });
  const calc = calculateMailBilling({ plan, subscription: null, syncedMailboxCount: billable, domain: domain.domain });
  const firstBillingDate = trialEndsAt ?? input.firstBillingDate ?? nextAnniversary(startDate, plan.frequency, now);
  const canBill = !calc.reviewRequired;

  const result = await prisma.$transaction(async (tx) => {
    const snapshot = {
      clientId: client.id, planId: plan.id, billingModeSnapshot: calc.billingMode, currencySnapshot: calc.currency, basePriceSnapshot: calc.baseAmount,
      includedMailboxesSnapshot: calc.includedMailboxes, extraMailboxPriceSnapshot: plan.extraMailboxPrice, billableMailboxCount: calc.billableMailboxCount,
      lastSyncedMailboxCount: billable, pendingMailboxCount: null, startedAt: startDate, trialEndsAt,
    };
    const subscription = existing
      ? await tx.mailBillingSubscription.update({ where: { id: existing.id }, data: { ...snapshot, billingStatus: trialEndsAt ? 'TRIALING' : 'REVIEW_REQUIRED', cancelledAt: null } })
      : await tx.mailBillingSubscription.create({ data: { workspaceId, domainId: domain.id, ...snapshot, billingStatus: trialEndsAt ? 'TRIALING' : 'REVIEW_REQUIRED' } });

    let retainerId: string | null = null;
    if (canBill) {
      const retainer = await createMailRetainer(tx, {
        workspaceId, subscription: { id: subscription.id, clientId: client.id, plan, domain }, calc, frequency: plan.frequency,
        nextBillingDate: firstBillingDate, emailInvoice: input.emailInvoices, actorUserId: input.userId ?? null,
      });
      retainerId = retainer.id;
      await tx.mailBillingSubscription.update({ where: { id: subscription.id }, data: { retainerId, billingStatus: trialEndsAt ? 'TRIALING' : 'ACTIVE' } });
    }
    await tx.mailBillingDomain.update({ where: { id: domain.id }, data: { clientId: client.id, retainerId, billingMode: calc.billingMode } });
    return { subscriptionId: subscription.id, retainerId, status: trialEndsAt ? 'TRIALING' : canBill ? 'ACTIVE' : 'REVIEW_REQUIRED' };
  });

  await resolveMailBillingReviewItems(workspaceId, { domainId: domain.id, subscriptionId: result.subscriptionId, types: ['DOMAIN_MISSING_CLIENT', 'DOMAIN_MISSING_SUBSCRIPTION', 'DOMAIN_MISSING_RETAINER', 'NEW_DOMAIN_DISCOVERED'] }, input.userId ?? undefined);
  if (result.retainerId) await afterRetainerChange(workspaceId, 'email_hosting_setup');
  void logActivity({
    workspaceId, action: 'email_billing.billing_setup', status: 'SUCCESS', actor: { userId: input.userId ?? 'system', email: input.userId ? null : 'system' },
    entity: { type: 'mail_billing_domain', id: domain.id },
    metadata: { subscriptionId: result.subscriptionId, retainerId: result.retainerId, planId: plan.id, clientId: client.id, startDate: startDate.toISOString().slice(0, 10), firstBillingDate: canBill ? firstBillingDate.toISOString().slice(0, 10) : null, trialDays },
  });
  return { ...result, startDate, firstBillingDate: canBill ? firstBillingDate : null };
}

type DomainForSetup = { id: string; domain: string; discoveredAt: Date; subscriptions: Array<{ id: string }>; mailboxCount: number };

/**
 * Accrual billing: there is no schedule and no retainer. The subscription records who pays and at what rate; every address is
 * charged per day from the issue date (or from the end of a trial), and a collection turns what has built up into an invoice.
 */
async function setupAccrual(args: {
  input: SetupBillingInput; now: Date; domain: DomainForSetup;
  plan: { id: string; billingMode: string; basePrice: unknown; currency: string; includedMailboxes: number; extraMailboxPrice: unknown };
  clientId: string;
}): Promise<SetupBillingResult> {
  const { input, now, domain, plan, clientId } = args;
  const { workspaceId } = input;
  if (plan.billingMode !== 'PER_MAILBOX') throw new SetupBillingError('Choose a per-mailbox plan: with accrual billing every email address is charged for the days it is in service.', 400);
  const trialDays = Math.max(0, Math.min(365, Math.trunc(input.trialDays ?? 0)));
  // A free trial just moves the first charged day later.
  const chargingStart = trialDays > 0 ? utcDay(new Date(now.getTime() + trialDays * 86_400_000)) : utcDay(input.startDate ?? domain.discoveredAt);
  if (chargingStart.getTime() > now.getTime() + MAX_FUTURE_START_DAYS * 86_400_000) throw new SetupBillingError('The start date is too far in the future.', 400);
  const existing = domain.subscriptions[0];

  const subscriptionId = await prisma.$transaction(async (tx) => {
    const snapshot = {
      clientId, planId: plan.id, billingModeSnapshot: plan.billingMode, currencySnapshot: plan.currency, basePriceSnapshot: plan.basePrice as never,
      includedMailboxesSnapshot: plan.includedMailboxes, extraMailboxPriceSnapshot: plan.extraMailboxPrice as never, billingStatus: 'ACTIVE', startedAt: chargingStart, trialEndsAt: null, cancelledAt: null,
    };
    const subscription = existing
      ? await tx.mailBillingSubscription.update({ where: { id: existing.id }, data: snapshot })
      : await tx.mailBillingSubscription.create({ data: { workspaceId, domainId: domain.id, lastSyncedMailboxCount: domain.mailboxCount, ...snapshot } });
    // Addresses nothing has been collected from yet start being charged on the issue date.
    await tx.mailBillingMailbox.updateMany({ where: { workspaceId, domainId: domain.id, billedThrough: null }, data: { billingStartsOn: chargingStart } });
    await tx.mailBillingDomain.update({ where: { id: domain.id }, data: { clientId, billingMode: plan.billingMode } });
    return subscription.id;
  });

  await resolveMailBillingReviewItems(workspaceId, { domainId: domain.id, subscriptionId, types: ['DOMAIN_MISSING_CLIENT', 'DOMAIN_MISSING_SUBSCRIPTION', 'DOMAIN_MISSING_RETAINER', 'NEW_DOMAIN_DISCOVERED'] }, input.userId ?? undefined);
  void logActivity({
    workspaceId, action: 'email_billing.billing_setup', status: 'SUCCESS', actor: { userId: input.userId ?? 'system', email: input.userId ? null : 'system' },
    entity: { type: 'mail_billing_domain', id: domain.id }, metadata: { subscriptionId, model: 'ACCRUAL', planId: plan.id, clientId, chargingStart: chargingStart.toISOString().slice(0, 10), trialDays },
  });
  return { subscriptionId, retainerId: null, status: 'ACTIVE', startDate: chargingStart, firstBillingDate: null };
}
