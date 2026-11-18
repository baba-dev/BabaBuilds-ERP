import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { logActivity } from '@/lib/security/activity-log';
import { fetchMailBillingInventory } from '../miab-client';
import { MiabApiError, miabWrite } from '../miab/writes';
import { generateMailboxPassword } from './password';
import { loadMailBillingSettings } from '../settings';
import { DOMAIN_PATTERN, LOCAL_PART_PATTERN, SECRET_OPERATIONS, type OperationRequest, type OperationType } from './schemas';

/** Thrown for a request that cannot be accepted (bad target, writes off, guard hit). `status` is the HTTP status to use. */
export class OperationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OperationError';
  }
}

const STALE_RUNNING_MS = 10 * 60_000;
const DEFAULT_DELETE_DELAY_DAYS = 7;
const MAX_ATTEMPTS = 4;
const backoffMs = (attempt: number) => Math.min(60, 2 ** attempt * 2) * 60_000; // 4, 8, 16 min ...

type Secret = { password: string };
export type OperationOutcome = { operation: OperationRow; secret?: Secret };
type OperationRow = Prisma.MailOperationGetPayload<object>;

type Target = {
  server: { id: string; baseUrl: string; encryptedToken: string | null; accessMode: string; status: string; writesEnabled: boolean };
  domain: { id: string; domain: string } | null;
  mailbox: { id: string; email: string; domainId: string; status: string; isAdmin: boolean; suspendedAt: Date | null } | null;
};

const serverSelect = { id: true, baseUrl: true, encryptedToken: true, accessMode: true, status: true, writesEnabled: true } as const;

function assertWritable(server: Target['server']) {
  if (server.accessMode !== 'MANAGED_API') throw new OperationError('This server is not in managed mode.', 409);
  if (!server.writesEnabled) throw new OperationError('Write operations are not enabled for this server.', 409);
  if (server.status === 'DISABLED') throw new OperationError('This server is disabled.', 409);
  if (!server.encryptedToken) throw new OperationError('This server has no admin credential.', 409);
}

/** The module-level switch. Everything that writes to a mail server is off until an admin turns it on in the module settings. */
async function assertManagementAllowed(workspaceId: string) {
  if (!(await loadMailBillingSettings(workspaceId)).allowMailboxManagement) {
    throw new OperationError('Mailbox management is turned off. An admin can turn it on in the Email Hosting settings.', 409);
  }
}

