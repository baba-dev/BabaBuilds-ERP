import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = vi.hoisted(() => {
  const state = { ops: [] as Array<Record<string, any>>, seq: 0 }; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    state,
    write: vi.fn(),
    gate: vi.fn(),
    inventory: vi.fn(),
    logActivity: vi.fn(),
    mailbox: { findFirst: vi.fn(), findFirstExisting: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    domain: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    server: { findFirst: vi.fn() },
  };
});

vi.mock('@/lib/encryption', () => ({ decrypt: (v: string) => v }));
vi.mock('@/lib/email-billing/settings', () => ({ loadMailBillingSettings: async () => ({ allowMailboxManagement: m.gate() }) }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: m.logActivity }));
vi.mock('@/lib/email-billing/miab-client', () => ({ fetchMailBillingInventory: m.inventory }));
vi.mock('@/lib/email-billing/miab/writes', () => ({
  miabWrite: m.write,
  MiabApiError: class MiabApiError extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
vi.mock('@/lib/prisma', () => {
  const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'lte' in v) return row[k] <= v.lte;
    if (v && typeof v === 'object' && 'lt' in v) return row[k] < v.lt;
    return row[k] === v;
  });
  const apply = (row: Row, data: Row) => { for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === 'object' && 'increment' in v ? (row[k] ?? 0) + v.increment : v; return row; };
  const mailOperation = {
    create: async ({ data }: { data: Row }) => { const r = { id: `op${++m.state.seq}`, attempts: 0, errorMessage: null, resultJson: null, startedAt: null, finishedAt: null, ...data }; m.state.ops.push(r); return { ...r }; },
    findUnique: async ({ where }: { where: Row }) => { const k = where.workspaceId_idempotencyKey; const r = m.state.ops.find((o) => o.workspaceId === k.workspaceId && o.idempotencyKey === k.idempotencyKey); return r ? { ...r } : null; },
    findUniqueOrThrow: async ({ where }: { where: Row }) => { const r = m.state.ops.find((o) => o.id === where.id); if (!r) throw new Error('not found'); return { ...r }; },
    findFirst: async ({ where }: { where: Row }) => { const r = m.state.ops.find((o) => match(o, where)); return r ? { ...r } : null; },
    findMany: async ({ where }: { where: Row }) => m.state.ops.filter((o) => match(o, where)).map((o) => ({ ...o })),
    update: async ({ where, data }: { where: Row; data: Row }) => ({ ...apply(m.state.ops.find((o) => o.id === where.id)!, data) }),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => { const rows = m.state.ops.filter((o) => match(o, where)); rows.forEach((r) => apply(r, data)); return { count: rows.length }; },
  };
  const tx = { mailOperation, mailBillingMailbox: m.mailbox, mailBillingDomain: m.domain };
  return { prisma: { mailOperation, mailBillingMailbox: m.mailbox, mailBillingDomain: m.domain, mailBillingServer: m.server, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { cancelOperation, executeOperation, OperationError, processDueOperations, requestOperation, retryOperation } from '@/lib/email-billing/ops/service';
import { MiabApiError } from '@/lib/email-billing/miab/writes';

const NOW = new Date('2026-11-18T10:00:00.000Z');
const server = (over: Row = {}) => ({ id: 'sv1', baseUrl: 'https://box.example.com', encryptedToken: 'root@box.example.com:pw', accessMode: 'MANAGED_API', status: 'ACTIVE', writesEnabled: true, ...over });
const box = (over: Row = {}) => ({ id: 'mb1', email: 'ann@x.com', domainId: 'd1', status: 'ACTIVE', isAdmin: false, suspendedAt: null, server: server(), domain: { id: 'd1', domain: 'x.com' }, ...over });
const req = (input: Row, over: Row = {}) => requestOperation({ workspaceId: 'w1', userId: 'u1', input: input as never, now: NOW, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.state.ops.length = 0; m.state.seq = 0;
  m.gate.mockReturnValue(true);
  m.write.mockResolvedValue('ok');
  m.inventory.mockResolvedValue({ domains: [{ domain: 'x.com', mailboxes: [{ email: 'new@x.com', status: 'ACTIVE' }] }] });
  m.server.findFirst.mockResolvedValue(server());
  m.domain.findMany.mockResolvedValue([{ id: 'd1', domain: 'x.com', serverId: 'sv1', server: server() }]);
  m.domain.findFirst.mockResolvedValue({ id: 'd1', domain: 'x.com' });
  m.mailbox.findFirst.mockResolvedValue(box());
});

describe('mailbox create', () => {
  const create = { type: 'MAILBOX_CREATE', email: 'new@x.com', quotaMb: 2048 };

  it('creates the mailbox on the box, returns the one-time password once, and keeps it out of everything stored', async () => {
    m.mailbox.findFirst.mockResolvedValueOnce(null); // no existing mailbox
    const { operation, secret } = await req(create);
    expect(operation.status).toBe('SUCCEEDED');
    expect(secret?.password).toBeTruthy();

    const add = m.write.mock.calls.find((c) => c[0].endpoint === 'userAdd')![0];
    expect(add.form).toEqual({ email: 'new@x.com', password: secret!.password });
    expect(add.secretFields).toEqual(['password']);
    expect(m.write.mock.calls.find((c) => c[0].endpoint === 'userQuota')![0].form).toEqual({ email: 'new@x.com', quota: '2048M' });

    // The password appears nowhere in the stored operation, its result, the audit log or the local mailbox row.
    expect(JSON.stringify(m.state.ops)).not.toContain(secret!.password);
    expect(JSON.stringify(m.logActivity.mock.calls)).not.toContain(secret!.password);
    expect(JSON.stringify(m.mailbox.upsert.mock.calls)).not.toContain(secret!.password);
    expect(m.state.ops[0].payloadJson).toEqual({ type: 'MAILBOX_CREATE', email: 'new@x.com', quotaMb: 2048 });
    expect(operation.resultJson).toEqual({ email: 'new@x.com', verified: true });

    expect(m.mailbox.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ email: 'new@x.com', domainId: 'd1', quotaMb: 2048, status: 'ACTIVE' }) }));
    expect(m.domain.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { mailboxCount: { increment: 1 } } });
  });

  it('flags a change it could not confirm instead of failing', async () => {
    m.mailbox.findFirst.mockResolvedValueOnce(null);
    m.inventory.mockRejectedValue(new Error('timeout'));
    const { operation } = await req(create);
    expect(operation.status).toBe('SUCCEEDED');
    expect(operation.resultJson).toMatchObject({ verified: false });
  });

  it('rejects unknown domains, existing mailboxes, bad names and ambiguous servers', async () => {
    m.domain.findMany.mockResolvedValueOnce([]);
    await expect(req(create)).rejects.toMatchObject({ status: 404 });
    m.domain.findMany.mockResolvedValueOnce([{ id: 'd1', domain: 'x.com', serverId: 'sv1', server: server() }, { id: 'd2', domain: 'x.com', serverId: 'sv2', server: server({ id: 'sv2' }) }]);
    await expect(req(create)).rejects.toMatchObject({ status: 409 });
    m.mailbox.findFirst.mockResolvedValueOnce(box());
    await expect(req(create)).rejects.toThrow('already exists');
    await expect(req({ ...create, email: '.bad@x.com' })).rejects.toBeInstanceOf(OperationError);
    expect(m.write).not.toHaveBeenCalled();
  });
});

