import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  updateMany: vi.fn(), source: vi.fn(), delivery: vi.fn(), transaction: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: m.transaction },
}));

import {
  enqueueDueScheduledReport, reportRecipientKey, reportSourceFingerprint,
} from '@/lib/jobs/report-producer';

const workspaceId = 'cmphase5reportinternal001';
const due = new Date('2026-11-18T06:30:00.000Z');
const next = new Date('2026-11-25T06:30:00.000Z');
const view = {
  id: 'cmreportview00001', workspaceId, reportId: 'pnl',
  name: 'Profit and loss', createdByUserId: 'cmreportcreator0001',
  paramsJson: { period: 'this_month' },
  scheduleFrequency: 'WEEKLY', scheduleRecipients: 'a@example.invalid, b@example.invalid',
  scheduleEnabled: true, scheduleFormat: 'CSV',
  scheduleNextAt: due, scheduleHour: 7, scheduleTz: 'Asia/Kolkata',
  updatedAt: new Date('2026-11-17T06:30:00.000Z'),
};

describe('Phase 5 E transactional report producer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.transaction.mockImplementation((fn: (client: unknown) => unknown) =>
      fn({ reportView: { updateMany: m.updateMany },
        erpJobOutbox: { upsert: m.source }, erpJobDelivery: { upsert: m.delivery } }));
    m.updateMany.mockResolvedValue({ count: 1 });
    m.source.mockImplementation(async ({ create }: { create: { id: string } }) =>
      ({ id: create.id }));
    m.delivery.mockResolvedValue({ id: 'cmdelivery0000001' });
  });

  it('claims schedule and atomically stores source and hashed recipients', async () => {
    expect(await enqueueDueScheduledReport(view, next)).toBe('ENQUEUED');
    expect(m.transaction).toHaveBeenCalledOnce();
    const update = m.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      id: view.id, workspaceId, scheduleEnabled: true, scheduleNextAt: due,
      updatedAt: view.updatedAt,
    });
    expect(update.data).toHaveProperty('scheduleNextAt', next);
    expect(update.data).not.toHaveProperty('scheduleLastAt');
    const created = m.source.mock.calls[0][0].create;
    expect(created.kind).toBe('scheduled_report_source_v1');
    expect(created.payloadJson.scheduledAt).toBe(due.toISOString());
    expect(JSON.stringify(created)).not.toContain('a@example.invalid');
    expect(m.delivery).toHaveBeenCalledTimes(2);
    expect(m.delivery.mock.calls.map((c) => c[0].create.channel)).toEqual(['REPORT_EMAIL', 'REPORT_EMAIL']);
    expect(m.delivery.mock.calls[0][0].create.recipientKey).toBe(reportRecipientKey('a@example.invalid'));
  });

  it('losing the CAS race prevents all outbox/ledger writes', async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    expect(await enqueueDueScheduledReport(view, next)).toBe('LOST_RACE');
    expect(m.source).not.toHaveBeenCalled();
    expect(m.delivery).not.toHaveBeenCalled();
  });

  it('invalid recipients advance only scheduleNextAt with error, without external deliveries', async () => {
    expect(await enqueueDueScheduledReport({ ...view, scheduleRecipients: 'invalid' }, next))
      .toBe('INVALID_RECIPIENTS');
    expect(m.updateMany.mock.calls[0][0].data.scheduleLastError).toBe('INVALID_REPORT_RECIPIENTS');
    expect(m.source).not.toHaveBeenCalled();
    expect(m.delivery).not.toHaveBeenCalled();
  });

  it('computes stable schedule fingerprints without returning recipient addresses', () => {
    expect(reportSourceFingerprint(view)).toBe(reportSourceFingerprint({
      ...view, scheduleRecipients: 'B@example.invalid, A@example.invalid',
    }));
    expect(reportSourceFingerprint(view)).toMatch(/^[a-f0-9]{64}$/);
  });
});
