import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => {
  const state = {
    domains: [] as Row[], mailboxes: [] as Row[], subs: [] as Row[], reviews: [] as Row[], runs: [] as Row[],
    server: { id: 's1', workspaceId: 'w1', name: 'Box', baseUrl: 'https://mail.example.com', accessMode: 'READ_ONLY_ADAPTER', encryptedToken: null } as Row,
    failOnMailbox: null as string | null, inventory: { syncedAt: '', domains: [] } as unknown, txCount: 0,
  };
  return state;
});

vi.mock('@/lib/encryption', () => ({ decrypt: (v: string) => v }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: vi.fn(async () => 'log') }));
vi.mock('@/lib/email-billing/miab-client', () => ({ fetchMailBillingInventory: vi.fn(async () => db.inventory) }));
vi.mock('@/lib/prisma', () => {
  let n = 0;
  const id = () => `id${++n}`;
  const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in (v as Row)) return ((v as { in: unknown[] }).in).includes(row[k]);
    return row[k] === v;
  });
  const client = {
    mailBillingServer: { findFirst: async () => db.server, update: async () => db.server },
    mailBillingSyncRun: { create: async ({ data }: { data: Row }) => { const r = { id: id(), ...data }; db.runs.push(r); return r; }, update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(db.runs.find((r) => r.id === where.id)!, data) },
    mailBillingDomain: {
      findMany: async () => db.domains.map((d) => ({ ...d, subscriptions: db.subs.filter((s) => s.domainId === d.id) })),
      upsert: async ({ where, create, update }: { where: { workspaceId_serverId_domain: Row }; create: Row; update: Row }) => {
        const key = where.workspaceId_serverId_domain.domain;
        const found = db.domains.find((d) => d.domain === key);
        if (found) return Object.assign(found, update);
        const row = { id: id(), clientId: null, ...create }; db.domains.push(row); return row;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { db.domains.filter((d) => match(d, { id: where.id })).forEach((d) => Object.assign(d, data)); },
    },
    mailBillingMailbox: {
      findMany: async () => db.mailboxes,
      upsert: async ({ where, create, update }: { where: { workspaceId_serverId_email: Row }; create: Row; update: Row }) => {
        const email = where.workspaceId_serverId_email.email as string;
        if (db.failOnMailbox === email) throw new Error('boom');
        const found = db.mailboxes.find((m) => m.email === email);
        if (found) return Object.assign(found, update);
        const row = { id: id(), ...create }; db.mailboxes.push(row); return row;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { db.mailboxes.filter((m) => match(m, { id: where.id })).forEach((m) => Object.assign(m, data)); },
    },
    mailBillingSubscription: { findUnique: async ({ where }: { where: { workspaceId_domainId: Row } }) => db.subs.find((s) => s.domainId === where.workspaceId_domainId.domainId) ?? null, update: async () => ({}) },
    mailBillingReviewItem: {
      findFirst: async ({ where }: { where: Row }) => db.reviews.find((r) => match(r, where)) ?? null,
      create: async ({ data }: { data: Row }) => { const r = { id: id(), status: 'OPEN', ...data }; db.reviews.push(r); return r; },
    },
    // Snapshot/rollback so a failing callback leaves no partial writes, like a real transaction.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      db.txCount++;
      const snap = JSON.stringify([db.domains, db.mailboxes, db.reviews]);
      try { return await fn(client); } catch (e) {
        [db.domains, db.mailboxes, db.reviews] = JSON.parse(snap).map((a: Row[]) => a);
        throw e;
      }
    },
  };
  return { prisma: client };
});

import { syncMailBillingServer } from '@/lib/email-billing/sync';

const inv = (domains: Array<{ domain: string; mailboxes: string[] }>) => ({
  syncedAt: new Date().toISOString(),
  domains: domains.map((d) => ({ domain: d.domain, aliasesCount: 0, mailboxes: d.mailboxes.map((email) => ({ email })) })),
});
const run = () => syncMailBillingServer({ workspaceId: 'w1', serverId: 's1' });
const reviewsOfType = (type: string) => db.reviews.filter((r) => r.type === type);

describe('syncMailBillingServer', () => {
  beforeEach(() => {
    db.domains.length = 0; db.mailboxes.length = 0; db.subs.length = 0; db.reviews.length = 0; db.runs.length = 0;
    db.failOnMailbox = null; db.txCount = 0;
  });

  it('imports domains and mailboxes, one transaction per domain plus one for removals', async () => {
    db.inventory = inv([{ domain: 'a.com', mailboxes: ['x@a.com', 'y@a.com'] }, { domain: 'b.com', mailboxes: ['z@b.com'] }]);
    const summary = await run();
    expect(summary).toMatchObject({ domainsSeen: 2, mailboxesSeen: 3, domainsAdded: 2, mailboxesAdded: 3, domainsRemoved: 0 });
    expect(db.txCount).toBe(3);
    expect(db.runs[0].status).toBe('SUCCESS');
  });

  it('rolls back a domain whose mailbox write fails and records the failed run', async () => {
    db.inventory = inv([{ domain: 'a.com', mailboxes: ['x@a.com', 'bad@a.com'] }]);
    db.failOnMailbox = 'bad@a.com';
    await expect(run()).rejects.toThrow('boom');
    expect(db.domains).toHaveLength(0);
    expect(db.mailboxes).toHaveLength(0);
    expect(db.runs[0].status).toBe('FAILED');
    expect(reviewsOfType('SYNC_FAILED')).toHaveLength(1);
  });

  it('flags a missing domain once and does not re-flag or re-count it on later syncs', async () => {
    db.inventory = inv([{ domain: 'a.com', mailboxes: ['x@a.com'] }, { domain: 'b.com', mailboxes: ['y@b.com'] }]);
    await run();
    db.inventory = inv([{ domain: 'a.com', mailboxes: ['x@a.com'] }]);
    const second = await run();
    expect(second).toMatchObject({ domainsRemoved: 1, mailboxesRemoved: 1 });
    expect(db.domains.find((d) => d.domain === 'b.com')?.status).toBe('REMOVED');

    // Resolve the open item, then sync again: the already-removed domain must stay quiet.
    reviewsOfType('DOMAIN_REMOVED_FROM_MIAB').forEach((r) => { r.status = 'RESOLVED'; });
    reviewsOfType('MAILBOX_REMOVED').forEach((r) => { r.status = 'RESOLVED'; });
    const archivedAt = db.domains.find((d) => d.domain === 'b.com')?.archivedAt;
    const third = await run();
    expect(third).toMatchObject({ domainsRemoved: 0, mailboxesRemoved: 0 });
    expect(reviewsOfType('DOMAIN_REMOVED_FROM_MIAB')).toHaveLength(1);
    expect(reviewsOfType('MAILBOX_REMOVED')).toHaveLength(1);
    expect(db.domains.find((d) => d.domain === 'b.com')?.archivedAt).toBe(archivedAt);
  });
});
