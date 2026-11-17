#!/usr/bin/env node
/**
 * ERP Phase 4: isolated BullMQ worker and PostgreSQL outbox reconciler.
 * Run ONLY through a separately approved ERP worker systemd unit.
 * Never import web request Redis clients or Next.js route handlers here.
 */
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import pg from 'pg';
import { Queue, Worker } from 'bullmq';

const KIND = 'inapp_task_deadline_v1';
const QUEUE_NAME = 'internal-inapp';
const MAX_BATCH = 100;
const POLL_MS = 10_000;

function fail(message) {
  console.error('[erp-worker] ' + message);
  process.exitCode = 1;
  throw new Error(message);
}

const yes = (key) => process.env[key]?.trim().toLowerCase() === 'true';

if (!yes('ERP_REDIS_ENABLED') || !yes('ERP_REDIS_JOBS_ENABLED') ||
    !yes('ERP_REDIS_JOB_WORKER_ENABLED')) {
  fail('WORKER_DISABLED');
}
if (!process.env.DATABASE_URL) fail('DATABASE_NOT_CONFIGURED');
const namespace = process.env.ERP_REDIS_NAMESPACE || 'erp:production:v1';
if (!/^erp:[a-z0-9][a-z0-9._:-]{2,60}$/.test(namespace)) fail('INVALID_NAMESPACE');

let endpoint;
try { endpoint = new URL(process.env.ERP_REDIS_JOB_URL || ''); }
catch { fail('INVALID_JOB_ENDPOINT'); }
if (endpoint.protocol !== 'redis:' || endpoint.hostname !== '127.0.0.1' ||
    endpoint.port !== '6387' || endpoint.username !== 'erp_jobs' ||
    !endpoint.password || !['', '/', '/0'].includes(endpoint.pathname) ||
    endpoint.search || endpoint.hash) fail('UNSAFE_JOB_ENDPOINT');

const connection = {
  host: '127.0.0.1', port: 6387, username: 'erp_jobs',
  password: decodeURIComponent(endpoint.password),
  maxRetriesPerRequest: null,
  connectTimeout: 5000,
};
const prefix = namespace + ':jobs';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 15000,
  application_name: 'bababuilds-erp-worker',
});
pool.on('error', () => console.error('[erp-worker] POSTGRES_IDLE_ERROR'));

const queue = new Queue(QUEUE_NAME, {
  connection, prefix,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: false,
  },
});
queue.on('error', () => console.error('[erp-worker] REDIS_QUEUE_ERROR'));

function dueDateLabel(value) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value));
}

async function deliverDeadline(outboxId) {
  if (typeof outboxId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(outboxId)) {
    throw new Error('INVALID_JOB_ID');
  }
  const conn = await pool.connect();
  let inTransaction = false;
  try {
    await conn.query('BEGIN');
    inTransaction = true;
    const event = await conn.query(
      'SELECT "id", "workspaceId", "kind", "payloadJson", "status" FROM "ErpJobOutbox" WHERE "id"=$1 FOR UPDATE',
      [outboxId],
    );
    const row = event.rows[0];
    if (!row || row.status === 'DONE') {
      await conn.query('COMMIT');
      inTransaction = false;
      return;
    }
    if (row.kind !== KIND || row.status === 'FAILED' ||
        !row.payloadJson || typeof row.payloadJson.taskId !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,80}$/.test(row.payloadJson.taskId)) {
      throw new Error('INVALID_OUTBOX_STATE');
    }
    const [ws, task] = await Promise.all([
      conn.query('SELECT "subscriptionStatus" FROM "Workspace" WHERE "id"=$1', [row.workspaceId]),
      conn.query(
        'SELECT "id", "title", "description", "status", "dueDate" FROM "Task" WHERE "id"=$1 AND "workspaceId"=$2',
        [row.payloadJson.taskId, row.workspaceId],
      ),
    ]);
    const entry = task.rows[0];
    const due = entry?.dueDate ? new Date(entry.dueDate) : null;
    // Revalidate source state and retention. A changed/deleted/completed task or
    // suspended workspace must not create stale user notifications.
    const eligible = ws.rows[0]?.subscriptionStatus !== 'SUSPENDED' &&
      Boolean(ws.rows[0]) && entry && entry.status !== 'DONE' &&
      due && Number.isFinite(due.getTime()) &&
      due.getTime() > Date.now() - 86400_000;

    if (eligible) {
      const recipients = await conn.query(
        'SELECT wu."userId" FROM "WorkspaceUser" wu JOIN "User" u ON u."id"=wu."userId" WHERE wu."workspaceId"=$1 AND wu."isActive"=true AND u."notifyInApp"=true',
        [row.workspaceId],
      );
      // All inserts and DONE marker commit together under the outbox row lock.
      // A replay after COMMIT cannot insert a duplicate for this occurrence.
      for (const rec of recipients.rows) {
        await conn.query(
          'INSERT INTO "InAppNotification" ("id", "userId", "workspaceId", "eventType", "title", "body", "actionUrl", "createdAt", "isRead") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),false)',
          [randomUUID(), rec.userId, row.workspaceId, 'DEADLINE_ALERT',
            ('Deadline: ' + entry.title).slice(0,250), 'Due on ' + dueDateLabel(due),
            '/dashboard'],
        );
      }
    }
    await conn.query(
      'UPDATE "ErpJobOutbox" SET "status"=$2, "processedAt"=NOW(), "lastError"=NULL, "updatedAt"=NOW() WHERE "id"=$1',
      [outboxId, 'DONE'],
    );
    await conn.query('COMMIT');
    inTransaction = false;
  } catch (error) {
    if (inTransaction) await conn.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    conn.release();
  }
}

