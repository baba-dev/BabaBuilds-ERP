/**
 * Phase 5 E+F standalone scheduled report SMTP processor. Never import Next
 * routes or report engine into the minimal worker package. The report renderer
 * is a signed, read-only, localhost HTTP endpoint. PG, not BullMQ, is the
 * authoritative state machine for every recipient and due occurrence.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { prepareSmtp, smtpSend } from './notification-delivery.mjs';

const ID = /^[A-Za-z0-9_-]{8,100}$/;
const KIND = 'scheduled_report_email_v1';
const RENDER_URL = 'http://127.0.0.1:3000/api/internal/erp-report-render';

export function workerReportFlag(env = process.env) {
  const ws = env.ERP_REDIS_REPORT_WORKSPACE_ID?.trim() || '';
  const enabled = env.ERP_REDIS_ENABLED === 'true' &&
    env.ERP_REDIS_JOBS_ENABLED === 'true' &&
    env.ERP_REDIS_JOB_WORKER_ENABLED === 'true' &&
    env.ERP_REDIS_REPORT_EMAIL_ENABLED === 'true' &&
    env.ERP_STAGING_MODE !== '1';
  if (!enabled) return null;
  if (env.ERP_REDIS_EXTERNAL_DELIVERY_SCOPE === 'sitewide' &&
      env.ERP_REDIS_SITEWIDE_DELIVERY_APPROVED === 'true') return 'SITEWIDE';
  return ID.test(ws) ? ws : null;
}

function recipientHash(address) {
  return createHash('sha256').update(
    'erp:delivery:v1:REPORT_EMAIL:' + address.trim().toLowerCase(),
  ).digest('hex');
}

function parseRecipients(raw) {
  const list = String(raw || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length || list.length > 10 ||
      !list.every((s) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s) && s.length <= 320)) return null;
  return [...new Set(list)];
}

async function transition(pool, id, token, status, code, receipt = null) {
  const hashed = receipt ? createHash('sha256').update(String(receipt)).digest('hex') : null;
  await pool.query(
    'UPDATE "ErpJobDelivery" SET "status"=$3,"claimToken"=NULL,' +
    '"leaseExpiresAt"=NULL,"lastErrorCode"=$4,"providerAckHash"=$5,' +
    '"acceptedAt"=CASE WHEN $3=$6 THEN NOW() ELSE "acceptedAt" END,' +
    '"updatedAt"=NOW() WHERE "id"=$1 AND "claimToken"=$2 AND "status"=$7',
    [id, token, status, code, hashed, 'PROVIDER_ACCEPTED', 'CLAIMED'],
  );
}

/**
 * Finalizer can be called repeatedly after crashes. One all-accepted
 * occurrence advances scheduleLastAt; partial or uncertain never does.
 * We intentionally do not change scheduleNextAt: it was advanced atomically
 * when the originating due occurrence was claimed.
 */
export async function finalizeReportOccurrence(pool, workspaceId, occurrenceKey) {
  if (!ID.test(workspaceId) || typeof occurrenceKey !== 'string' ||
      occurrenceKey.length > 180) return;
  const source = await pool.query(
    'SELECT "payloadJson" FROM "ErpJobOutbox" WHERE "workspaceId"=$1 ' +
    'AND "kind"=$2 AND "dedupeKey"=$3 AND "status"=$4',
    [workspaceId, 'scheduled_report_source_v1', occurrenceKey, 'DONE'],
  );
  const data = source.rows[0]?.payloadJson;
  if (data?.schema !== 1 || !ID.test(data.reportViewId || '') ||
      !Number.isInteger(data.expectedRecipients) || data.expectedRecipients < 1 ||
      data.expectedRecipients > 10 || typeof data.scheduledAt !== 'string') return;
  const at = new Date(data.scheduledAt);
  if (!Number.isFinite(at.getTime())) return;
  const summary = await pool.query(
    'SELECT "status",COUNT(*)::int AS "count" FROM "ErpJobDelivery" ' +
    'WHERE "workspaceId"=$1 AND "eventKind"=$2 AND "occurrenceKey"=$3 ' +
    'AND "channel"=$4 GROUP BY "status"',
    [workspaceId, KIND, occurrenceKey, 'REPORT_EMAIL'],
  );
  const totals = Object.fromEntries(summary.rows.map((r) => [r.status, Number(r.count)]));
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total !== data.expectedRecipients) return;
  if (totals.PROVIDER_ACCEPTED === total) {
    await pool.query(
      'UPDATE "ReportView" SET "scheduleLastAt"=$3,"scheduleLastError"=NULL,' +
      '"updatedAt"=NOW() WHERE "id"=$1 AND "workspaceId"=$2 AND "scheduleEnabled"=true ' +
      'AND ("scheduleLastAt" IS NULL OR "scheduleLastAt"<$3)',
      [data.reportViewId, workspaceId, at],
    );
  } else if (totals.UNCERTAIN || totals.FAILED || totals.SUPPRESSED) {
    await pool.query(
      'UPDATE "ReportView" SET "scheduleLastError"=$3,"updatedAt"=NOW() ' +
      'WHERE "id"=$1 AND "workspaceId"=$2 AND "scheduleEnabled"=true ' +
      'AND ("scheduleLastAt" IS NULL OR "scheduleLastAt"<$4)',
      [data.reportViewId, workspaceId,
        totals.UNCERTAIN ? 'REPORT_PROVIDER_UNCERTAIN' : 'REPORT_DELIVERY_INCOMPLETE', at],
    );
  }
}