describe('module setting: allow mailbox management', () => {
  it('refuses every operation while the setting is off, before looking anything up or queueing', async () => {
    m.gate.mockReturnValue(false);
    for (const input of [
      { type: 'MAILBOX_CREATE', email: 'new@x.com' }, { type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 1 },
      { type: 'MAILBOX_SUSPEND', mailboxId: 'mb1' }, { type: 'MAILBOX_DELETE', mailboxId: 'mb1', confirmEmail: 'ann@x.com', delayDays: 0 },
    ]) await expect(req(input)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('turned off') });
    expect(m.write).not.toHaveBeenCalled();
    expect(m.state.ops).toHaveLength(0);
    expect(m.mailbox.findFirst).not.toHaveBeenCalled();
  });

  it('stops a delete scheduled earlier when the setting is switched off, and clears its schedule', async () => {
    const { operation } = await req({ type: 'MAILBOX_DELETE', mailboxId: 'mb1', confirmEmail: 'ann@x.com' });
    expect(operation.status).toBe('PENDING');
    m.gate.mockReturnValue(false);
    const stats = await processDueOperations(new Date(NOW.getTime() + 8 * 86_400_000));
    expect(stats).toMatchObject({ ran: 1, failed: 1 });
    expect(m.state.ops[0]).toMatchObject({ status: 'FAILED', errorMessage: expect.stringContaining('turned off') });
    expect(m.write).not.toHaveBeenCalled();
    expect(m.mailbox.updateMany).toHaveBeenCalledWith({ where: { id: 'mb1', workspaceId: 'w1' }, data: { deleteScheduledFor: null } });
  });
});