/** Admin address of the credential the ERP uses. Locking or deleting it would cut the ERP off the box. */
function credentialEmail(server: Target['server']): string | null {
  if (!server.encryptedToken) return null;
  try {
    return decrypt(server.encryptedToken).split(':')[0].trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/** A domain the server does not host yet: it is created by its first mailbox. The server must be named, and the name must be a real domain. */
async function resolveNewDomain(workspaceId: string, serverId: string | undefined, host: string, email: string): Promise<Target> {
  if (!serverId) throw new OperationError('Choose the server that should host the new domain.', 400);
  if (!DOMAIN_PATTERN.test(host)) throw new OperationError(`${host} is not a valid domain name.`, 400);
  const server = await prisma.mailBillingServer.findFirst({ where: { id: serverId, workspaceId }, select: serverSelect });
  if (!server) throw new OperationError('Server not found.', 404);
  const clash = await prisma.mailBillingMailbox.findFirst({ where: { workspaceId, serverId, email, status: { not: 'REMOVED' } } });
  if (clash) throw new OperationError('That mailbox already exists.', 409);
  return { server, domain: null, mailbox: null };
}

async function resolveTarget(workspaceId: string, input: OperationRequest): Promise<Target> {
  if (input.type === 'MAILBOX_CREATE') {
    const [local, host] = input.email.split('@');
    if (!LOCAL_PART_PATTERN.test(local)) throw new OperationError('The mailbox name may use letters, digits and . _ + - only.', 400);
    const domains = await prisma.mailBillingDomain.findMany({
      where: { workspaceId, domain: host, status: 'ACTIVE', ...(input.serverId ? { serverId: input.serverId } : {}) },
      include: { server: { select: serverSelect } },
    });
    if (domains.length === 0 && input.newDomain) return resolveNewDomain(workspaceId, input.serverId, host, input.email);
    if (domains.length === 0) throw new OperationError(`${host} is not a synced, active domain. Sync the server first, or add it as a new domain.`, 404);
    if (domains.length > 1) throw new OperationError('This domain exists on several servers; pass serverId.', 409);
    const existing = await prisma.mailBillingMailbox.findFirst({ where: { workspaceId, serverId: domains[0].serverId, email: input.email, status: { not: 'REMOVED' } } });
    if (existing) throw new OperationError('That mailbox already exists.', 409);
    return { server: domains[0].server, domain: { id: domains[0].id, domain: domains[0].domain }, mailbox: null };
  }

  if (input.type === 'ALIAS_ADD' || input.type === 'ALIAS_REMOVE') {
    const domain = await prisma.mailBillingDomain.findFirst({ where: { id: input.domainId, workspaceId, status: 'ACTIVE' }, include: { server: { select: serverSelect } } });
    if (!domain) throw new OperationError('Domain not found.', 404);
    if (input.address.split('@')[1] !== domain.domain) throw new OperationError(`The alias must be on ${domain.domain}.`, 400);
    return { server: domain.server, domain: { id: domain.id, domain: domain.domain }, mailbox: null };
  }

  const mailbox = await prisma.mailBillingMailbox.findFirst({
    where: { id: input.mailboxId, workspaceId },
    include: { server: { select: serverSelect }, domain: { select: { id: true, domain: true } } },
  });
  if (!mailbox || mailbox.status === 'REMOVED') throw new OperationError('Mailbox not found.', 404);
  return {
    server: mailbox.server, domain: mailbox.domain,
    mailbox: { id: mailbox.id, email: mailbox.email, domainId: mailbox.domainId, status: mailbox.status, isAdmin: mailbox.isAdmin, suspendedAt: mailbox.suspendedAt },
  };
}

/** Rules that stop an operation before it is even queued. */
function assertAllowed(input: OperationRequest, target: Target) {
  assertWritable(target.server);
  const mailbox = target.mailbox;
  if (!mailbox) return;
  const protectedAction = ['PASSWORD_RESET', 'MAILBOX_SUSPEND', 'MAILBOX_DELETE'].includes(input.type);
  if (protectedAction && mailbox.isAdmin) throw new OperationError('Admin mailboxes cannot be changed from the ERP. Use Mail-in-a-Box directly.', 409);
  if (protectedAction && mailbox.email === credentialEmail(target.server)) throw new OperationError('This is the account the ERP uses to connect; changing it would cut the ERP off.', 409);
  if (input.type === 'MAILBOX_SUSPEND' && mailbox.suspendedAt) throw new OperationError('The mailbox is already suspended.', 409);
  if (input.type === 'MAILBOX_RESUME' && !mailbox.suspendedAt) throw new OperationError('The mailbox is not suspended.', 409);
  if (input.type === 'MAILBOX_DELETE' && input.confirmEmail !== mailbox.email) throw new OperationError('The confirmation does not match the mailbox address.', 400);
}

/** Stored payload: everything needed to run the operation again, and nothing secret. */
function payloadOf(input: OperationRequest): Prisma.InputJsonValue {
  const { idempotencyKey: _k, serverId: _s, ...rest } = input;
  return rest as Prisma.InputJsonValue;
}

/**
 * Validates, records and (when due) runs an operation. A one-time password, when the operation creates one, is returned
 * in `secret` once and is not stored anywhere.
 */
export async function requestOperation(args: {
  workspaceId: string; userId: string; input: OperationRequest; source?: 'UI' | 'API' | 'BILLING' | 'AI'; now?: Date;
}): Promise<OperationOutcome> {
  const { workspaceId, userId, input } = args;
  const now = args.now ?? new Date();

  if (input.idempotencyKey) {
    const repeated = await prisma.mailOperation.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: input.idempotencyKey } } });
    if (repeated) return { operation: repeated };
  }
  await assertManagementAllowed(workspaceId);
  const target = await resolveTarget(workspaceId, input);
  assertAllowed(input, target);

  // The soft-delete window is enforced here too, so a caller that skipped schema defaults can never delete immediately by accident.
  const delayDays = input.type === 'MAILBOX_DELETE' ? (input.delayDays ?? DEFAULT_DELETE_DELAY_DAYS) : 0;
  const delayed = delayDays > 0;
  const runAfter = delayed ? new Date(now.getTime() + delayDays * 86_400_000) : now;
  const created = await prisma.mailOperation.create({
    data: {
      workspaceId, serverId: target.server.id, domainId: target.domain?.id ?? null, mailboxId: target.mailbox?.id ?? null,
      type: input.type, status: 'PENDING', source: args.source ?? 'UI', idempotencyKey: input.idempotencyKey ?? null,
      payloadJson: payloadOf(input), requestedByUserId: userId, runAfter,
      maxAttempts: SECRET_OPERATIONS.has(input.type) ? 1 : MAX_ATTEMPTS,
    },
  });
  if (delayed && target.mailbox) {
    await prisma.mailBillingMailbox.update({ where: { id: target.mailbox.id }, data: { deleteScheduledFor: runAfter } });
    void audit(created, 'operation_scheduled', { runAfter: runAfter.toISOString() });
    return { operation: created };
  }
  return executeOperation(created.id, { now });
}

