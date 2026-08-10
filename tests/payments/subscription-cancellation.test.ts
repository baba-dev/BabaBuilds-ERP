import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceFindUnique = vi.fn();
const workspaceUpdate = vi.fn();
const stripeSubscriptionRetrieve = vi.fn();
const stripeSubscriptionUpdate = vi.fn();
const stripeCustomerRetrieve = vi.fn();
const razorpaySubscriptionFetch = vi.fn();
const razorpaySubscriptionCancel = vi.fn();
const logActivity = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: {
      findUnique: workspaceFindUnique,
      update: workspaceUpdate,
    },
  },
}));
vi.mock('@/lib/security/activity-log', () => ({ logActivity }));
vi.mock('stripe', () => ({
  default: class {
    subscriptions = {
      retrieve: stripeSubscriptionRetrieve,
      update: stripeSubscriptionUpdate,
    };
    customers = { retrieve: stripeCustomerRetrieve };
  },
}));
vi.mock('razorpay', () => ({
  default: class {
    subscriptions = {
      fetch: razorpaySubscriptionFetch,
      cancel: razorpaySubscriptionCancel,
    };
  },
}));

const paidWorkspace = {
  id: 'ws_1',
  subscriptionStatus: 'PRO',
  subscriptionEndsAt: new Date('2026-09-10T00:00:00.000Z'),
  billingProvider: 'RAZORPAY',
  billingContractType: 'PREPAID',
  billingProviderId: 'pay_1',
  billingProviderSubscriptionId: null,
  subscriptionCancelAtPeriodEnd: false,
  subscriptionCancelRequestedAt: null,
  subscriptionCancelEffectiveAt: null,
};

describe('workspace subscription cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceFindUnique.mockResolvedValue({ ...paidWorkspace });
    workspaceUpdate.mockResolvedValue({ id: 'ws_1' });
    logActivity.mockResolvedValue('audit_1');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test');
    vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_test');
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret');
  });

  it('schedules prepaid expiry without downgrading paid access immediately', async () => {
    const { scheduleWorkspaceSubscriptionCancellation } = await import(
      '@/lib/billing/subscription-cancellation'
    );

    const result = await scheduleWorkspaceSubscriptionCancellation({
      workspaceId: 'ws_1',
      actorUserId: 'owner_1',
    });

    expect(result.provider).toBe('PREPAID');
    expect(result.effectiveAt).toEqual(paidWorkspace.subscriptionEndsAt);
    expect(stripeSubscriptionUpdate).not.toHaveBeenCalled();
    expect(razorpaySubscriptionCancel).not.toHaveBeenCalled();

    expect(workspaceUpdate).toHaveBeenCalledWith({
      where: { id: 'ws_1' },
      data: expect.objectContaining({
        subscriptionCancelAtPeriodEnd: true,
        subscriptionCancelEffectiveAt: paidWorkspace.subscriptionEndsAt,
        subscriptionCancellationLastError: null,
      }),
    });
    expect(workspaceUpdate.mock.calls[0][0].data.subscriptionStatus).toBeUndefined();
    expect(workspaceUpdate.mock.calls[0][0].data.planTier).toBeUndefined();
  });

  it('fails closed when a Stripe contract does not belong to the workspace', async () => {
    workspaceFindUnique.mockResolvedValue({
      ...paidWorkspace,
      billingProvider: 'STRIPE',
      billingContractType: 'RECURRING',
      billingProviderId: 'cus_expected',
      billingProviderSubscriptionId: 'sub_1',
    });
    stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_other',
      metadata: { workspaceId: 'ws_1' },
      cancel_at_period_end: false,
      cancel_at: null,
      items: { data: [{ current_period_end: 1_787_526_400 }] },
    });

    const {
      scheduleWorkspaceSubscriptionCancellation,
      SubscriptionCancellationError,
    } = await import('@/lib/billing/subscription-cancellation');

    await expect(
      scheduleWorkspaceSubscriptionCancellation({
        workspaceId: 'ws_1',
        actorUserId: 'owner_1',
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_OWNERSHIP_MISMATCH',
    } satisfies Partial<InstanceType<typeof SubscriptionCancellationError>>);

    expect(stripeSubscriptionUpdate).not.toHaveBeenCalled();
    expect(workspaceUpdate).toHaveBeenCalledTimes(1);
    expect(workspaceUpdate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        subscriptionCancellationLastError: expect.any(String),
      }),
    );
    expect(workspaceUpdate.mock.calls[0][0].data.subscriptionStatus).toBeUndefined();
  });

  it('persists a provider-confirmed Stripe period-end date', async () => {
    workspaceFindUnique.mockResolvedValue({
      ...paidWorkspace,
      billingProvider: 'STRIPE',
      billingContractType: 'RECURRING',
      billingProviderId: 'cus_1',
      billingProviderSubscriptionId: 'sub_1',
    });
    stripeSubscriptionRetrieve.mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      metadata: { workspaceId: 'ws_1' },
      cancel_at_period_end: false,
      cancel_at: null,
      items: { data: [{ current_period_end: 1_789_632_000 }] },
    });
    stripeCustomerRetrieve.mockResolvedValue({
      id: 'cus_1',
      deleted: false,
      metadata: { workspaceId: 'ws_1' },
    });
    stripeSubscriptionUpdate.mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      metadata: { workspaceId: 'ws_1' },
      cancel_at_period_end: true,
      cancel_at: 1_789_632_000,
      items: { data: [{ current_period_end: 1_789_632_000 }] },
    });

    const { scheduleWorkspaceSubscriptionCancellation } = await import(
      '@/lib/billing/subscription-cancellation'
    );

    const result = await scheduleWorkspaceSubscriptionCancellation({
      workspaceId: 'ws_1',
      actorUserId: 'owner_1',
    });

    expect(stripeSubscriptionUpdate).toHaveBeenCalledWith('sub_1', {
      cancel_at_period_end: true,
      metadata: { workspaceId: 'ws_1' },
    });
    expect(result.effectiveAt).toEqual(new Date(1_789_632_000 * 1000));
    expect(workspaceUpdate).toHaveBeenCalledWith({
      where: { id: 'ws_1' },
      data: expect.objectContaining({
        subscriptionCancelAtPeriodEnd: true,
        subscriptionCancelEffectiveAt: new Date(1_789_632_000 * 1000),
      }),
    });
  });
});