describe('adding a new customer domain', () => {
  const add = { type: 'MAILBOX_CREATE', email: 'admin@newcustomer.com', newDomain: true, serverId: 'sv1' };
  beforeEach(() => {
    m.domain.findMany.mockResolvedValue([]);
    m.mailbox.findFirst.mockResolvedValue(null);
    m.domain.findFirst.mockResolvedValue(null);
    m.domain.upsert.mockResolvedValue({ id: 'dnew' });
    m.inventory.mockResolvedValue({ domains: [{ domain: 'newcustomer.com', mailboxes: [{ email: 'admin@newcustomer.com', status: 'ACTIVE' }] }] });
  });

  it('creates the domain by its first mailbox and records both locally, linking the operation to the domain', async () => {
    const { operation, secret } = await req(add);
    expect(operation.status).toBe('SUCCEEDED');
    expect(secret?.password).toBeTruthy();
    expect(m.write.mock.calls[0][0]).toMatchObject({ endpoint: 'userAdd', form: { email: 'admin@newcustomer.com' } });
    expect(m.domain.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ domain: 'newcustomer.com', serverId: 'sv1', status: 'ACTIVE' }) }));
    expect(m.mailbox.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ domainId: 'dnew', email: 'admin@newcustomer.com' }) }));
    expect(m.state.ops[0].domainId).toBe('dnew');
  });

  it('needs a named server and a real domain name, and the server must be in this workspace', async () => {
    await expect(req({ ...add, serverId: undefined })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Choose the server') });
    for (const email of ['a@localhost', 'a@-bad.com', 'a@x..com', 'a@123', 'a@exa mple.com']) await expect(req({ ...add, email })).rejects.toBeInstanceOf(OperationError);
    m.server.findFirst.mockResolvedValueOnce(null);
    await expect(req(add)).rejects.toMatchObject({ status: 404 });
    expect(m.server.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'sv1', workspaceId: 'w1' } }));
    expect(m.write).not.toHaveBeenCalled();
  });

  it('is still refused on a server that is not writable, and while the module switch is off', async () => {
    m.server.findFirst.mockResolvedValueOnce(server({ writesEnabled: false }));
    await expect(req(add)).rejects.toMatchObject({ status: 409 });
    m.gate.mockReturnValue(false);
    await expect(req(add)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('turned off') });
    expect(m.write).not.toHaveBeenCalled();
  });

  it('uses the normal path when the domain already exists, so it is never created twice', async () => {
    m.domain.findMany.mockResolvedValue([{ id: 'd1', domain: 'newcustomer.com', serverId: 'sv1', server: server() }]);
    m.domain.findFirst.mockResolvedValue({ id: 'd1', domain: 'newcustomer.com' });
    await req(add);
    expect(m.domain.upsert).not.toHaveBeenCalled();
    expect(m.mailbox.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ domainId: 'd1' }) }));
  });
});

