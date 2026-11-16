import 'server-only';

import Razorpay from 'razorpay';
import Stripe from 'stripe';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';

export type BillingProvider = 'RAZORPAY' | 'STRIPE' | 'GOOGLE_PLAY';
export type BillingContractType = 'PREPAID' | 'RECURRING';

type CancellationWorkspace = {
  id: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
  billingProvider: string | null;
  billingContractType: string;
  billingProviderId: string | null;
  billingProviderSubscriptionId: string | null;
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionCancelRequestedAt: Date | null;
  subscriptionCancelEffectiveAt: Date | null;
};

export class SubscriptionCancellationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'SubscriptionCancellationError';
  }
}

function unixDate(value: number | null | undefined): Date | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

function latestStripePeriodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return ends.length > 0 ? unixDate(Math.max(...ends)) : null;
}

async function scheduleStripeCancellation(workspace: CancellationWorkspace): Promise<Date> {
  const secret = process.env.STRIPE_SECRET_KEY;
  const subscriptionId = workspace.billingProviderSubscriptionId;
  if (!secret) {
    throw new SubscriptionCancellationError(
      'Stripe cancellation is temporarily unavailable.',
      'BILLING_PROVIDER_NOT_CONFIGURED',
      503,
    );
  }
  if (!subscriptionId) {
    throw new SubscriptionCancellationError(
      'The Stripe subscription reference is missing. No local downgrade was applied.',
      'PROVIDER_SUBSCRIPTION_ID_MISSING',
      409,
    );
  }

  const stripe = new Stripe(secret, { apiVersion: '2026-03-25.dahlia' });
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  if (!workspace.billingProviderId || customerId !== workspace.billingProviderId) {
    throw new SubscriptionCancellationError(
      'Stripe subscription ownership could not be verified.',
      'PROVIDER_OWNERSHIP_MISMATCH',
      409,
    );
  }

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || customer.metadata.workspaceId !== workspace.id) {
    throw new SubscriptionCancellationError(
      'Stripe customer ownership could not be verified.',
      'PROVIDER_OWNERSHIP_MISMATCH',
      409,
    );
  }
  if (
    subscription.metadata.workspaceId &&
    subscription.metadata.workspaceId !== workspace.id
  ) {
    throw new SubscriptionCancellationError(
      'Stripe subscription ownership could not be verified.',
      'PROVIDER_OWNERSHIP_MISMATCH',
      409,
    );
  }

  const updated = subscription.cancel_at_period_end
    ? subscription
    : await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        metadata: {
          ...subscription.metadata,
          workspaceId: workspace.id,
        },
      });

  const effectiveAt =
    unixDate(updated.cancel_at) ??
    latestStripePeriodEnd(updated) ??
    workspace.subscriptionEndsAt;

  if (!effectiveAt) {
    throw new SubscriptionCancellationError(
      'Stripe did not return a cancellation effective date.',
      'PROVIDER_CANCELLATION_UNCONFIRMED',
      502,
    );
  }
  return effectiveAt;
}

async function scheduleRazorpayCancellation(workspace: CancellationWorkspace): Promise<Date> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const subscriptionId = workspace.billingProviderSubscriptionId;
  if (!keyId || !keySecret) {
    throw new SubscriptionCancellationError(
      'Razorpay cancellation is temporarily unavailable.',
      'BILLING_PROVIDER_NOT_CONFIGURED',
      503,
    );
  }
  if (!subscriptionId) {
    throw new SubscriptionCancellationError(
      'The Razorpay subscription reference is missing. No local downgrade was applied.',
      'PROVIDER_SUBSCRIPTION_ID_MISSING',
      409,
    );
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const subscription = await razorpay.subscriptions.fetch(subscriptionId);
  const notes = (subscription.notes ?? {}) as Record<string, string | number>;

  if (String(notes.workspaceId ?? '') !== workspace.id) {
    throw new SubscriptionCancellationError(
      'Razorpay subscription ownership could not be verified.',
      'PROVIDER_OWNERSHIP_MISMATCH',
      409,
    );
  }
  if (
    workspace.billingProviderId &&
    subscription.customer_id &&
    subscription.customer_id !== workspace.billingProviderId
  ) {
    throw new SubscriptionCancellationError(
      'Razorpay customer ownership could not be verified.',
      'PROVIDER_OWNERSHIP_MISMATCH',
      409,
    );
  }

  const alreadyScheduled =
    subscription.status === 'cancelled' ||
    (subscription.has_scheduled_changes === true &&
      typeof subscription.change_scheduled_at === 'number');

  const updated = alreadyScheduled
    ? subscription
    : await razorpay.subscriptions.cancel(subscriptionId, true);

  const effectiveAt =
    unixDate(updated.current_end) ??
    unixDate(updated.change_scheduled_at) ??
    unixDate(updated.ended_at) ??
    workspace.subscriptionEndsAt;

  if (!effectiveAt) {
    throw new SubscriptionCancellationError(
      'Razorpay did not return a cancellation effective date.',
      'PROVIDER_CANCELLATION_UNCONFIRMED',
      502,
    );
  }
  return effectiveAt;
}

