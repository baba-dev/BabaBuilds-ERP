/**
 * Phase 5 C+D standalone Node26 SMTP/WebPush executor.
 * PostgreSQL owns idempotency and consent. Redis transports opaque delivery IDs.
 * No Next.js server dependency or customer data in worker logs.
 */
import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import nodemailer from 'nodemailer';
import webpush from 'web-push';

const ID = /^[A-Za-z0-9_-]{8,100}$/;
const KIND = { EMAIL: 'notification_email_v1', PUSH: 'notification_push_v1' };
const yes = (key) => process.env[key] === 'true';

export function workerNotificationChannels() {
  const ws = process.env.ERP_REDIS_NOTIFICATION_WORKSPACE_IDS?.trim() || '';
  const allowed = /^[A-Za-z0-9_-]{8,80}$/.test(ws);
  const base = yes('ERP_REDIS_ENABLED') && yes('ERP_REDIS_JOBS_ENABLED') &&
    yes('ERP_REDIS_JOB_WORKER_ENABLED') && allowed &&
    process.env.ERP_STAGING_MODE !== '1';
  return {
    workspaceId: base ? ws : null,
    email: base && yes('ERP_REDIS_NOTIFICATION_EMAIL_ENABLED'),
    push: base && yes('ERP_REDIS_NOTIFICATION_PUSH_ENABLED'),
  };
}

function keyOf(id, channel) {
  const canonical = channel === 'EMAIL' ? id.toLowerCase() : id;
  return createHash('sha256').update('erp:delivery:v1:' + channel + ':' + canonical).digest('hex');
}

async function transition(pool, id, token, status, code, receipt = null) {
  const digest = receipt ? createHash('sha256').update(String(receipt)).digest('hex') : null;
  await pool.query(
    'UPDATE "ErpJobDelivery" SET "status"=$3,"claimToken"=NULL,"leaseExpiresAt"=NULL,' +
    '"lastErrorCode"=$4,"providerAckHash"=$5,"acceptedAt"=CASE WHEN $3=$6 THEN NOW() ELSE "acceptedAt" END,' +
    '"updatedAt"=NOW() WHERE "id"=$1 AND "status"=$7 AND "claimToken"=$2',
    [id, token, status, code, digest, 'PROVIDER_ACCEPTED', 'CLAIMED'],
  );
}

function decryptPassword(value) {
  if (!/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(value)) {
    // Match existing temporary plaintext legacy SMTP storage behavior.
    return value;
  }
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/i.test(keyHex || '')) throw new Error('SMTP_KEY_MISSING');
  const [iv, tag, data] = value.split(':');
  const dec = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(iv, 'hex'));
  dec.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([dec.update(Buffer.from(data, 'hex')), dec.final()]).toString('utf8');
}

function publicIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const o = address.split('.').map(Number);
  return !(o[0] === 0 || o[0] === 10 || o[0] === 127 ||
    o[0] >= 224 || o[0] === 169 && o[1] === 254 ||
    o[0] === 172 && o[1] >= 16 && o[1] <= 31 ||
    o[0] === 192 && o[1] === 168 ||
    o[0] === 100 && o[1] >= 64 && o[1] <= 127 ||
    o[0] === 198 && o[1] >= 18 && o[1] <= 19 ||
    o[0] === 192 && o[1] === 0 && o[2] === 0 ||
    o[0] === 192 && o[1] === 0 && o[2] === 2 ||
    o[0] === 198 && o[1] === 51 && o[2] === 100 ||
    o[0] === 203 && o[1] === 0 && o[2] === 113);
}

async function safeSmtpAddress(host) {
  if (!host || host.length > 253 || !/^[A-Za-z0-9.-]+$/.test(host) ||
      net.isIP(host) || host === 'localhost' || !host.includes('.')) {
    throw new Error('SMTP_UNSAFE_HOST');
  }
  const entries = await lookup(host, { all: true, family: 4 });
  if (!entries.length || entries.some((row) => !publicIPv4(row.address))) {
    throw new Error('SMTP_UNSAFE_DNS');
  }
  return entries[0].address;
}