async function authenticatedRender(delivery, token) {
  const key = process.env.ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('REPORT_RENDER_AUTH_UNAVAILABLE');
  const timestamp = Date.now();
  const signature = createHmac('sha256', Buffer.from(key, 'hex')).update(
    'erp-report-render-v1:' + delivery.id + ':' + token + ':' + timestamp,
  ).digest('hex');
  const response = await fetch(RENDER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-erp-report-signature': signature,
    },
    body: JSON.stringify({ id: delivery.id, claimToken: token, timestamp }),
    signal: AbortSignal.timeout(45_000),
    redirect: 'error',
    cache: 'no-store',
  });
  if (response.status === 409) {
    const error = new Error('REPORT_SOURCE_NO_LONGER_ELIGIBLE');
    error.reportSuppressed = true;
    throw error;
  }
  if (!response.ok || !response.body) throw new Error('REPORT_RENDER_UNAVAILABLE');
  if (Number(response.headers.get('content-length') || 0) > 9_000_000) {
    throw new Error('REPORT_RENDER_LIMIT');
  }
  const reader = response.body.getReader();
  const blocks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 9_000_000) throw new Error('REPORT_RENDER_LIMIT');
      blocks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const result = JSON.parse(Buffer.concat(blocks).toString('utf8'));
  if (result?.schema !== 1 || typeof result.subject !== 'string' ||
      typeof result.html !== 'string' || typeof result.text !== 'string' ||
      result.subject.length > 500 || result.html.length > 150_000 ||
      !Array.isArray(result.attachments) || result.attachments.length < 1 ||
      result.attachments.length > 2) throw new Error('REPORT_RENDER_INVALID');
  let binaryBytes = 0;
  const attachments = result.attachments.map((item) => {
    if (typeof item?.filename !== 'string' ||
        !/^[A-Za-z0-9_.-]{1,150}$/.test(item.filename) ||
        !['text/csv', 'application/pdf'].includes(item.contentType) ||
        typeof item.data !== 'string' || item.data.length > 4_100_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) throw new Error('REPORT_ATTACHMENT_INVALID');
    const content = Buffer.from(item.data, 'base64');
    binaryBytes += content.byteLength;
    if (binaryBytes > 6_000_000) throw new Error('REPORT_ATTACHMENT_LIMIT');
    return { filename: item.filename, contentType: item.contentType, content };
  });
  return { subject: result.subject, html: result.html, text: result.text, attachments };
}