function audit(op: Pick<OperationRow, 'id' | 'workspaceId' | 'type' | 'requestedByUserId'>, action: string, extra: Record<string, unknown> = {}) {
  return logActivity({
    workspaceId: op.workspaceId, action: `email_billing.${action}`, status: action.endsWith('failed') ? 'FAILURE' : 'SUCCESS',
    actor: { userId: op.requestedByUserId ?? 'system', email: op.requestedByUserId ? null : 'system' },
    entity: { type: 'mail_operation', id: op.id }, metadata: { type: op.type, ...extra },
  });
}

type Effects = { result: Record<string, unknown>; secret?: Secret; local: (tx: Prisma.TransactionClient) => Promise<void> };

async function perform(op: OperationRow, target: Target, token: string): Promise<Effects> {
  const base = { baseUrl: target.server.baseUrl, token };
  const payload = (op.payloadJson ?? {}) as Record<string, unknown>;
  const mailbox = target.mailbox;

  switch (op.type as OperationType) {
    case 'MAILBOX_CREATE': {
      const email = String(payload.email);
      const password = generateMailboxPassword();
      await miabWrite({ ...base, endpoint: 'userAdd', form: { email, password }, secretFields: ['password'] });
      const quotaMb = payload.quotaMb === undefined ? null : Number(payload.quotaMb);
      if (quotaMb !== null) await miabWrite({ ...base, endpoint: 'userQuota', form: { email, quota: quotaMb === 0 ? '0' : `${quotaMb}M` } });
      const verified = await verifyMailbox(target.server, token, email, true);
      return {
        result: { email, verified }, secret: { password },
        local: async (tx) => {
          // The first mailbox of a new domain creates the domain here too, so it shows up (and can be billed) straight away.
          const domainId = target.domain?.id ?? (await tx.mailBillingDomain.upsert({
            where: { workspaceId_serverId_domain: { workspaceId: op.workspaceId, serverId: op.serverId, domain: email.split('@')[1] } },
            create: { workspaceId: op.workspaceId, serverId: op.serverId, domain: email.split('@')[1], status: 'ACTIVE', mailboxCount: 0 },
            update: { status: 'ACTIVE', archivedAt: null, lastSeenAt: new Date() },
          })).id;
          await tx.mailBillingMailbox.upsert({
            where: { workspaceId_serverId_email: { workspaceId: op.workspaceId, serverId: op.serverId, email } },
            create: { workspaceId: op.workspaceId, serverId: op.serverId, domainId, email, localPart: email.split('@')[0], quotaMb, status: 'ACTIVE', provisionedByOperationId: op.id },
            update: { domainId, quotaMb, status: 'ACTIVE', archivedAt: null, suspendedAt: null, suspendedReason: null, deleteScheduledFor: null, lastSeenAt: new Date() },
          });
          await tx.mailBillingDomain.update({ where: { id: domainId }, data: { mailboxCount: { increment: 1 } } });
          if (!op.domainId) await tx.mailOperation.update({ where: { id: op.id }, data: { domainId } });
        },
      };
    }
    case 'PASSWORD_RESET': {
      const password = generateMailboxPassword();
      await miabWrite({ ...base, endpoint: 'userPassword', form: { email: mailbox!.email, password }, secretFields: ['password'] });
      return { result: { email: mailbox!.email }, secret: { password }, local: async () => {} };
    }
    case 'QUOTA_SET': {
      const quotaMb = Number(payload.quotaMb);
      await miabWrite({ ...base, endpoint: 'userQuota', form: { email: mailbox!.email, quota: quotaMb === 0 ? '0' : `${quotaMb}M` } });
      return { result: { email: mailbox!.email, quotaMb }, local: async (tx) => { await tx.mailBillingMailbox.update({ where: { id: mailbox!.id }, data: { quotaMb } }); } };
    }
    case 'ALIAS_ADD': {
      const address = String(payload.address);
      const answer = await miabWrite({ ...base, endpoint: 'aliasAdd', form: { address, forwards_to: (payload.forwardsTo as string[]).join('\n') } });
      const added = /added/i.test(answer);
      return { result: { address, created: added }, local: async (tx) => { if (added) await tx.mailBillingDomain.update({ where: { id: target.domain!.id }, data: { aliasCount: { increment: 1 } } }); } };
    }
    case 'ALIAS_REMOVE': {
      const address = String(payload.address);
      await miabWrite({ ...base, endpoint: 'aliasRemove', form: { address } });
      return { result: { address }, local: async (tx) => { await tx.mailBillingDomain.updateMany({ where: { id: target.domain!.id, aliasCount: { gt: 0 } }, data: { aliasCount: { decrement: 1 } } }); } };
    }
    case 'MAILBOX_SUSPEND': {
      // Lock the login by setting a random password nobody knows. Mail keeps arriving; resume issues a fresh password.
      await miabWrite({ ...base, endpoint: 'userPassword', form: { email: mailbox!.email, password: generateMailboxPassword(32) }, secretFields: ['password'] });
      const reason = payload.reason ? String(payload.reason) : null;
      return { result: { email: mailbox!.email, locked: true }, local: async (tx) => { await tx.mailBillingMailbox.update({ where: { id: mailbox!.id }, data: { suspendedAt: new Date(), suspendedReason: reason } }); } };
    }
    case 'MAILBOX_RESUME': {
      const password = generateMailboxPassword();
      await miabWrite({ ...base, endpoint: 'userPassword', form: { email: mailbox!.email, password }, secretFields: ['password'] });
      return { result: { email: mailbox!.email }, secret: { password }, local: async (tx) => { await tx.mailBillingMailbox.update({ where: { id: mailbox!.id }, data: { suspendedAt: null, suspendedReason: null } }); } };
    }
    case 'MAILBOX_DELETE': {
      await miabWrite({ ...base, endpoint: 'userRemove', form: { email: mailbox!.email } });
      const verified = await verifyMailbox(target.server, token, mailbox!.email, false);
      return {
        result: { email: mailbox!.email, verified },
        local: async (tx) => {
          await tx.mailBillingMailbox.update({ where: { id: mailbox!.id }, data: { status: 'REMOVED', archivedAt: new Date(), deleteScheduledFor: null } });
          await tx.mailBillingDomain.updateMany({ where: { id: mailbox!.domainId, mailboxCount: { gt: 0 } }, data: { mailboxCount: { decrement: 1 } } });
        },
      };
    }
    default:
      throw new OperationError(`Unsupported operation ${op.type}`, 400);
  }
}

