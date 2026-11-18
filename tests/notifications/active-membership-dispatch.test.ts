import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  memberships: vi.fn(), profile: vi.fn(), inApp: vi.fn(), subs: vi.fn(),
  mail: vi.fn(), push: vi.fn(), template: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceUser: { findMany: m.memberships },
    businessProfile: { findUnique: m.profile },
    inAppNotification: { create: m.inApp },
    pushSubscription: { findMany: m.subs, deleteMany: vi.fn() },
  },
}));
vi.mock('@/lib/jobs/notification-producer', () => ({ recordQueuedNotification: vi.fn() }));
vi.mock('@/lib/mailer', () => ({ sendEmail: m.mail }));
vi.mock('@/lib/notifications/web-push', () => ({ broadcastPush: m.push }));
vi.mock('@/lib/notifications/email-templates', () => ({ buildEmailTemplate: m.template }));
import { dispatchNotification } from '@/lib/notifications/dispatcher';

const user = {
  id: 'activeuser00000001', email: 'user@example.invalid',
  notifyInApp: true, notifyEmail: true, notifyPush: true,
  transactionalAlerts: true, locale: 'en-IN',
};

describe('Phase 5 legacy dispatcher active-membership security boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.profile.mockResolvedValue({ companyName: 'Internal Test', smtpHost: 'smtp.example.invalid' });
    m.template.mockReturnValue({ subject: 'hello', html: '<p>hello</p>', text: 'hello' });
    m.inApp.mockResolvedValue({});
    m.mail.mockResolvedValue({});
    m.push.mockResolvedValue([]);
    m.subs.mockResolvedValue([{ endpoint: 'https://push.example.invalid', p256dh: 'test', auth: 'test' }]);
  });

  it('revalidates active membership for every event and suppresses revoked recipients in all channels', async () => {
    m.memberships.mockImplementation(async ({ where }: { where: { isActive?: boolean } }) =>
      where.isActive === true ? [] : [{ user }]);
    await dispatchNotification({ event: 'CLIENT_ADDED', workspaceId: 'workspace00000001', data: { clientName: 'X' } });
    expect(m.memberships).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace00000001', isActive: true }, include: { user: true },
    });
    expect(m.profile).not.toHaveBeenCalled();
    expect(m.inApp).not.toHaveBeenCalled();
    expect(m.mail).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
  });

  it('preserves opted-in channels for active members and respects explicit user ID scope', async () => {
    m.memberships.mockResolvedValue([{ user }]);
    await dispatchNotification({
      event: 'CLIENT_ADDED', workspaceId: 'workspace00000001',
      data: { clientName: 'X' }, userIds: [user.id],
    });
    expect(m.memberships).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace00000001', isActive: true, userId: { in: [user.id] } },
      include: { user: true },
    });
    expect(m.inApp).toHaveBeenCalledTimes(1);
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect(m.push).toHaveBeenCalledTimes(1);
  });
});