async function resolveRecipient(pool, delivery) {
  const { workspaceId, channel, recipientKey } = delivery;
  if (channel === 'EMAIL') {
    const result = await pool.query(
      'SELECT u."id",u."email" FROM "WorkspaceUser" wu ' +
      'JOIN "User" u ON u."id"=wu."userId" ' +
      'WHERE wu."workspaceId"=$1 AND wu."isActive"=true ' +
      'AND u."notifyEmail"=true AND u."transactionalAlerts"=true AND u."email" IS NOT NULL',
      [workspaceId],
    );
    return result.rows.find((r) => keyOf(r.id, 'EMAIL') === recipientKey) || null;
  }
  const result = await pool.query(
    'SELECT p."id",p."endpoint",p."p256dh",p."auth" FROM "PushSubscription" p ' +
    'JOIN "User" u ON u."id"=p."userId" ' +
    'JOIN "WorkspaceUser" wu ON wu."userId"=u."id" ' +
    'WHERE wu."workspaceId"=$1 AND wu."isActive"=true AND u."notifyPush"=true',
    [workspaceId],
  );
  return result.rows.find((r) => keyOf(r.id, 'PUSH') === recipientKey) || null;
}

async function prepareSmtp(pool, delivery) {
  const info = await pool.query(
    'SELECT "smtpHost","smtpPort","smtpUser","smtpPassword","smtpFromEmail","companyName" ' +
    'FROM "BusinessProfile" WHERE "workspaceId"=$1', [delivery.workspaceId],
  );
  const p = info.rows[0];
  if (!p?.smtpHost || !p.smtpUser || !p.smtpPassword) throw new Error('SMTP_NOT_CONFIGURED');
  const host = await safeSmtpAddress(p.smtpHost);
  const port = Number(p.smtpPort || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_BAD_PORT');
  const pass = decryptPassword(p.smtpPassword);
  const fromAddress = p.smtpFromEmail || p.smtpUser;
  if (/[\r\n]/.test(fromAddress)) throw new Error('SMTP_INVALID_SENDER');
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    tls: { servername: p.smtpHost, minVersion: 'TLSv1.2', rejectUnauthorized: true },
    auth: { user: p.smtpUser, pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    pool: false,
  });
  const label = (p.companyName || 'BabaBuilds ERP').replace(/[\r\n"]/g, '').slice(0, 120);
  return { transporter, from: '"' + label + '" <' + fromAddress + '>' };
}

async function smtpSend(smtp, delivery, recipient, payload) {
  const ack = await smtp.transporter.sendMail({
    from: smtp.from,
    to: recipient.email, subject: payload.subject, html: payload.html, text: payload.text,
    messageId: '<' + delivery.id + '@erp.bababuilds.com>',
  });
  const accepted = (ack.accepted || []).some((a) =>
    String(a).trim().toLowerCase() === recipient.email.trim().toLowerCase());
  const rejected = (ack.rejected || []).some((a) =>
    String(a).trim().toLowerCase() === recipient.email.trim().toLowerCase());
  if (!accepted || rejected) throw new Error('SMTP_ACK_UNCERTAIN');
  return ack.messageId || delivery.id;
}

async function validatePublicPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) throw new Error('PUSH_INVALID_ENDPOINT');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('PUSH_INVALID_ENDPOINT'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !host.includes('.') || net.isIP(host) || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'localhost' ||
      (url.port && url.port !== '443')) {
    throw new Error('PUSH_UNSAFE_ENDPOINT');
  }
  const records = await lookup(host, { all: true });
  if (!records.length || records.some((r) =>
    net.isIP(r.address) === 4 ? !publicIPv4(r.address) :
      net.isIP(r.address) !== 6 ||
      /^(::1$|::$|fe[89ab]|f[cd]|::ffff:)/i.test(r.address))) {
    throw new Error('PUSH_UNSAFE_DNS');
  }
}

async function pushSend(recipient, payload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error('PUSH_VAPID_MISSING');
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@bababuilds.com',
    process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY,
  );
  const ack = await webpush.sendNotification({
    endpoint: recipient.endpoint,
    keys: { p256dh: recipient.p256dh, auth: recipient.auth },
  }, JSON.stringify({
    title: payload.title, body: payload.body, url: payload.url,
    tag: payload.tag || 'bababuilds-erp',
    icon: '/icons/launchericon-192x192.png',
    badge: '/icons/launchericon-72x72.png',
  }), { TTL: 86400, urgency: 'normal' });
  if (!ack || ack.statusCode < 200 || ack.statusCode >= 300) throw new Error('PUSH_ACK_UNCERTAIN');
  return 'push-http-' + ack.statusCode;
}

/**
 * At most one irrevocable network attempt per delivery. A crash after CLAIMED
 * or the external-attempt marker never automatically replays it: F must review.
 */