const worker = new Worker(QUEUE_NAME, async (job) => {
  if (job.name !== KIND || !job.data || Object.keys(job.data).sort().join(',') !== 'outboxId') {
    throw new Error('INVALID_JOB_TYPE');
  }
  try {
    await deliverDeadline(job.data.outboxId);
  } catch {
    // Errors, DB contents and customer data never appear in logs or Redis.
    await pool.query(
      'UPDATE "ErpJobOutbox" SET "attempts"="attempts"+1, "lastError"=$2, "updatedAt"=NOW() WHERE "id"=$1 AND "status"=$3',
      [job.data.outboxId, 'PROCESSING_FAILED', 'PENDING'],
    ).catch(() => undefined);
    throw new Error('PROCESSING_FAILED');
  }
}, {
  connection, prefix, concurrency: 2, lockDuration: 30000,
});
worker.on('error', () => console.error('[erp-worker] WORKER_CONNECTION_ERROR'));
worker.on('failed', (job) => {
  if (!job || !job.data?.outboxId) return;
  if (job.attemptsMade < (job.opts.attempts ?? 5)) return;
  void pool.query(
    'UPDATE "ErpJobOutbox" SET "status"=$2, "lastError"=$3, "updatedAt"=NOW() WHERE "id"=$1 AND "status"=$4',
    [job.data.outboxId, 'FAILED', 'RETRIES_EXHAUSTED', 'PENDING'],
  ).catch(() => console.error('[erp-worker] FAILED_MARKER_ERROR'));
});

let publishing = false;
let stopping = false;
async function publishPending() {
  if (publishing || stopping) return;
  publishing = true;
  try {
    const rows = await pool.query(
      'SELECT "id" FROM "ErpJobOutbox" WHERE "status"=$1 AND "kind"=$2 AND "nextAttemptAt"<=NOW() ORDER BY "nextAttemptAt" ASC LIMIT $3',
      ['PENDING', KIND, MAX_BATCH],
    );
    for (const row of rows.rows) {
      if (stopping) break;
      // BullMQ job ID is the opaque outbox ID. Reconciliation can repeat
      // enqueue safely; outbox DONE is the authoritative idempotency gate.
      await queue.add(KIND, { outboxId: row.id }, { jobId: row.id });
    }
  } catch {
    console.error('[erp-worker] RECONCILE_FAILED');
  } finally {
    publishing = false;
  }
}

async function start() {
  try {
    await pool.query('SELECT "id" FROM "ErpJobOutbox" LIMIT 0');
    await queue.waitUntilReady();
    await worker.waitUntilReady();
  } catch {
    fail('WORKER_STARTUP_PREFLIGHT_FAILED');
  }
  console.log('[erp-worker] READY');
  void publishPending();
}
const tick = setInterval(() => void publishPending(), POLL_MS);
tick.unref();

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(tick);
  console.log('[erp-worker] DRAINING');
  await worker.close().catch(() => undefined);
  await queue.close().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
process.on('unhandledRejection', () => {
  console.error('[erp-worker] UNHANDLED_REJECTION');
  void shutdown();
});
await start();