async function scheduleProviderCancellation(workspace: CancellationWorkspace): Promise<{
  provider: BillingProvider | 'PREPAID';
  effectiveAt: Date;
}> {
  const contractType = String(workspace.billingContractType || 'PREPAID').toUpperCase();

  // Existing BabaBuilds checkouts are prepaid Razorpay orders, not renewable
  // provider subscriptions. Cancelling them means allowing paid access to expire.
  if (contractType === 'PREPAID') {
    if (!workspace.subscriptionEndsAt) {
      throw new SubscriptionCancellationError(
        'The prepaid subscription end date is missing.',
        'SUBSCRIPTION_END_DATE_MISSING',
        409,
      );
    }
    return { provider: 'PREPAID', effectiveAt: workspace.subscriptionEndsAt };
  }

  if (contractType !== 'RECURRING') {
    throw new SubscriptionCancellationError(
      'Unknown billing contract type.',
      'BILLING_CONTRACT_INVALID',
      409,
    );
  }

  const provider = String(workspace.billingProvider ?? '').toUpperCase();
  if (provider === 'STRIPE') {
    return { provider, effectiveAt: await scheduleStripeCancellation(workspace) };
  }
  if (provider === 'RAZORPAY') {
    return { provider, effectiveAt: await scheduleRazorpayCancellation(workspace) };
  }
  if (provider === 'GOOGLE_PLAY') {
    // Only the Google account that owns the subscription can cancel it, and Google Play policy
    // requires cancellation to happen in Play. Cancelling "locally" would keep billing the user.
    throw new SubscriptionCancellationError(
      'This subscription is billed by Google Play. Cancel it in Google Play: Play Store > Payments & subscriptions > Subscriptions > BabaBuilds ERP.',
      'MANAGE_IN_GOOGLE_PLAY',
      409,
    );
  }

  throw new SubscriptionCancellationError(
    'The recurring billing provider is missing.',
    'BILLING_PROVIDER_MISSING',
    409,
  );
}

export async function scheduleWorkspaceSubscriptionCancellation(input: {
  workspaceId: string;
  actorUserId: string;
  actorEmail?: string | null;
  request?: Request;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: {
      id: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      billingProvider: true,
      billingContractType: true,
      billingProviderId: true,
      billingProviderSubscriptionId: true,
      subscriptionCancelAtPeriodEnd: true,
      subscriptionCancelRequestedAt: true,
      subscriptionCancelEffectiveAt: true,
    },
  });

  if (!workspace) {
    throw new SubscriptionCancellationError(
      'Workspace not found.',
      'WORKSPACE_NOT_FOUND',
      404,
    );
  }

  if (!['PRO', 'TEAM'].includes(workspace.subscriptionStatus)) {
    throw new SubscriptionCancellationError(
      'No active paid subscription to cancel.',
      'NO_ACTIVE_PAID_SUBSCRIPTION',
      400,
    );
  }

  if (
    workspace.subscriptionCancelAtPeriodEnd &&
    workspace.subscriptionCancelEffectiveAt
  ) {
    return {
      ok: true as const,
      alreadyScheduled: true,
      provider: workspace.billingProvider ?? 'PREPAID',
      effectiveAt: workspace.subscriptionCancelEffectiveAt,
    };
  }

  await logActivity({
    action: 'billing.subscription_cancellation_requested',
    status: 'INFO',
    workspaceId: workspace.id,
    actor: { userId: input.actorUserId, email: input.actorEmail },
    entity: {
      type: 'workspace_subscription',
      id: workspace.billingProviderSubscriptionId,
    },
    metadata: {
      billingProvider: workspace.billingProvider,
      billingContractType: workspace.billingContractType,
      previousStatus: workspace.subscriptionStatus,
    },
    request: input.request,
  });

  try {
    const result = await scheduleProviderCancellation(workspace);
    const requestedAt = new Date();

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        subscriptionCancelAtPeriodEnd: true,
        subscriptionCancelRequestedAt: requestedAt,
        subscriptionCancelEffectiveAt: result.effectiveAt,
        subscriptionCancellationLastError: null,
      },
    });

    await logActivity({
      action: 'billing.subscription_cancellation_scheduled',
      status: 'SUCCESS',
      workspaceId: workspace.id,
      actor: { userId: input.actorUserId, email: input.actorEmail },
      entity: {
        type: 'workspace_subscription',
        id: workspace.billingProviderSubscriptionId,
      },
      metadata: {
        billingProvider: result.provider,
        previousStatus: workspace.subscriptionStatus,
        newStatus: workspace.subscriptionStatus,
        effectiveAt: result.effectiveAt.toISOString(),
      },
      request: input.request,
    });

    return {
      ok: true as const,
      alreadyScheduled: false,
      provider: result.provider,
      effectiveAt: result.effectiveAt,
    };
  } catch (error) {
    const message =
      error instanceof SubscriptionCancellationError
        ? error.message
        : 'The billing provider did not confirm cancellation. No local downgrade was applied.';

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        subscriptionCancellationLastError: message.slice(0, 500),
      },
    });

    await logActivity({
      action: 'billing.subscription_cancellation_failed',
      status: 'FAILURE',
      workspaceId: workspace.id,
      actor: { userId: input.actorUserId, email: input.actorEmail },
      entity: {
        type: 'workspace_subscription',
        id: workspace.billingProviderSubscriptionId,
      },
      metadata: {
        billingProvider: workspace.billingProvider,
        billingContractType: workspace.billingContractType,
        previousStatus: workspace.subscriptionStatus,
        newStatus: workspace.subscriptionStatus,
        errorCode:
          error instanceof SubscriptionCancellationError
            ? error.code
            : 'PROVIDER_CANCELLATION_FAILED',
      },
      request: input.request,
    });

    if (error instanceof SubscriptionCancellationError) throw error;
    throw new SubscriptionCancellationError(
      message,
      'PROVIDER_CANCELLATION_FAILED',
      502,
    );
  }
}