export async function processNotificationDelivery(pool, id, flags = workerNotificationChannels()) {
  if (typeof id !== 'string' || !ID.test(id) || !flags.workspaceId) return;
  const claimed = await pool.query(
    'UPDATE "ErpJobDelivery" SET "status"=$2,"claimToken"=$3,' +
    '"leaseExpiresAt"=NOW()+INTERVAL \'120 seconds\',"attempts"="attempts"+1,' +
    '"updatedAt"=NOW() WHERE "id"=$1 AND "status"=$4 AND "nextAttemptAt"<=NOW() ' +
    'AND "workspaceId"=$5 AND "channel" IN ($6,$7) RETURNING *',
    [id, 'CLAIMED', randomUUID(), 'PENDING', flags.workspaceId,
      flags.email ? 'EMAIL' : '__OFF_EMAIL__', flags.push ? 'PUSH' : '__OFF_PUSH__'],
  );
  const delivery = claimed.rows[0];
  if (!delivery) return;
  const token = delivery.claimToken;
  let attempted = false;
  try {
    if (KIND[delivery.channel] !== delivery.eventKind) {
      await transition(pool, id, token, 'FAILED', 'INVALID_KIND'); return;
    }
    const [ws, source, recipient] = await Promise.all([
      pool.query('SELECT "subscriptionStatus" FROM "Workspace" WHERE "id"=$1',
        [delivery.workspaceId]),
      pool.query(
        'SELECT "payloadJson","createdAt" FROM "ErpJobOutbox" WHERE "workspaceId"=$1 ' +
        'AND "kind"=$2 AND "dedupeKey"=$3 AND "status"=$4 LIMIT 1',
        [delivery.workspaceId, 'notification_delivery_source_v1', delivery.occurrenceKey, 'DONE'],
      ),
      resolveRecipient(pool, delivery),
    ]);
    const payload = source.rows[0]?.payloadJson;
    if (!ws.rows.length || ws.rows[0].subscriptionStatus === 'SUSPENDED' || !recipient ||
        payload?.schema !== 1 || !payload.email || !payload.push) {
      await transition(pool, id, token, 'SUPPRESSED', 'NOTIFICATION_NO_LONGER_ELIGIBLE'); return;
    }
    if (delivery.channel === 'PUSH' &&
        Date.now() - new Date(source.rows[0].createdAt).getTime() > 86_400_000) {
      await transition(pool, id, token, 'SUPPRESSED', 'PUSH_EXPIRED'); return;
    }
    let smtp = null;
    if (delivery.channel === 'EMAIL') {
      const p = payload.email;
      if (typeof p.subject !== 'string' || typeof p.html !== 'string' ||
          typeof p.text !== 'string' || p.html.length > 100_000) {
        await transition(pool, id, token, 'FAILED', 'INVALID_EMAIL_PAYLOAD'); return;
      }
      // DNS, credentials and transport construction are pre-send checks.
      // None may mark a delivery UNCERTAIN unless provider IO has begun.
      smtp = await prepareSmtp(pool, delivery);
    } else {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        await transition(pool, id, token, 'FAILED', 'PUSH_NOT_CONFIGURED'); return;
      }
      // Endpoint checks are a pre-send decision, never an ambiguous provider result.
      await validatePublicPushEndpoint(recipient.endpoint);
    }
    const marked = await pool.query(
      'UPDATE "ErpJobDelivery" SET "externalAttemptedAt"=NOW(),"updatedAt"=NOW() ' +
      'WHERE "id"=$1 AND "status"=$2 AND "claimToken"=$3 ' +
      'AND "externalAttemptedAt" IS NULL AND "leaseExpiresAt">NOW() RETURNING "id"',
      [id, 'CLAIMED', token],
    );
    if (!marked.rows.length) return;
    attempted = true;
    if (delivery.channel === 'EMAIL') {
      const ack = await smtpSend(smtp, delivery, recipient, payload.email);
      await transition(pool, id, token, 'PROVIDER_ACCEPTED', null, ack);
    } else {
      try {
        const ack = await pushSend(recipient, payload.push);
        await transition(pool, id, token, 'PROVIDER_ACCEPTED', null, ack);
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await pool.query('DELETE FROM "PushSubscription" WHERE "id"=$1', [recipient.id]);
          await transition(pool, id, token, 'SUPPRESSED', 'PUSH_GONE');
        } else throw error;
      }
    }
  } catch {
    // Even if DNS/config validation failed before socket I/O, deliberately
    // preserve uncertainty once the attempt marker was committed.
    if (attempted) {
      await transition(pool, id, token, 'UNCERTAIN', 'PROVIDER_OUTCOME_UNCERTAIN');
    } else {
      await transition(pool, id, token, 'FAILED', 'PRE_SEND_FAILURE');
    }
  }
}