/** Re-reads the box and confirms the mailbox is (or is no longer) listed. Best effort: false means "could not confirm". */
async function verifyMailbox(server: Target['server'], token: string, email: string, shouldExist: boolean): Promise<boolean> {
  try {
    const inventory = await fetchMailBillingInventory({ baseUrl: server.baseUrl, accessMode: 'MANAGED_API', token });
    const found = inventory.domains.some((d) => d.mailboxes.some((m) => m.email === email && m.status !== 'REMOVED'));
    return found === shouldExist;
  } catch {
    return false;
  }
}

const isRetryable = (error: unknown) => error instanceof MiabApiError && (error.status >= 500 || error.status === 429);

/** Runs one due operation exactly once at a time. Safe to call for an operation another worker already claimed. */
export async function executeOperation(operationId: string, opts: { now?: Date } = {}): Promise<OperationOutcome> {
  const now = opts.now ?? new Date();
  const claimed = await prisma.mailOperation.updateMany({
    where: { id: operationId, status: 'PENDING', runAfter: { lte: now } },
    data: { status: 'RUNNING', startedAt: now, attempts: { increment: 1 } },
  });
  const op = await prisma.mailOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (claimed.count === 0) return { operation: op };

  try {
    await assertManagementAllowed(op.workspaceId);
    const target = await resolveTargetForRun(op);
    assertWritable(target.server);
    const token = decrypt(target.server.encryptedToken!);
    const effects = await perform(op, target, token);
    // The box already changed; record that atomically with the local state so a crash here cannot repeat the change.
    const done = await prisma.$transaction(async (tx) => {
      await effects.local(tx);
      return tx.mailOperation.update({ where: { id: op.id }, data: { status: 'SUCCEEDED', finishedAt: new Date(), resultJson: effects.result as Prisma.InputJsonValue, errorMessage: null } });
    });
    void audit(done, 'operation_succeeded', { attempts: done.attempts });
    return { operation: done, secret: effects.secret };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Operation failed';
    const retry = isRetryable(error) && op.attempts < op.maxAttempts;
    const failed = await prisma.mailOperation.update({
      where: { id: op.id },
      data: retry
        ? { status: 'PENDING', errorMessage: message, runAfter: new Date(now.getTime() + backoffMs(op.attempts)) }
        : { status: 'FAILED', finishedAt: new Date(), errorMessage: message },
    });
    // A delete that will not run must not keep showing as scheduled on the mailbox.
    if (!retry && op.type === 'MAILBOX_DELETE' && op.mailboxId) {
      await prisma.mailBillingMailbox.updateMany({ where: { id: op.mailboxId, workspaceId: op.workspaceId }, data: { deleteScheduledFor: null } });
    }
    void audit(failed, retry ? 'operation_retry_scheduled' : 'operation_failed', { attempts: op.attempts, error: message });
    return { operation: failed };
  }
}

