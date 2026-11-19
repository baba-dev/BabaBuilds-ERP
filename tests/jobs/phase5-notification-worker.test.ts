import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(), sendPush: vi.fn(), lookup: vi.fn(),
  createTransport: vi.fn(), setVapid: vi.fn(),
}));
vi.mock('nodemailer', () => ({
  default: { createTransport: mocks.createTransport },
}));
vi.mock('web-push', () => ({
  default: { setVapidDetails: mocks.setVapid, sendNotification: mocks.sendPush },
}));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));

import {
  workerNotificationChannels, processNotificationDelivery,
} from '../../ops/erp-worker/notification-delivery.mjs';

const ws = 'cmphase5internal00000001';
const ownerId = 'cmphase5owner000000001';
const subscriptionId = 'cmpushsub00000001';
const recipient = (channel, id) =>
  createHash('sha256').update('erp:delivery:v1:' + channel + ':' +
    (channel === 'EMAIL' ? id.toLowerCase() : id)).digest('hex');
const flags = { workspaceId: ws, email: true, push: true };

function fakeDb(channel = 'EMAIL', eligible = true) {
  const updates = [];
  const delivery = {
    id: 'cmdelivery000001', workspaceId: ws,
    channel, eventKind: channel === 'EMAIL' ? 'notification_email_v1' : 'notification_push_v1',
    recipientKey: recipient(channel, channel === 'EMAIL' ? ownerId : subscriptionId),
    occurrenceKey: 'notification_proposal_viewed_proposal_firstview001',
    claimToken: 'claim-token',
  };
  const pool = { query: vi.fn(async (sql, args = []) => {
    if (sql.startsWith('UPDATE "ErpJobDelivery"')) {
      updates.push(args);
      return sql.includes('RETURNING *') ? { rows: [delivery] } : { rows: [{ id: delivery.id }] };
    }
    if (sql.startsWith('SELECT "subscriptionStatus"')) return { rows: [{ subscriptionStatus: 'ACTIVE' }] };
    if (sql.includes('FROM "ErpJobOutbox"')) return { rows: [{
      createdAt: new Date(),
      payloadJson: {
        schema: 1, email: { subject: 'Viewed', html: '<p>Viewed</p>', text: 'Viewed' },
        push: { title: 'Viewed', body: 'Opened', url: '/proposals' },
      },
    }] };
    if (sql.includes('FROM "WorkspaceUser" wu')) return {
      rows: eligible ? [{ id: ownerId, email: 'owned@example.invalid' }] : [],
    };
    if (sql.includes('FROM "PushSubscription" p')) return {
      rows: eligible ? [{ id: subscriptionId, endpoint: 'https://push.example.invalid/s', p256dh: 'key', auth: 'key' }] : [],
    };
    if (sql.includes('FROM "BusinessProfile"')) return { rows: [{
      smtpHost: 'smtp.example.net', smtpPort: 587, smtpUser: 'owned@example.invalid',
      smtpPassword: 'legacy-test-password', smtpFromEmail: 'owned@example.invalid',
      companyName: 'Phase 5 Test',
    }] };
    if (sql.startsWith('DELETE FROM "PushSubscription"')) return { rows: [] };
    throw new Error('UNEXPECTED_TEST_SQL');
  }) };
  return { pool, updates };
}

describe('Phase 5 C+D worker no-blind-replay contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8' }]);
    mocks.sendMail.mockResolvedValue({ accepted: ['owned@example.invalid'], rejected: [], messageId: 'verified-ack' });
    mocks.sendPush.mockResolvedValue({ statusCode: 201 });
    process.env.VAPID_PUBLIC_KEY = 'test-public';
    process.env.VAPID_PRIVATE_KEY = 'test-private';
  });
  it('keeps both families off when flags or workspace scope are missing', () => {
    expect(workerNotificationChannels().email).toBe(false);
    expect(workerNotificationChannels().push).toBe(false);
  });
  it('suppresses revoked recipients without calling a provider', async () => {
    const { pool, updates } = fakeDb('EMAIL', false);
    await processNotificationDelivery(pool, 'cmdelivery000001', flags);
    expect(updates.some((u) => u[2] === 'SUPPRESSED')).toBe(true);
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });
  it('records the intended SMTP recipient acceptance after exactly one network attempt', async () => {
    const { pool, updates } = fakeDb('EMAIL');
    await processNotificationDelivery(pool, 'cmdelivery000001', flags);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u[2] === 'PROVIDER_ACCEPTED')).toBe(true);
    expect(updates.some((u) => u[2] === 'UNCERTAIN')).toBe(false);
  });
  it('holds uncertain SMTP after an attempted send, never issuing an automatic retry', async () => {
    mocks.sendMail.mockRejectedValue(new Error('SMTP_TIMEOUT_AFTER_DATA'));
    const { pool, updates } = fakeDb('EMAIL');
    await processNotificationDelivery(pool, 'cmdelivery000001', flags);
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u[2] === 'UNCERTAIN')).toBe(true);
    expect(updates.some((u) => u[2] === 'PENDING')).toBe(false);
  });
  it('removes a gone push subscription and suppresses delivery', async () => {
    mocks.sendPush.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    const { pool, updates } = fakeDb('PUSH');
    await processNotificationDelivery(pool, 'cmdelivery000001', flags);
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u[2] === 'SUPPRESSED')).toBe(true);
    expect(pool.query.mock.calls.some((x) => x[0].startsWith('DELETE FROM "PushSubscription"'))).toBe(true);
  });
  it('claims an exact per-kind recipient from a different workspace in sitewide mode', async () => {
    const { pool, updates } = fakeDb('EMAIL');
    await processNotificationDelivery(pool, 'cmdelivery000001', {
      workspaceId: null, sitewide: true, email: true, push: true,
    });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u[2] === 'PROVIDER_ACCEPTED')).toBe(true);
    const claim = pool.query.mock.calls.find((a) => a[0].includes('RETURNING *'));
    expect(claim?.[1]?.[4]).toBeNull();
    expect(claim?.[0]).toContain('eventKind');
  });

});
