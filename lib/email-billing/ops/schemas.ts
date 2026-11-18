import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
const id = z.string().trim().min(1).max(191);
const quotaMb = z.coerce.number().int().min(0).max(10_000_000);
const common = { serverId: id.optional(), idempotencyKey: z.string().trim().min(8).max(100).optional() };

export const OPERATION_TYPES = [
  'MAILBOX_CREATE', 'PASSWORD_RESET', 'QUOTA_SET', 'ALIAS_ADD', 'ALIAS_REMOVE', 'MAILBOX_SUSPEND', 'MAILBOX_RESUME', 'MAILBOX_DELETE',
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const operationRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MAILBOX_CREATE'), ...common, email, quotaMb: quotaMb.optional(),
    /** Adds a domain the server does not host yet by creating its first mailbox. Needs serverId and the server-admin permission. */
    newDomain: z.boolean().optional(),
  }),
  z.object({ type: z.literal('PASSWORD_RESET'), ...common, mailboxId: id }),
  z.object({ type: z.literal('QUOTA_SET'), ...common, mailboxId: id, quotaMb }),
  z.object({ type: z.literal('ALIAS_ADD'), ...common, domainId: id, address: email, forwardsTo: z.array(email).min(1).max(20) }),
  z.object({ type: z.literal('ALIAS_REMOVE'), ...common, domainId: id, address: email }),
  z.object({ type: z.literal('MAILBOX_SUSPEND'), ...common, mailboxId: id, reason: z.string().trim().max(200).optional() }),
  z.object({ type: z.literal('MAILBOX_RESUME'), ...common, mailboxId: id }),
  z.object({
    type: z.literal('MAILBOX_DELETE'), ...common, mailboxId: id,
    /** Must equal the mailbox address, so a delete is never a stray click. */
    confirmEmail: email,
    /** Soft-delete window in days (0 = immediately). Cancellable until it runs. */
    delayDays: z.coerce.number().int().min(0).max(30).default(7),
  }),
]);
export type OperationRequest = z.infer<typeof operationRequestSchema>;

/** Operations that hand a one-time password back to the caller. The password is never stored, so these cannot be retried by a job. */
export const SECRET_OPERATIONS: ReadonlySet<OperationType> = new Set(['MAILBOX_CREATE', 'PASSWORD_RESET', 'MAILBOX_RESUME']);

/** Destructive operations need the stronger server-admin permission instead of the day-to-day operate permission. */
export const ADMIN_OPERATIONS: ReadonlySet<OperationType> = new Set(['MAILBOX_DELETE']);

/** A public domain name: dot-separated labels, a letter-only top level of 2+ characters, 253 characters at most. */
export const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Operations that must be requested with the server-admin permission, given the request itself. */
export function requiresAdmin(input: OperationRequest): boolean {
  return ADMIN_OPERATIONS.has(input.type) || (input.type === 'MAILBOX_CREATE' && input.newDomain === true);
}

/** Mail-in-a-Box mailbox local part: conservative subset that every mail system accepts. */
export const LOCAL_PART_PATTERN = /^[a-z0-9]([a-z0-9._+-]{0,62}[a-z0-9])?$/;
