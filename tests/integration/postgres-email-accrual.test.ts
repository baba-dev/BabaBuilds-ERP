import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Staging check for accrual billing: the real invoice engine, real payments, real voids and real database locking, with
 * nothing mocked. Runs only against a disposable local `bababuilds_erp_ci` database (the same guard as the other
 * PostgreSQL integration tests), so it can never touch customer data.
 *
 *   CI_POSTGRES_FINANCE_TESTS=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bababuilds_erp_ci \
 *     npx vitest run tests/integration/postgres-email-accrual.test.ts
 */
const url = process.env.DATABASE_URL;
let valid = false;
try {
  const parsed = new URL(url ?? '');
  valid = process.env.CI_POSTGRES_FINANCE_TESTS === '1' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) && decodeURIComponent(parsed.pathname.slice(1)) === 'bababuilds_erp_ci';
} catch { /* missing database config => disabled */ }

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const at = (s: string) => new Date(`${s}T10:00:00.000Z`);

describe.runIf(valid)('accrual billing against a real database (staging check)', () => {
  let uploads: string;
  const ids = { workspace: '', user: '', client: '', otherClient: '', server: '', domain: '', plan: '' };
  let prisma: typeof import('@/lib/prisma').prisma;
  let lib: {
    setup: typeof import('@/lib/email-billing/setup');
    coll: typeof import('@/lib/email-billing/collections');
    daily: typeof import('@/lib/email-billing/daily-run');
  };

  beforeAll(async () => {
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-staging-'));
    process.env.PRIVATE_UPLOADS_DIR = uploads;
    ({ prisma } = await import('@/lib/prisma'));
    lib = { setup: await import('@/lib/email-billing/setup'), coll: await import('@/lib/email-billing/collections'), daily: await import('@/lib/email-billing/daily-run') };

    const user = await prisma.user.create({ data: { email: `staging-${randomUUID()}@example.com` } });
    const workspace = await prisma.workspace.create({
      data: { name: `Accrual staging ${randomUUID()}`, baseCurrency: 'INR', countryCode: 'IN', planTier: 'PRO', subscriptionStatus: 'ACTIVE', subscriptionEndsAt: new Date(Date.now() + 365 * 86_400_000) },
    });
    await prisma.workspaceUser.create({ data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER', businessRole: 'OWNER' } });
    await prisma.businessProfile.create({
      data: {
        workspaceId: workspace.id, companyName: 'Aiwa Mail Pvt Ltd', proprietorName: 'Owner', address: '1 Mail Street, Mumbai', email: 'billing@aiwamail.test', panNumber: 'ABCDE1234F',
        gstin: '27ABCDE1234F1Z5', gstStateCode: '27', bankName: 'Test Bank', accountName: 'Aiwa Mail', accountNumber: '1234567890', ifscCode: 'TEST0000001', defaultTaxRate: 0.18,
      },
    });
    const client = await prisma.client.create({ data: { workspaceId: workspace.id, name: 'Acme Traders', address: '5 Market Rd, Pune', country: 'India', countryCode: 'IN', gstStateCode: '27', isExport: false, email: 'accounts@acme.test' } });
    const otherClient = await prisma.client.create({ data: { workspaceId: workspace.id, name: 'Zed Studios', address: '9 Hill Rd, Pune', country: 'India', countryCode: 'IN', gstStateCode: '27', isExport: false } });
    const server = await prisma.mailBillingServer.create({ data: { workspaceId: workspace.id, name: 'aiwamail', baseUrl: 'https://mail.aiwamail.test', accessMode: 'READ_ONLY_ADAPTER' } });
    const domain = await prisma.mailBillingDomain.create({ data: { workspaceId: workspace.id, serverId: server.id, domain: 'acme.test', mailboxCount: 3, discoveredAt: d('2026-01-10') } });
    for (const local of ['ann', 'bob', 'cara']) {
      await prisma.mailBillingMailbox.create({ data: { workspaceId: workspace.id, serverId: server.id, domainId: domain.id, email: `${local}@acme.test`, localPart: local, billingStartsOn: d('2026-01-10') } });
    }
    const plan = await prisma.mailBillingPlan.create({ data: { workspaceId: workspace.id, name: 'Per address', billingMode: 'PER_MAILBOX', basePrice: 100, currency: 'INR', frequency: 'MONTHLY', includedQuotaMb: 10240, outboundPerDay: 200 } });
    await prisma.mailBillingSettings.create({ data: { workspaceId: workspace.id, billingModel: 'ACCRUAL' } });
    Object.assign(ids, { workspace: workspace.id, user: user.id, client: client.id, otherClient: otherClient.id, server: server.id, domain: domain.id, plan: plan.id });
  }, 60_000);

  afterAll(async () => {
    if (ids.workspace) await prisma.workspace.delete({ where: { id: ids.workspace } }).catch(() => null);
    if (ids.user) await prisma.user.delete({ where: { id: ids.user } }).catch(() => null);
    fs.rmSync(uploads, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  const collect = (over: Record<string, unknown> = {}) => lib.coll.collectFromClient({ workspaceId: ids.workspace, userId: ids.user, clientId: ids.client, asOf: d('2026-02-09'), now: at('2026-02-09'), ...over } as never);
  const mailboxes = () => prisma.mailBillingMailbox.findMany({ where: { workspaceId: ids.workspace }, orderBy: { email: 'asc' } });

  it('1. sets billing up without a retainer and starts each address on the issue date', async () => {
    const result = await lib.setup.setupDomainBilling({ workspaceId: ids.workspace, userId: ids.user, domainId: ids.domain, planId: ids.plan, clientId: ids.client, startDate: d('2026-01-10'), now: at('2026-01-10') });
    expect(result).toMatchObject({ retainerId: null, status: 'ACTIVE' });
    expect(await prisma.retainer.count({ where: { workspaceId: ids.workspace } })).toBe(0);
    const boxes = await mailboxes();
    expect(boxes.map((b) => b.billingStartsOn.toISOString().slice(0, 10))).toEqual(['2026-01-10', '2026-01-10', '2026-01-10']);
    expect(boxes.every((b) => b.billedThrough === null)).toBe(true);
  });

  it('2. the statement is exactly one month for three addresses on 9 February', async () => {
    const s = await lib.coll.buildStatement(ids.workspace, ids.client, d('2026-02-09'));
    expect(s.currencies[0]).toMatchObject({ currency: 'INR', total: 300, addresses: 3 });
    expect(s.currencies[0].domains[0].lines.map((l) => [l.months, l.amount])).toEqual([[1, 100], [1, 100], [1, 100]]);
    const balances = await lib.coll.listBalances(ids.workspace, d('2026-02-09'));
    expect(balances.rows.find((r) => r.clientId === ids.client)).toMatchObject({ owed: 300, addresses: 3 });
  });

  it('3. collecting creates a real invoice with tax and a PDF, records the payment and moves the dates', async () => {
    const out = await collect({ expectedTotal: 300, payment: { method: 'CASH', reference: 'receipt 1' } });
    expect(out).toMatchObject({ status: 'INVOICED', total: 300, currency: 'INR', payment: { ok: true } });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: out.invoice!.id }, include: { items: true, payments: true } });
    expect(invoice.workspaceId).toBe(ids.workspace);
    expect(invoice.clientId).toBe(ids.client);
    expect(invoice.subtotal.toString()).toBe('300');
    // 18% GST on 300 = 54, intra-state: CGST + SGST. Whatever the engine decides, subtotal + tax must equal the total.
    expect(Number(invoice.taxAmount)).toBeCloseTo(54, 2);
    expect(Number(invoice.grandTotal)).toBeCloseTo(354, 2);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].description).toContain('Email hosting for acme.test: 3 addresses, 10 Jan 2026 to 9 Feb 2026');
    expect(invoice.status).toBe('PAID');
    expect(invoice.payments).toHaveLength(1);
    expect(Number(invoice.payments[0].amount)).toBeCloseTo(354, 2);
    expect(invoice.invoiceNumber).toBeTruthy();
    expect(fs.existsSync(path.join(uploads, 'invoices', ids.workspace, `${invoice.invoiceNumber.replace(/\//g, '_')}.pdf`))).toBe(true);

    expect((await mailboxes()).map((b) => b.billedThrough?.toISOString().slice(0, 10))).toEqual(['2026-02-09', '2026-02-09', '2026-02-09']);
    const col = await prisma.mailCollection.findUniqueOrThrow({ where: { id: out.collectionId } });
    expect(col).toMatchObject({ status: 'INVOICED', invoiceId: invoice.id, currency: 'INR' });
    expect(Number(col.total)).toBe(300);
  }, 60_000);

  it('4. collecting again for the same date charges nothing, and the next month is charged once', async () => {
    await expect(collect()).rejects.toMatchObject({ code: 'NOTHING_TO_COLLECT' });
    // 10 Feb through 9 Mar is exactly one month again: no gap and no overlap with the first collection.
    const second = await collect({ asOf: d('2026-03-09'), now: at('2026-03-09'), expectedTotal: 300 });
    expect(second.total).toBe(300);
    const lines = (await prisma.mailCollection.findUniqueOrThrow({ where: { id: second.collectionId } })).linesJson as Array<{ firstDay: string; lastDay: string }>;
    expect(lines.every((l) => l.firstDay === '2026-02-10' && l.lastDay === '2026-03-09')).toBe(true);
    expect(await prisma.invoice.count({ where: { workspaceId: ids.workspace, status: { not: 'VOID' } } })).toBe(2);
  }, 60_000);

  it('5. refuses when the confirmed amount no longer matches, and charges nothing', async () => {
    const before = await mailboxes();
    await expect(collect({ asOf: d('2026-04-09'), now: at('2026-04-09'), expectedTotal: 250 })).rejects.toMatchObject({ code: 'AMOUNT_CHANGED' });
    expect((await mailboxes()).map((b) => b.billedThrough?.getTime())).toEqual(before.map((b) => b.billedThrough?.getTime()));
  });

  it('6. two people collecting at the same moment: exactly one invoice, no double charge', async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => collect({ asOf: d('2026-04-09'), now: at('2026-04-09') })));
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.filter((a): a is PromiseRejectedResult => a.status === 'rejected').map((a) => (a.reason as { code?: string }).code);
    expect(rejected.every((c) => ['CHANGED_CONCURRENTLY', 'COLLECTION_PENDING', 'NOTHING_TO_COLLECT'].includes(c ?? ''))).toBe(true);
    expect(await prisma.invoice.count({ where: { workspaceId: ids.workspace, status: { not: 'VOID' } } })).toBe(3);
    expect(await prisma.mailCollection.count({ where: { workspaceId: ids.workspace, status: 'INVOICED' } })).toBe(3);
    expect((await mailboxes()).map((b) => b.billedThrough?.toISOString().slice(0, 10))).toEqual(['2026-04-09', '2026-04-09', '2026-04-09']);
  }, 90_000);

  it('7. the latest unpaid collection can be undone: invoice voided, days given back, then collected again once', async () => {
    const latest = await prisma.mailCollection.findFirstOrThrow({ where: { workspaceId: ids.workspace, status: 'INVOICED' }, orderBy: { createdAt: 'desc' }, include: { invoice: true } });
    expect(latest.invoice?.status).toBe('PENDING');
    // An earlier one is refused: a later collection exists.
    const first = await prisma.mailCollection.findFirstOrThrow({ where: { workspaceId: ids.workspace, status: 'INVOICED' }, orderBy: { createdAt: 'asc' } });
    await expect(lib.coll.undoCollection({ workspaceId: ids.workspace, userId: ids.user, collectionId: first.id, reason: 'try' })).rejects.toMatchObject({ code: 'NOT_LATEST' });

    const undone = await lib.coll.undoCollection({ workspaceId: ids.workspace, userId: ids.user, collectionId: latest.id, reason: 'Collected from the wrong client' });
    expect(undone.creditNoteNumber).toBeTruthy();
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: latest.invoiceId! } })).status).toBe('VOID');
    expect((await prisma.mailCollection.findUniqueOrThrow({ where: { id: latest.id } })).status).toBe('VOID');
    expect((await mailboxes()).map((b) => b.billedThrough?.toISOString().slice(0, 10))).toEqual(['2026-03-09', '2026-03-09', '2026-03-09']);

    const again = await collect({ asOf: d('2026-04-09'), now: at('2026-04-09') });
    expect(again.total).toBe(300);
  }, 90_000);

  it('8. an undo is refused once money was recorded against the invoice', async () => {
    const paid = await prisma.mailCollection.findFirstOrThrow({ where: { workspaceId: ids.workspace, status: 'INVOICED', invoice: { status: 'PAID' } }, orderBy: { createdAt: 'desc' } });
    await expect(lib.coll.undoCollection({ workspaceId: ids.workspace, userId: ids.user, collectionId: paid.id, reason: 'too late' })).rejects.toBeTruthy();
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: paid.invoiceId! } })).status).toBe('PAID');
  });

  it('9. a payment can be recorded later for an unpaid collection, once', async () => {
    const unpaid = await prisma.mailCollection.findFirstOrThrow({ where: { workspaceId: ids.workspace, status: 'INVOICED', invoice: { status: 'PENDING' } }, orderBy: { createdAt: 'desc' } });
    expect(await lib.coll.recordCollectionPaymentLater({ workspaceId: ids.workspace, userId: ids.user, collectionId: unpaid.id, payment: { method: 'UPI', reference: 'upi-1' } })).toMatchObject({ ok: true });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: unpaid.invoiceId! } })).status).toBe('PAID');
    await expect(lib.coll.recordCollectionPaymentLater({ workspaceId: ids.workspace, userId: ids.user, collectionId: unpaid.id, payment: { method: 'UPI' } })).rejects.toMatchObject({ code: 'NOT_PAYABLE' });
  }, 60_000);

  it('10. if the invoice cannot be created nothing is charged and the days are put back', async () => {
    const profile = await prisma.businessProfile.findUniqueOrThrow({ where: { workspaceId: ids.workspace } });
    await prisma.businessProfile.delete({ where: { workspaceId: ids.workspace } });
    const spy = (await import('vitest')).vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const before = await mailboxes();
      await expect(collect({ asOf: d('2026-05-09'), now: at('2026-05-09') })).rejects.toMatchObject({ code: 'INVOICE_FAILED', message: expect.stringContaining('Nothing was charged') });
      expect((await mailboxes()).map((b) => b.billedThrough?.getTime())).toEqual(before.map((b) => b.billedThrough?.getTime()));
      const voided = await prisma.mailCollection.findFirstOrThrow({ where: { workspaceId: ids.workspace, status: 'VOID' }, orderBy: { createdAt: 'desc' } });
      expect(voided.invoiceId).toBeNull();
    } finally {
      spy.mockRestore();
      const { id: _id, workspaceId: _w, ...rest } = profile;
      await prisma.businessProfile.create({ data: { workspaceId: ids.workspace, ...rest } as never });
    }
  }, 60_000);

  it('11. an interrupted collection is finished without a second invoice', async () => {
    const out = await collect({ asOf: d('2026-05-09'), now: at('2026-05-09') });
    const invoicesBefore = await prisma.invoice.count({ where: { workspaceId: ids.workspace, status: { not: 'VOID' } } });
    // Simulate a crash after the invoice was created but before it was linked.
    await prisma.mailCollection.update({ where: { id: out.collectionId }, data: { status: 'INVOICING', invoiceId: null, completedAt: null } });
    await expect(collect({ asOf: d('2026-06-09'), now: at('2026-06-09') })).rejects.toMatchObject({ code: 'COLLECTION_PENDING' });
    const fixed = await lib.coll.recoverCollection({ workspaceId: ids.workspace, userId: ids.user, collectionId: out.collectionId, now: at('2026-05-09') });
    expect(fixed).toMatchObject({ status: 'INVOICED', invoice: { id: out.invoice!.id } });
    expect(await prisma.invoice.count({ where: { workspaceId: ids.workspace, status: { not: 'VOID' } } })).toBe(invoicesBefore);
  }, 90_000);

  it('12. opening dates: paid-up-to only moves forward, charging start only for uncollected addresses', async () => {
    const other = await prisma.mailBillingDomain.create({ data: { workspaceId: ids.workspace, serverId: ids.server, domain: 'zed.test', clientId: ids.otherClient, mailboxCount: 2 } });
    for (const local of ['x', 'y']) await prisma.mailBillingMailbox.create({ data: { workspaceId: ids.workspace, serverId: ids.server, domainId: other.id, email: `${local}@zed.test`, localPart: local } });
    await lib.setup.setupDomainBilling({ workspaceId: ids.workspace, userId: ids.user, domainId: other.id, planId: ids.plan, clientId: ids.otherClient, startDate: d('2025-06-01'), now: at('2026-05-09') });

    expect(await lib.coll.markCollectedThrough({ workspaceId: ids.workspace, userId: ids.user, scope: { clientId: ids.otherClient }, date: d('2026-03-31'), now: at('2026-05-09') })).toBe(2);
    expect(await lib.coll.markCollectedThrough({ workspaceId: ids.workspace, userId: ids.user, scope: { clientId: ids.otherClient }, date: d('2026-02-28'), now: at('2026-05-09') })).toBe(0); // never backwards
    expect(await lib.coll.setChargingStart({ workspaceId: ids.workspace, userId: ids.user, scope: { clientId: ids.otherClient }, date: d('2020-01-01') })).toBe(0); // already collected: untouched

    // 1 Apr through 30 Apr = one month for two addresses.
    const s = await lib.coll.buildStatement(ids.workspace, ids.otherClient, d('2026-04-30'));
    expect(s.currencies[0]).toMatchObject({ total: 200, addresses: 2 });
  });

  it('13. the daily job runs in accrual mode: snapshots are taken and no retainer is created', async () => {
    const stats = await lib.daily.runEmailHostingDailyForWorkspace(ids.workspace, at('2026-06-09'));
    expect(stats.error).toBeUndefined();
    expect(stats).toMatchObject({ trials: { converted: 0 }, quantityApplied: 0, quantityQueuedForReview: 0 });
    expect(await prisma.retainer.count({ where: { workspaceId: ids.workspace } })).toBe(0);
    expect(await prisma.mailUsageSnapshot.count({ where: { workspaceId: ids.workspace } })).toBeGreaterThan(0);
  }, 60_000);

  it('14. nothing leaks between workspaces', async () => {
    const stranger = await prisma.workspace.create({ data: { name: `stranger ${randomUUID()}` } });
    try {
      await expect(lib.coll.buildStatement(stranger.id, ids.client, d('2026-06-09'))).rejects.toMatchObject({ status: 404 });
      await expect(lib.coll.collectFromClient({ workspaceId: stranger.id, userId: ids.user, clientId: ids.client, asOf: d('2026-06-09'), now: at('2026-06-09') })).rejects.toMatchObject({ status: 404 });
      expect((await lib.coll.listBalances(stranger.id, d('2026-06-09'))).rows).toEqual([]);
    } finally {
      await prisma.workspace.delete({ where: { id: stranger.id } });
    }
  });
});
