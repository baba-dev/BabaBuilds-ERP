import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(), deliveryUpsert: vi.fn(), subs: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    erpJobOutbox: { upsert: mocks.upsert },
    erpJobDelivery: { upsert: mocks.deliveryUpsert },
    pushSubscription: { findMany: mocks.subs },
    $transaction: mocks.transaction,
  },
}));
import { recordQueuedNotification } from '@/lib/jobs/notification-producer';

const workspaceId = 'cmphase5internal00000001';
const user = {
  id: 'cmphase5owner000000001',
  email: 'owner@example.invalid',
  notifyEmail: true, transactionalAlerts: true, notifyPush: true,
};
const input = {
  workspaceId, event: 'PROPOSAL_VIEWED' as const,
  occurrenceKey: 'proposal_abcde00001_first_view',
  users: [{ user }],
  route: { email: true, push: true },
  email: { subject: 'Viewed', html: '<p>Viewed</p>', text: 'Viewed' },
  push: { title: 'Viewed', body: 'A proposal was viewed', url: '/proposals' },
};

describe('Phase 5 C+D atomic nonfinancial delivery producer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ erpJobOutbox: { upsert: mocks.upsert }, erpJobDelivery: { upsert: mocks.deliveryUpsert } }));
    mocks.subs.mockResolvedValue([{ id: 'cmpushsub00000001', userId: user.id }]);
    mocks.upsert.mockImplementation(async ({ create }: { create: { id: string } }) => ({ id: create.id }));
    mocks.deliveryUpsert.mockResolvedValue({ id: 'cmdelivery000000001' });
  });

  it('persists one source and one intent per channel in the SAME transaction', async () => {
    expect(await recordQueuedNotification(input)).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.deliveryUpsert).toHaveBeenCalledTimes(2);
    const parent = mocks.upsert.mock.calls[0][0];
    expect(parent.create.kind).toBe('notification_delivery_source_v1');
    expect(parent.create.status).toBe('DONE');
    expect(parent.create.payloadJson).toHaveProperty('schema', 1);
    const serialized = JSON.stringify(parent.create.payloadJson);
    expect(serialized).not.toContain(user.email);
    expect(serialized).not.toContain('cmpushsub00000001');
    const records = mocks.deliveryUpsert.mock.calls.map((v) => v[0].create);
    expect(records.map((v) => v.channel).sort()).toEqual(['EMAIL', 'PUSH']);
    expect(records.every((v) => /^[0-9a-f]{64}$/.test(v.recipientKey))).toBe(true);
  });

  it('does not add new recipients on duplicate committed source occurrence', async () => {
    mocks.upsert.mockResolvedValueOnce({ id: 'existing-source-id' });
    expect(await recordQueuedNotification(input)).toBe(false);
    expect(mocks.deliveryUpsert).not.toHaveBeenCalled();
  });

  it('respects separate channel preferences and never writes to Redis', async () => {
    await recordQueuedNotification({
      ...input, route: { email: true, push: false },
      users: [{ user: { ...user, notifyEmail: false } }],
    });
    expect(mocks.subs).not.toHaveBeenCalled();
    expect(mocks.deliveryUpsert).not.toHaveBeenCalled();
  });

  it('refuses to queue arbitrarily large source payloads', async () => {
    await expect(recordQueuedNotification({
      ...input, email: { ...input.email, html: 'x'.repeat(100001) },
    })).rejects.toThrow('NOTIFICATION_SOURCE_LIMIT_EXCEEDED');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