async function resolveTargetForRun(op: OperationRow): Promise<Target> {
  const server = await prisma.mailBillingServer.findFirst({ where: { id: op.serverId, workspaceId: op.workspaceId }, select: serverSelect });
  if (!server) throw new OperationError('Server not found.', 404);
  const domain = op.domainId ? await prisma.mailBillingDomain.findFirst({ where: { id: op.domainId, workspaceId: op.workspaceId }, select: { id: true, domain: true } }) : null;
  const mailbox = op.mailboxId
    ? await prisma.mailBillingMailbox.findFirst({ where: { id: op.mailboxId, workspaceId: op.workspaceId }, select: { id: true, email: true, domainId: true, status: true, isAdmin: true, suspendedAt: true } })
    : null;
  if (op.domainId && !domain) throw new OperationError('Domain no longer exists.', 404);
  if (op.mailboxId && (!mailbox || mailbox.status === 'REMOVED')) throw new OperationError('Mailbox no longer exists.', 404);
  return { server, domain, mailbox };
}

export async function cancelOperation(args: { workspaceId: string; operationId: string; userId: string }) {
  const op = await prisma.mailOperation.findFirst({ where: { id: args.operationId, workspaceId: args.workspaceId } });
  if (!op) throw new OperationError('Operation not found.', 404);
  const cancelled = await prisma.mailOperation.updateMany({ where: { id: op.id, status: 'PENDING' }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  if (cancelled.count === 0) throw new OperationError('Only a waiting operation can be cancelled.', 409);
  if (op.type === 'MAILBOX_DELETE' && op.mailboxId) await prisma.mailBillingMailbox.updateMany({ where: { id: op.mailboxId, workspaceId: args.workspaceId }, data: { deleteScheduledFor: null } });
  void audit({ ...op, requestedByUserId: args.userId }, 'operation_cancelled');
  return prisma.mailOperation.findUniqueOrThrow({ where: { id: op.id } });
}

/** Puts a failed operation back in the queue. Operations that show a password must be requested again instead. */
export async function retryOperation(args: { workspaceId: string; operationId: string; userId: string }) {
  const op = await prisma.mailOperation.findFirst({ where: { id: args.operationId, workspaceId: args.workspaceId } });
  if (!op) throw new OperationError('Operation not found.', 404);
  if (op.status !== 'FAILED') throw new OperationError('Only a failed operation can be retried.', 409);
  if (SECRET_OPERATIONS.has(op.type as OperationType)) throw new OperationError('This operation creates a one-time password, so request it again instead of retrying.', 409);
  await prisma.mailOperation.update({ where: { id: op.id }, data: { status: 'PENDING', attempts: 0, errorMessage: null, finishedAt: null, runAfter: new Date() } });
  void audit({ ...op, requestedByUserId: args.userId }, 'operation_retried');
  return executeOperation(op.id);
}

/**
 * Cron entry: runs due operations (including scheduled deletes and retries), fails operations a crash left half-claimed,
 * and never runs an operation whose one-time password could no longer be shown.
 */
export async function processDueOperations(now: Date, limit = 25) {
  const stats = { ran: 0, succeeded: 0, failed: 0, interrupted: 0 };
  const stale = await prisma.mailOperation.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - STALE_RUNNING_MS) } },
    data: { status: 'FAILED', finishedAt: now, errorMessage: 'Interrupted before it finished; check the mailbox on the server, then request it again.' },
  });
  stats.interrupted += stale.count;

  const due = await prisma.mailOperation.findMany({ where: { status: 'PENDING', runAfter: { lte: now } }, orderBy: { runAfter: 'asc' }, take: limit });
  for (const op of due) {
    if (SECRET_OPERATIONS.has(op.type as OperationType)) {
      await prisma.mailOperation.updateMany({ where: { id: op.id, status: 'PENDING' }, data: { status: 'FAILED', finishedAt: now, errorMessage: 'Not run: the one-time password could not be shown. Request it again.' } });
      stats.interrupted++;
      continue;
    }
    const outcome = await executeOperation(op.id, { now });
    stats.ran++;
    if (outcome.operation.status === 'SUCCEEDED') stats.succeeded++;
    else if (outcome.operation.status === 'FAILED') stats.failed++;
  }
  return stats;
}