export async function processReportDelivery(pool, id, scope = workerReportFlag()) {
  if (!scope || !ID.test(id)) return;
  const claimed = await pool.query(
    'UPDATE "ErpJobDelivery" SET "status"=$2,"claimToken"=$3,' +
    '"leaseExpiresAt"=NOW()+INTERVAL \'120 seconds\',"attempts"="attempts"+1,' +
    '"updatedAt"=NOW() WHERE "id"=$1 AND "status"=$4 AND "nextAttemptAt"<=NOW() ' +
    'AND ($5::text=$8 OR "workspaceId"=$5) ' +
    'AND "eventKind"=$6 AND "channel"=$7 RETURNING *',
    [id, 'CLAIMED', randomUUID(), 'PENDING', scope, KIND, 'REPORT_EMAIL', 'SITEWIDE'],
  );
  const delivery = claimed.rows[0];
  if (!delivery) return;
  const workspaceId = delivery.workspaceId;
  const token = delivery.claimToken;
  let attempted = false;
  try {
    const source = await pool.query(
      'SELECT "payloadJson" FROM "ErpJobOutbox" WHERE "workspaceId"=$1 ' +
      'AND "kind"=$2 AND "dedupeKey"=$3 AND "status"=$4',
      [workspaceId, 'scheduled_report_source_v1', delivery.occurrenceKey, 'DONE'],
    );
    const data = source.rows[0]?.payloadJson;
    if (data?.schema !== 1 || !ID.test(data.reportViewId || '')) {
      await transition(pool, id, token, 'SUPPRESSED', 'REPORT_SOURCE_MISSING'); return;
    }
    const rs = await pool.query(
      'SELECT "scheduleRecipients","scheduleEnabled" FROM "ReportView" ' +
      'WHERE "id"=$1 AND "workspaceId"=$2',
      [data.reportViewId, workspaceId],
    );
    const recipients = parseRecipients(rs.rows[0]?.scheduleRecipients);
    const address = recipients?.find((r) => recipientHash(r) === delivery.recipientKey);
    if (!rs.rows[0]?.scheduleEnabled || !address) {
      await transition(pool, id, token, 'SUPPRESSED', 'REPORT_RECIPIENT_REVOKED'); return;
    }
    // Render and validate SMTP BEFORE committing the irreversible send marker.
    const [payload, smtp] = await Promise.all([
      authenticatedRender(delivery, token),
      prepareSmtp(pool, delivery),
    ]);
    const marked = await pool.query(
      'UPDATE "ErpJobDelivery" SET "externalAttemptedAt"=NOW(),"updatedAt"=NOW() ' +
      'WHERE "id"=$1 AND "status"=$2 AND "claimToken"=$3 ' +
      'AND "externalAttemptedAt" IS NULL AND "leaseExpiresAt">NOW() RETURNING "id"',
      [id, 'CLAIMED', token],
    );
    if (!marked.rows.length) return;
    attempted = true;
    const receipt = await smtpSend(smtp, delivery, { email: address }, payload);
    await transition(pool, id, token, 'PROVIDER_ACCEPTED', null, receipt);
  } catch (error) {
    if (attempted) {
      await transition(pool, id, token, 'UNCERTAIN', 'PROVIDER_OUTCOME_UNCERTAIN');
    } else if (error?.reportSuppressed) {
      await transition(pool, id, token, 'SUPPRESSED', 'REPORT_SOURCE_CHANGED');
    } else {
      await transition(pool, id, token, 'FAILED', 'REPORT_PRE_SEND_FAILED');
    }
  } finally {
    // Post-ack finalizer is idempotent and is also retried by periodic sweeps.
    await finalizeReportOccurrence(pool, workspaceId, delivery.occurrenceKey)
      .catch(() => console.error('[erp-worker] REPORT_FINALIZE_DEFERRED'));
  }
}

/** Repair a crash between PG provider ack and schedule finalization only.
 * Does NOT replay an external side effect. */
export async function reconcileAcceptedReportSchedules(pool, scope) {
  if (!scope) return;
  const rows = await pool.query(
    'SELECT DISTINCT "workspaceId","occurrenceKey" FROM "ErpJobDelivery" ' +
    'WHERE ($1::text=$4 OR "workspaceId"=$1) ' +
    'AND "eventKind"=$2 AND "status"=$3 AND "createdAt">NOW()-INTERVAL \'7 days\' ' +
    'ORDER BY "workspaceId","occurrenceKey" ASC LIMIT 100',
    [scope, KIND, 'PROVIDER_ACCEPTED', 'SITEWIDE'],
  );
  for (const row of rows.rows) {
    await finalizeReportOccurrence(pool, row.workspaceId, row.occurrenceKey);
  }
}