describe('write safety', () => {
  it.each([
    ['server not in managed mode', { accessMode: 'DIRECT_MIAB_API' }],
    ['writes switched off', { writesEnabled: false }],
    ['server disabled', { status: 'DISABLED' }],
    ['no credential', { encryptedToken: null }],
  ])('refuses everything when %s, without calling the box or queueing anything', async (_name, over) => {
    m.mailbox.findFirst.mockResolvedValue(box({ server: server(over) }));
    await expect(req({ type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 100 })).rejects.toMatchObject({ status: 409 });
    expect(m.write).not.toHaveBeenCalled();
    expect(m.state.ops).toHaveLength(0);
  });

  it('protects admin mailboxes and the account the ERP connects with from reset, suspend and delete', async () => {
    m.mailbox.findFirst.mockResolvedValue(box({ isAdmin: true }));
    for (const type of ['PASSWORD_RESET', 'MAILBOX_SUSPEND']) await expect(req({ type, mailboxId: 'mb1' })).rejects.toThrow('Admin mailboxes');
    await expect(req({ type: 'MAILBOX_DELETE', mailboxId: 'mb1', confirmEmail: 'ann@x.com', delayDays: 0 })).rejects.toThrow('Admin mailboxes');

    m.mailbox.findFirst.mockResolvedValue(box({ email: 'root@box.example.com' }));
    await expect(req({ type: 'MAILBOX_SUSPEND', mailboxId: 'mb1' })).rejects.toThrow('cut the ERP off');
    // Quota changes on those accounts remain allowed.
    expect((await req({ type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 0 })).operation.status).toBe('SUCCEEDED');
    expect(m.write.mock.calls.map((c) => c[0].endpoint)).toEqual(['userQuota']);
  });

  it('only touches mailboxes of the caller\'s workspace', async () => {
    m.mailbox.findFirst.mockResolvedValue(null);
    await expect(req({ type: 'QUOTA_SET', mailboxId: 'other', quotaMb: 1 }, { workspaceId: 'w2' })).rejects.toMatchObject({ status: 404 });
    expect(m.mailbox.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other', workspaceId: 'w2' } }));
  });

  it('repeats nothing for the same idempotency key', async () => {
    const first = await req({ type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 100, idempotencyKey: 'key-12345678' });
    const second = await req({ type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 100, idempotencyKey: 'key-12345678' });
    expect(second.operation.id).toBe(first.operation.id);
    expect(m.write).toHaveBeenCalledTimes(1);
  });
});

describe('suspend and resume (password lock)', () => {
  it('suspends by setting an unknown random password and marks the mailbox, never handing the password out', async () => {
    const { operation, secret } = await req({ type: 'MAILBOX_SUSPEND', mailboxId: 'mb1', reason: 'Unpaid invoice' });
    expect(operation.status).toBe('SUCCEEDED');
    expect(secret).toBeUndefined();
    const call = m.write.mock.calls[0][0];
    expect(call.endpoint).toBe('userPassword');
    expect(call.form.password.length).toBe(32);
    expect(JSON.stringify(m.state.ops)).not.toContain(call.form.password);
    expect(m.mailbox.update).toHaveBeenCalledWith({ where: { id: 'mb1' }, data: expect.objectContaining({ suspendedReason: 'Unpaid invoice', suspendedAt: expect.any(Date) }) });
  });

  it('will not suspend twice or resume a mailbox that is not suspended', async () => {
    m.mailbox.findFirst.mockResolvedValueOnce(box({ suspendedAt: NOW }));
    await expect(req({ type: 'MAILBOX_SUSPEND', mailboxId: 'mb1' })).rejects.toThrow('already suspended');
    await expect(req({ type: 'MAILBOX_RESUME', mailboxId: 'mb1' })).rejects.toThrow('not suspended');
  });

  it('resume issues a fresh one-time password and clears the suspension', async () => {
    m.mailbox.findFirst.mockResolvedValue(box({ suspendedAt: NOW }));
    const { operation, secret } = await req({ type: 'MAILBOX_RESUME', mailboxId: 'mb1' });
    expect(operation.status).toBe('SUCCEEDED');
    expect(secret?.password).toBe(m.write.mock.calls[0][0].form.password);
    expect(m.mailbox.update).toHaveBeenCalledWith({ where: { id: 'mb1' }, data: { suspendedAt: null, suspendedReason: null } });
  });
});

describe('delete with a soft-delete window', () => {
  const del = { type: 'MAILBOX_DELETE', mailboxId: 'mb1', confirmEmail: 'ann@x.com' };

  it('needs the address typed back', async () => {
    await expect(req({ ...del, confirmEmail: 'other@x.com', delayDays: 0 })).rejects.toThrow('confirmation');
    expect(m.write).not.toHaveBeenCalled();
  });

  it('schedules a delete 7 days out by default and does not touch the box yet', async () => {
    const { operation } = await req(del);
    expect(operation.status).toBe('PENDING');
    expect(operation.runAfter).toEqual(new Date('2026-11-25T10:00:00.000Z'));
    expect(m.mailbox.update).toHaveBeenCalledWith({ where: { id: 'mb1' }, data: { deleteScheduledFor: operation.runAfter } });
    expect(m.write).not.toHaveBeenCalled();
    expect((await executeOperation(operation.id, { now: NOW })).operation.status).toBe('PENDING');
  });

  it('can be cancelled during the window, which clears the schedule', async () => {
    const { operation } = await req(del);
    const cancelled = await cancelOperation({ workspaceId: 'w1', operationId: operation.id, userId: 'u1' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(m.mailbox.updateMany).toHaveBeenCalledWith({ where: { id: 'mb1', workspaceId: 'w1' }, data: { deleteScheduledFor: null } });
    await expect(cancelOperation({ workspaceId: 'w1', operationId: operation.id, userId: 'u1' })).rejects.toMatchObject({ status: 409 });
  });

  it('runs from the cron once due, removes the mailbox locally and confirms it is gone', async () => {
    m.inventory.mockResolvedValue({ domains: [{ domain: 'x.com', mailboxes: [] }] });
    await req(del);
    expect(await processDueOperations(NOW)).toMatchObject({ ran: 0 });
    const stats = await processDueOperations(new Date('2026-11-25T10:00:01.000Z'));
    expect(stats).toMatchObject({ ran: 1, succeeded: 1 });
    expect(m.write.mock.calls[0][0]).toMatchObject({ endpoint: 'userRemove', form: { email: 'ann@x.com' } });
    expect(m.mailbox.update).toHaveBeenCalledWith({ where: { id: 'mb1' }, data: expect.objectContaining({ status: 'REMOVED', deleteScheduledFor: null }) });
    expect(m.state.ops[0].resultJson).toEqual({ email: 'ann@x.com', verified: true });
  });

  it('with delayDays 0 deletes immediately', async () => {
    const { operation } = await req({ ...del, delayDays: 0 });
    expect(operation.status).toBe('SUCCEEDED');
  });
});

describe('failures and retries', () => {
  it('retries a server error with backoff and stops after the attempt limit', async () => {
    m.write.mockRejectedValue(new MiabApiError('Service Unavailable', 503));
    const first = (await req({ type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 100 })).operation;
    expect(first).toMatchObject({ status: 'PENDING', attempts: 1, errorMessage: 'Service Unavailable' });
    expect(first.runAfter.getTime()).toBe(NOW.getTime() + 4 * 60_000);

    let later = new Date(first.runAfter.getTime() + 1);
    for (let i = 0; i < 3; i++) {
      const out = (await executeOperation(first.id, { now: later })).operation;
      later = new Date(out.runAfter.getTime() + 1);
    }
    expect(m.state.ops[0]).toMatchObject({ status: 'FAILED', attempts: 4 });
  });

  it('does not retry a rejected request (4xx)', async () => {
    m.write.mockRejectedValue(new MiabApiError('invalid quota', 400));
    const { operation } = await req({ type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 100 });
    expect(operation).toMatchObject({ status: 'FAILED', attempts: 1, errorMessage: 'invalid quota' });
    expect(m.mailbox.update).not.toHaveBeenCalled();
  });

  it('never retries an operation that shows a password: it fails and must be requested again', async () => {
    m.write.mockRejectedValue(new MiabApiError('Service Unavailable', 503));
    const { operation } = await req({ type: 'PASSWORD_RESET', mailboxId: 'mb1' });
    expect(operation).toMatchObject({ status: 'FAILED', maxAttempts: 1 });
    await expect(retryOperation({ workspaceId: 'w1', operationId: operation.id, userId: 'u1' })).rejects.toThrow('request it again');
  });

  it('can retry a failed non-secret operation by hand', async () => {
    m.write.mockRejectedValueOnce(new MiabApiError('invalid', 400)).mockResolvedValue('ok');
    const { operation } = await req({ type: 'QUOTA_SET', mailboxId: 'mb1', quotaMb: 100 });
    const retried = await retryOperation({ workspaceId: 'w1', operationId: operation.id, userId: 'u1' });
    expect(retried.operation.status).toBe('SUCCEEDED');
    await expect(retryOperation({ workspaceId: 'w1', operationId: operation.id, userId: 'u1' })).rejects.toMatchObject({ status: 409 });
  });

  it('is safe against two workers: only one claims a due operation', async () => {
    const { operation } = await req({ type: 'MAILBOX_DELETE', mailboxId: 'mb1', confirmEmail: 'ann@x.com', delayDays: 1 });
    const due = new Date(NOW.getTime() + 2 * 86_400_000);
    await Promise.all([executeOperation(operation.id, { now: due }), executeOperation(operation.id, { now: due })]);
    expect(m.write.mock.calls.filter((c) => c[0].endpoint === 'userRemove')).toHaveLength(1);
  });
});

describe('processDueOperations', () => {
  it('fails operations a crash left running and never runs a password operation that can no longer show its password', async () => {
    m.state.ops.push(
      { id: 'stuck', workspaceId: 'w1', type: 'QUOTA_SET', status: 'RUNNING', startedAt: new Date(NOW.getTime() - 11 * 60_000), runAfter: NOW, attempts: 1, maxAttempts: 4 },
      { id: 'secret', workspaceId: 'w1', type: 'PASSWORD_RESET', status: 'PENDING', runAfter: NOW, attempts: 0, maxAttempts: 1 },
    );
    const stats = await processDueOperations(NOW);
    expect(stats).toMatchObject({ ran: 0, interrupted: 2 });
    expect(m.state.ops.map((o) => o.status)).toEqual(['FAILED', 'FAILED']);
    expect(m.write).not.toHaveBeenCalled();
  });
});

describe('alias operations', () => {
  it('adds an alias on a domain of this workspace and counts it only when new', async () => {
    m.domain.findFirst.mockResolvedValue({ id: 'd1', domain: 'x.com', server: server() });
    m.write.mockResolvedValue('alias added');
    const { operation } = await req({ type: 'ALIAS_ADD', domainId: 'd1', address: 'info@x.com', forwardsTo: ['ann@x.com', 'bob@x.com'] });
    expect(operation.status).toBe('SUCCEEDED');
    expect(m.write.mock.calls[0][0]).toMatchObject({ endpoint: 'aliasAdd', form: { address: 'info@x.com', forwards_to: 'ann@x.com\nbob@x.com' } });
    expect(m.domain.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { aliasCount: { increment: 1 } } });

    m.domain.update.mockClear();
    m.write.mockResolvedValue('alias updated');
    await req({ type: 'ALIAS_ADD', domainId: 'd1', address: 'info@x.com', forwardsTo: ['ann@x.com'] });
    expect(m.domain.update).not.toHaveBeenCalled();
  });

  it('fails clearly when the domain disappears before the operation runs', async () => {
    m.mailbox.findFirst.mockResolvedValueOnce(null);
    m.domain.findFirst.mockResolvedValueOnce(null);
    const { operation } = await req({ type: 'MAILBOX_CREATE', email: 'new@x.com' });
    expect(operation).toMatchObject({ status: 'FAILED', errorMessage: 'Domain no longer exists.' });
    expect(m.write).not.toHaveBeenCalled();
  });

  it('rejects an alias on another domain', async () => {
    m.domain.findFirst.mockResolvedValue({ id: 'd1', domain: 'x.com', server: server() });
    await expect(req({ type: 'ALIAS_ADD', domainId: 'd1', address: 'info@evil.com', forwardsTo: ['a@x.com'] })).rejects.toThrow('must be on x.com');
    expect(m.write).not.toHaveBeenCalled();
  });
});
