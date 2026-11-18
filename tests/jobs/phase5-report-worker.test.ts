import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const m = vi.hoisted(() => ({
  prepare: vi.fn(), send: vi.fn(), fetch: vi.fn(),
}));
vi.mock('../../ops/erp-worker/notification-delivery.mjs', () => ({
  prepareSmtp: m.prepare, smtpSend: m.send,
}));
import {
  processReportDelivery, workerReportFlag, finalizeReportOccurrence,
} from '../../ops/erp-worker/report-delivery.mjs';

const ws = 'cmphase5reportinternal001';
const email = 'owned@example.invalid';
const recipientKey = createHash('sha256').update('erp:delivery:v1:REPORT_EMAIL:' + email).digest('hex');
const id = 'cmdeliveryreport0001';
const occ = 'report_cmreportview00001_due_20261118T063000000Z';
const source = {
  schema: 1, reportViewId: 'cmreportview00001',
  scheduledAt: '2026-11-18T06:30:00.000Z',
  expectedRecipients: 1,
};
const claim = {
  id, claimToken: '2f58fded-92a2-4a71-89ce-a1216cf0c59f',
  workspaceId: ws, eventKind: 'scheduled_report_email_v1',
  channel: 'REPORT_EMAIL', recipientKey, occurrenceKey: occ,
};

function db(recipient = email) {
  const statements: Array<{ sql: string; args: unknown[] }> = [];
  const pool = { query: vi.fn(async (sql: string, args: unknown[] = []) => {
    statements.push({ sql, args });
    if (sql.startsWith('UPDATE "ErpJobDelivery"')) {
      return { rows: sql.includes('RETURNING *') ? [claim] :
        sql.includes('RETURNING "id"') ? [{ id }] : [] };
    }
    if (sql.includes('FROM "ErpJobOutbox"')) return { rows: [{ payloadJson: source }] };
    if (sql.includes('FROM "ReportView"')) return {
      rows: [{ scheduleEnabled: true, scheduleRecipients: recipient }],
    };
    if (sql.includes('FROM "ErpJobDelivery"')) return {
      rows: [{ status: 'PROVIDER_ACCEPTED', count: 1 }],
    };
    if (sql.startsWith('UPDATE "ReportView"')) return { rows: [] };
    throw new Error('UNEXPECTED_QUERY');
  }) };
  return { pool, statements };
}

const payload = {
  schema: 1, subject: 'Monthly snapshot', html: '<p>report</p>', text: 'report',
  attachments: [{
    filename: 'pnl-2026-11-18.csv', contentType: 'text/csv',
    data: Buffer.from('hello csv').toString('base64'),
  }],
};

describe('Phase 5 E signed report worker delivery and ack recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ENCRYPTION_KEY = 'f'.repeat(64);
    m.fetch.mockResolvedValue(new Response(JSON.stringify(payload),
      { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', m.fetch);
    m.prepare.mockResolvedValue({ transporter: {} });
    m.send.mockResolvedValue('provider-message-receipt');
  });

  it('does not enable a report worker with missing or wildcard workspace', () => {
    expect(workerReportFlag({
      ERP_REDIS_ENABLED: 'true', ERP_REDIS_JOBS_ENABLED: 'true',
      ERP_REDIS_JOB_WORKER_ENABLED: 'true', ERP_REDIS_REPORT_EMAIL_ENABLED: 'true',
      ERP_REDIS_REPORT_WORKSPACE_ID: '*',
    })).toBeNull();
  });

  it('sends a single report and updates schedule only after acknowledgement', async () => {
    const { pool, statements } = db();
    await processReportDelivery(pool, id, ws);
    expect(m.fetch).toHaveBeenCalledOnce();
    expect(m.send).toHaveBeenCalledOnce();
    expect(m.send.mock.calls[0][2]).toEqual({ email });
    expect(statements.some((r) => r.sql.includes('"externalAttemptedAt"=NOW()'))).toBe(true);
    expect(statements.some((r) => r.args[2] === 'PROVIDER_ACCEPTED')).toBe(true);
    expect(statements.some((r) => r.sql.startsWith('UPDATE "ReportView"') &&
      r.sql.includes('"scheduleLastAt"'))).toBe(true);
  });

  it('suppresses a recipient removed after enqueue without SMTP', async () => {
    const { pool, statements } = db('other@example.invalid');
    await processReportDelivery(pool, id, ws);
    expect(m.fetch).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
    expect(statements.some((r) => r.args[2] === 'SUPPRESSED')).toBe(true);
  });

  it('holds uncertain provider outcome instead of automatically retrying', async () => {
    m.send.mockRejectedValue(new Error('connection closed after SMTP DATA'));
    const { pool, statements } = db();
    await processReportDelivery(pool, id, ws);
    expect(m.send).toHaveBeenCalledOnce();
    expect(statements.some((r) => r.args[2] === 'UNCERTAIN')).toBe(true);
    expect(statements.some((r) => r.args[2] === 'PENDING')).toBe(false);
  });

  it('suppresses a revoked creator or changed schedule before any network send', async () => {
    m.fetch.mockResolvedValue(new Response(JSON.stringify({ code: 'REPORT_SOURCE_CHANGED' }), { status: 409 }));
    const { pool, statements } = db();
    await processReportDelivery(pool, id, ws);
    expect(m.send).not.toHaveBeenCalled();
    expect(statements.some((r) => r.args[2] === 'SUPPRESSED')).toBe(true);
  });

  it('finalization is guarded by total accepted recipient count', async () => {
    const { pool, statements } = db();
    await finalizeReportOccurrence(pool, ws, occ);
    expect(statements.some((r) => r.sql.startsWith('UPDATE "ReportView"'))).toBe(true);
  });
});
