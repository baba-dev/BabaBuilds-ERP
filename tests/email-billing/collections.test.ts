import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = vi.hoisted(() => {
  const tx = { mailCollection: { create: vi.fn(), update: vi.fn() }, mailBillingMailbox: { updateMany: vi.fn() } };
  return {
    tx,
    prisma: {
      client: { findFirst: vi.fn() },
      workspace: { findUnique: vi.fn() },
      mailBillingDomain: { findMany: vi.fn() },
      mailBillingMailbox: { updateMany: vi.fn(), count: vi.fn() },
      mailCollection: { findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), groupBy: vi.fn() },
      invoice: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    finalize: vi.fn(), pay: vi.fn(), voidInvoice: vi.fn(), log: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }));
vi.mock('@/lib/invoice/finalize-draft', () => ({ finalizeInvoiceFromDraft: m.finalize }));
vi.mock('@/lib/invoice/generation-context', () => ({ InvoiceValidationError: class InvoiceValidationError extends Error { constructor(public status: number, public payload: Record<string, unknown>) { super(String(payload.error)); } } }));
vi.mock('@/lib/invoices/payments', () => ({ recordInvoicePayment: m.pay }));
vi.mock('@/lib/invoices/void', () => ({ voidInvoice: m.voidInvoice }));
vi.mock('@/lib/security/activity-log', () => ({ logActivity: m.log }));

import { InvoiceValidationError } from '@/lib/invoice/generation-context';
import {
  buildStatement, collectFromClient, CollectionError, invoiceServices, listBalances, markCollectedThrough, recordCollectionPaymentLater, recoverCollection, setChargingStart, undoCollection,
} from '@/lib/email-billing/collections';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const NOW = new Date('2026-02-09T10:00:00.000Z');
const box = (id: string, over: Row = {}) => ({ id, email: `${id}@acme.com`, billingStartsOn: d('2026-01-10'), billedThrough: null, archivedAt: null, ...over });
const domain = (over: Row = {}) => ({
  id: 'd1', domain: 'acme.com', status: 'ACTIVE', archivedAt: null, clientId: 'c1', client: { id: 'c1', name: 'Acme Ltd' },
  subscriptions: [{ billingStatus: 'ACTIVE', cancelledAt: null, basePriceSnapshot: 100, currencySnapshot: 'INR', plan: { frequency: 'MONTHLY' } }],
  mailboxes: [box('a'), box('b')], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.prisma.client.findFirst.mockResolvedValue({ id: 'c1', name: 'Acme Ltd' });
  m.prisma.workspace.findUnique.mockResolvedValue({ baseCurrency: 'INR' });
  m.prisma.mailBillingDomain.findMany.mockResolvedValue([domain()]);
  m.prisma.mailCollection.findUnique.mockResolvedValue(null);
  m.prisma.mailCollection.findFirst.mockResolvedValue(null);
  m.tx.mailCollection.create.mockResolvedValue({ id: 'col1' });
  m.tx.mailBillingMailbox.updateMany.mockImplementation(async ({ where }: { where: Row }) => ({ count: where.id.in.length }));
  m.finalize.mockResolvedValue({ invoice: { id: 'inv1', invoiceNumber: 'INV-1', grandTotal: '236.00', subtotal: '200.00' } });
  m.pay.mockResolvedValue({ ok: true, paymentId: 'pay1' });
});

describe('statement', () => {
  it('charges each address from its first day through the as-of day, per domain, and totals them', async () => {
    const s = await buildStatement('w1', 'c1', d('2026-02-09')); // 10 Jan .. 9 Feb = exactly one month
    expect(s.currencies).toHaveLength(1);
    expect(s.currencies[0]).toMatchObject({ currency: 'INR', total: 200, addresses: 2 });
    expect(s.currencies[0].domains[0]).toMatchObject({ domain: 'acme.com', addresses: 2, subtotal: 200, firstDay: '2026-01-10', lastDay: '2026-02-09' });
    expect(s.currencies[0].domains[0].lines[0]).toMatchObject({ email: 'a@acme.com', months: 1, amount: 100, previousBilledThrough: null });
  });

  it('continues from what was last collected and skips addresses that are fully collected', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([domain({ mailboxes: [box('a', { billedThrough: d('2026-01-31') }), box('b', { billedThrough: d('2026-02-09') })] })]);
    const s = await buildStatement('w1', 'c1', d('2026-02-09'));
    const lines = s.currencies[0].domains[0].lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ email: 'a@acme.com', firstDay: '2026-02-01', lastDay: '2026-02-09', previousBilledThrough: '2026-01-31' });
  });

  it('stops charging an address when it was removed, and a domain when its plan was cancelled', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([
      domain({ mailboxes: [box('a', { archivedAt: d('2026-01-20') })] }),
      domain({ id: 'd2', domain: 'gone.com', subscriptions: [{ billingStatus: 'CANCELLED', cancelledAt: d('2026-02-01'), basePriceSnapshot: 100, currencySnapshot: 'INR', plan: { frequency: 'MONTHLY' } }], mailboxes: [box('c')] }),
    ]);
    const s = await buildStatement('w1', 'c1', d('2026-12-31'));
    const lines = s.currencies[0].domains.flatMap((x) => x.lines);
    expect(lines.find((l) => l.email === 'a@acme.com')).toMatchObject({ lastDay: '2026-01-19' });
    expect(lines.find((l) => l.email === 'c@acme.com')).toMatchObject({ lastDay: '2026-01-31' });
  });

  it('lists a domain with no plan as unrated instead of guessing a price, and keeps currencies apart', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([
      domain(), domain({ id: 'd2', domain: 'noplan.com', subscriptions: [] }),
      domain({ id: 'd3', domain: 'usd.com', subscriptions: [{ billingStatus: 'ACTIVE', cancelledAt: null, basePriceSnapshot: 2, currencySnapshot: 'USD', plan: { frequency: 'MONTHLY' } }], mailboxes: [box('u')] }),
    ]);
    const s = await buildStatement('w1', 'c1', d('2026-02-09'));
    expect(s.unrated).toEqual([{ domainId: 'd2', domain: 'noplan.com' }]);
    expect(s.currencies.map((c) => [c.currency, c.total])).toEqual([['INR', 200], ['USD', 2]]);
  });

  it('prices quarterly and yearly plans per month, and only reads this workspace', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([domain({ subscriptions: [{ billingStatus: 'ACTIVE', cancelledAt: null, basePriceSnapshot: 1200, currencySnapshot: 'INR', plan: { frequency: 'ANNUALLY' } }], mailboxes: [box('a')] })]);
    expect((await buildStatement('w9', 'c1', d('2026-02-09'))).currencies[0].total).toBe(100);
    expect(m.prisma.client.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1', workspaceId: 'w9' } }));
    expect(m.prisma.mailBillingDomain.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 'w9', clientId: 'c1', status: { not: 'IGNORED' } });
  });

  it('refuses an unknown client', async () => {
    m.prisma.client.findFirst.mockResolvedValue(null);
    await expect(buildStatement('w1', 'zzz', d('2026-02-09'))).rejects.toMatchObject({ status: 404 });
  });

  it('builds one readable invoice line per domain', () => {
    const lines = [
      { mailboxId: 'a', email: 'a@acme.com', domainId: 'd1', domain: 'acme.com', firstDay: '2026-01-10', lastDay: '2026-02-09', previousBilledThrough: null, months: 1, amount: 100 },
      { mailboxId: 'b', email: 'b@acme.com', domainId: 'd1', domain: 'acme.com', firstDay: '2026-01-15', lastDay: '2026-02-09', previousBilledThrough: null, months: 1, amount: 83.33 },
      { mailboxId: 'c', email: 'c@zed.com', domainId: 'd2', domain: 'zed.com', firstDay: '2026-02-01', lastDay: '2026-02-09', previousBilledThrough: null, months: 0.3, amount: 30 },
    ];
    expect(invoiceServices(lines)).toEqual([
      { title: 'Email hosting for acme.com: 2 addresses, 10 Jan 2026 to 9 Feb 2026', amount: 183.33 },
      { title: 'Email hosting for zed.com: 1 address, 1 Feb 2026 to 9 Feb 2026', amount: 30 },
    ]);
  });
});

describe('balances', () => {
  it('lists the biggest balance first with the last collection and unpaid collection invoices', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([
      domain(),
      domain({ id: 'd9', domain: 'big.com', clientId: 'c2', client: { id: 'c2', name: 'Big Co' }, mailboxes: [box('x'), box('y'), box('z')] }),
    ]);
    m.prisma.mailCollection.groupBy.mockResolvedValue([{ clientId: 'c1', _max: { asOf: d('2026-01-09') } }]);
    m.prisma.invoice.findMany.mockResolvedValue([{ clientId: 'c1', grandTotal: '118.00' }]);
    const { rows, totals } = await listBalances('w1', d('2026-02-09'));
    expect(rows.map((r) => [r.clientName, r.owed])).toEqual([['Big Co', 300], ['Acme Ltd', 200]]);
    expect(rows[1]).toMatchObject({ lastCollectedOn: '2026-01-09', openInvoices: 1, openInvoiceAmount: 118, addresses: 2, oldestUnchargedDay: '2026-01-10' });
    expect(totals).toEqual([{ currency: 'INR', owed: 500 }]);
  });

  it('still shows a client with an unpaid collection invoice and nothing new owed', async () => {
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([domain({ mailboxes: [box('a', { billedThrough: d('2026-02-09') })] })]);
    m.prisma.mailCollection.groupBy.mockResolvedValue([]);
    m.prisma.invoice.findMany.mockResolvedValue([{ clientId: 'c1', grandTotal: '118.00' }]);
    const { rows } = await listBalances('w1', d('2026-02-09'));
    expect(rows).toEqual([expect.objectContaining({ clientId: 'c1', owed: 0, openInvoices: 1, openInvoiceAmount: 118 })]);
  });
});

describe('collectFromClient', () => {
  const run = (over: Row = {}) => collectFromClient({ workspaceId: 'w1', userId: 'u1', clientId: 'c1', asOf: d('2026-02-09'), now: NOW, ...over });

  it('records the collection and moves the dates first, then makes one invoice with a line per domain', async () => {
    const out = await run();
    expect(out).toMatchObject({ collectionId: 'col1', status: 'INVOICED', total: 200, currency: 'INR', invoice: { id: 'inv1', invoiceNumber: 'INV-1', total: 236 }, payment: null });
    const order = [m.tx.mailCollection.create.mock.invocationCallOrder[0], m.tx.mailBillingMailbox.updateMany.mock.invocationCallOrder[0], m.finalize.mock.invocationCallOrder[0]];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Both addresses share the same previous/new dates, so they are moved in one compare-and-set.
    expect(m.tx.mailBillingMailbox.updateMany).toHaveBeenCalledTimes(1);
    expect(m.tx.mailBillingMailbox.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] }, workspaceId: 'w1', billedThrough: null }, data: { billedThrough: d('2026-02-09') } });
    expect(m.finalize).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'w1', actorId: 'u1',
      draftInput: expect.objectContaining({ clientId: 'c1', status: 'PENDING', sendEmail: false, currency: 'INR', billingMonth: 'February 2026', services: [{ title: expect.stringContaining('acme.com: 2 addresses'), amount: 200 }] }),
    }));
    expect(m.prisma.mailCollection.update).toHaveBeenCalledWith({ where: { id: 'col1' }, data: expect.objectContaining({ invoiceId: 'inv1', status: 'INVOICED' }) });
  });

  it('records the payment against the invoice total when asked, once', async () => {
    const out = await run({ payment: { method: 'CASH', reference: 'receipt 12' } });
    expect(out.payment).toEqual({ ok: true, paymentId: 'pay1' });
    expect(m.pay).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'inv1', amount: '236.00', method: 'CASH', reference: 'receipt 12', idempotencyKey: 'mail-collection-col1' }));
  });

  it('keeps the invoice and reports it when the payment cannot be recorded', async () => {
    m.pay.mockResolvedValue({ ok: false, status: 409, code: 'X', message: 'Already paid' });
    const out = await run({ payment: { method: 'CASH' } });
    expect(out).toMatchObject({ status: 'INVOICED', invoice: { id: 'inv1' }, payment: { ok: false, message: 'Already paid' } });
  });

  it('refuses when the amount is not what the person confirmed, before charging anything', async () => {
    await expect(run({ expectedTotal: 150 })).rejects.toMatchObject({ code: 'AMOUNT_CHANGED', status: 409, message: expect.stringContaining('was 150.00, it is now 200.00') });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.finalize).not.toHaveBeenCalled();
    expect(await run({ expectedTotal: 200 })).toMatchObject({ total: 200 });
    expect(await run({ expectedTotal: 200.004 })).toMatchObject({ total: 200 });
  });

  it('cannot collect into the future, or when nothing has built up, or without a plan price', async () => {
    await expect(run({ asOf: d('2026-02-10') })).rejects.toMatchObject({ code: 'DATE_IN_FUTURE' });
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([domain({ mailboxes: [box('a', { billedThrough: d('2026-02-09') })] })]);
    await expect(run()).rejects.toMatchObject({ code: 'NOTHING_TO_COLLECT', status: 409 });
    expect(m.finalize).not.toHaveBeenCalled();
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('makes the owner pick one currency, and only invoices in the base currency', async () => {
    const usd = domain({ id: 'd3', domain: 'usd.com', subscriptions: [{ billingStatus: 'ACTIVE', cancelledAt: null, basePriceSnapshot: 2, currencySnapshot: 'USD', plan: { frequency: 'MONTHLY' } }], mailboxes: [box('u')] });
    m.prisma.mailBillingDomain.findMany.mockResolvedValue([domain(), usd]);
    await expect(run()).rejects.toMatchObject({ code: 'CURRENCY_REQUIRED' });
    await expect(run({ currency: 'USD' })).rejects.toMatchObject({ code: 'CURRENCY_UNSUPPORTED' });
    expect(await run({ currency: 'INR' })).toMatchObject({ currency: 'INR', total: 200 });
  });

  it('will not start a second collection while one is unfinished', async () => {
    m.prisma.mailCollection.findFirst.mockResolvedValue({ id: 'old' });
    await expect(run()).rejects.toMatchObject({ code: 'COLLECTION_PENDING' });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the first result for a repeated idempotency key without charging again', async () => {
    m.prisma.mailCollection.findUnique.mockResolvedValue({ id: 'col0' });
    m.prisma.mailCollection.findUniqueOrThrow.mockResolvedValue({ id: 'col0', status: 'INVOICED', total: '200', currency: 'INR', invoice: { id: 'inv0', invoiceNumber: 'INV-0', grandTotal: '236' } });
    const out = await run({ idempotencyKey: 'key-1' });
    expect(out).toMatchObject({ collectionId: 'col0', invoice: { invoiceNumber: 'INV-0' } });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.finalize).not.toHaveBeenCalled();
  });

  it('refuses, charging nothing and creating no invoice, when an address changed since the statement (another collection)', async () => {
    m.tx.mailBillingMailbox.updateMany.mockResolvedValue({ count: 1 }); // expected 2
    await expect(run()).rejects.toMatchObject({ code: 'CHANGED_CONCURRENTLY', status: 409 });
    expect(m.finalize).not.toHaveBeenCalled();
  });

  it('puts the dates back and voids the collection when the invoice cannot be created', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.finalize.mockRejectedValue(new Error('pdf renderer crashed'));
    await expect(run()).rejects.toMatchObject({ code: 'INVOICE_FAILED', status: 502, message: expect.stringContaining('nothing was charged') });
    expect(m.tx.mailBillingMailbox.updateMany).toHaveBeenLastCalledWith({ where: { id: { in: ['a', 'b'] }, workspaceId: 'w1', billedThrough: d('2026-02-09') }, data: { billedThrough: null } });
    expect(m.tx.mailCollection.update).toHaveBeenCalledWith({ where: { id: 'col1' }, data: expect.objectContaining({ status: 'VOID' }) });
    expect(m.pay).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows the invoice engine\'s own message (missing business profile, plan limit) and says nothing was charged', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.finalize.mockRejectedValue(new InvoiceValidationError(400, { error: 'Business profile missing. Please complete Settings Wizard.' }));
    await expect(run()).rejects.toMatchObject({ status: 422, code: 'INVOICE_FAILED', message: 'Business profile missing. Please complete Settings Wizard. Nothing was charged.' });
    expect(m.tx.mailBillingMailbox.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { billedThrough: null } }));
    spy.mockRestore();
  });

  it('keeps an invoice line title within the engine\'s 200 character limit, even for a very long domain', () => {
    const long = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}.com`;
    const [line] = invoiceServices([{ mailboxId: 'a', email: `x@${long}`, domainId: 'd', domain: long, firstDay: '2026-01-10', lastDay: '2026-02-09', previousBilledThrough: null, months: 1, amount: 100 }]);
    expect(line.title.length).toBeLessThanOrEqual(200);
    expect(line.title.endsWith(': 1 address, 10 Jan 2026 to 9 Feb 2026')).toBe(true);
  });
});

describe('recoverCollection', () => {
  const stuck = { id: 'col9', workspaceId: 'w1', clientId: 'c1', status: 'INVOICING', total: '200.00', currency: 'INR', asOf: d('2026-02-09'), createdAt: new Date('2026-02-09T09:59:00Z'), linesJson: [{ mailboxId: 'a', email: 'a@acme.com', domainId: 'd1', domain: 'acme.com', firstDay: '2026-01-10', lastDay: '2026-02-09', previousBilledThrough: null, months: 1, amount: 100 }] };
  beforeEach(() => { m.prisma.mailCollection.findFirst.mockResolvedValue(stuck); m.prisma.mailCollection.findUniqueOrThrow.mockResolvedValue({ id: 'col9', status: 'INVOICED', total: '200', currency: 'INR', invoice: { id: 'invX', invoiceNumber: 'INV-X', grandTotal: '236' } }); });

  it('links the invoice that was already created instead of creating a second one', async () => {
    m.prisma.invoice.findMany.mockResolvedValue([{ id: 'invX', invoiceNumber: 'INV-X', grandTotal: '236', subtotal: '200' }]);
    await recoverCollection({ workspaceId: 'w1', userId: 'u1', collectionId: 'col9', now: NOW });
    expect(m.finalize).not.toHaveBeenCalled();
    expect(m.prisma.mailCollection.update).toHaveBeenCalledWith({ where: { id: 'col9' }, data: expect.objectContaining({ invoiceId: 'invX', status: 'INVOICED' }) });
    expect(m.prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: 'w1', clientId: 'c1', status: { not: 'VOID' }, mailCollections: { none: {} } });
  });

  it('creates the invoice from the stored lines when there is none', async () => {
    m.prisma.invoice.findMany.mockResolvedValue([]);
    await recoverCollection({ workspaceId: 'w1', userId: 'u1', collectionId: 'col9', now: NOW });
    expect(m.finalize).toHaveBeenCalledWith(expect.objectContaining({ draftInput: expect.objectContaining({ services: [expect.objectContaining({ amount: 100 })] }) }));
  });

  it('will not guess when more than one invoice could match, or finish a finished collection', async () => {
    m.prisma.invoice.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
    await expect(recoverCollection({ workspaceId: 'w1', userId: 'u1', collectionId: 'col9' })).rejects.toMatchObject({ code: 'AMBIGUOUS' });
    m.prisma.mailCollection.findFirst.mockResolvedValue({ ...stuck, status: 'INVOICED' });
    await expect(recoverCollection({ workspaceId: 'w1', userId: 'u1', collectionId: 'col9' })).rejects.toMatchObject({ code: 'ALREADY_FINISHED' });
  });
});

describe('undoCollection', () => {
  const done = { id: 'col1', workspaceId: 'w1', clientId: 'c1', status: 'INVOICED', invoiceId: 'inv1', createdAt: NOW, linesJson: [{ mailboxId: 'a', email: 'a@acme.com', domainId: 'd1', domain: 'acme.com', firstDay: '2026-01-10', lastDay: '2026-02-09', previousBilledThrough: null, months: 1, amount: 100 }, { mailboxId: 'b', email: 'b@acme.com', domainId: 'd1', domain: 'acme.com', firstDay: '2026-01-10', lastDay: '2026-02-09', previousBilledThrough: null, months: 1, amount: 100 }] };
  const undo = () => undoCollection({ workspaceId: 'w1', userId: 'u1', collectionId: 'col1', reason: 'Wrong client' });
  beforeEach(() => {
    m.prisma.mailCollection.findFirst.mockResolvedValueOnce(done).mockResolvedValue(null);
    m.prisma.mailBillingMailbox.count.mockResolvedValue(2);
    m.voidInvoice.mockResolvedValue({ ok: true, creditNoteNumber: 'CN-1' });
  });

  it('voids the invoice, gives the days back and voids the collection', async () => {
    expect(await undo()).toEqual({ creditNoteNumber: 'CN-1' });
    expect(m.voidInvoice).toHaveBeenCalledWith({ workspaceId: 'w1', userId: 'u1', invoiceId: 'inv1', reason: 'Wrong client' });
    expect(m.tx.mailBillingMailbox.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] }, workspaceId: 'w1', billedThrough: d('2026-02-09') }, data: { billedThrough: null } });
    expect(m.tx.mailCollection.update).toHaveBeenCalledWith({ where: { id: 'col1' }, data: expect.objectContaining({ status: 'VOID' }) });
  });

  it('is refused, and voids nothing, when a later collection exists or addresses changed since', async () => {
    m.prisma.mailCollection.findFirst.mockReset();
    m.prisma.mailCollection.findFirst.mockResolvedValueOnce(done).mockResolvedValueOnce({ id: 'later' });
    await expect(undo()).rejects.toMatchObject({ code: 'NOT_LATEST' });
    m.prisma.mailCollection.findFirst.mockReset();
    m.prisma.mailCollection.findFirst.mockResolvedValueOnce(done).mockResolvedValue(null);
    m.prisma.mailBillingMailbox.count.mockResolvedValue(1);
    await expect(undo()).rejects.toMatchObject({ code: 'CHANGED_AFTER' });
    expect(m.voidInvoice).not.toHaveBeenCalled();
  });

  it('leaves the days charged when the invoice cannot be voided (for example money was recorded)', async () => {
    m.voidInvoice.mockResolvedValue({ ok: false, status: 409, code: 'PAYMENTS_EXIST', message: 'Reverse the payments first.' });
    await expect(undo()).rejects.toMatchObject({ code: 'PAYMENTS_EXIST', status: 409 });
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only undoes a finished collection', async () => {
    m.prisma.mailCollection.findFirst.mockReset();
    m.prisma.mailCollection.findFirst.mockResolvedValueOnce({ ...done, status: 'INVOICING', invoiceId: null });
    await expect(undo()).rejects.toMatchObject({ code: 'NOT_UNDOABLE' });
  });
});

describe('recording a payment later', () => {
  it('pays the collection invoice in full, once, and refuses a paid or void one', async () => {
    m.prisma.mailCollection.findFirst.mockResolvedValue({ id: 'col1', invoice: { id: 'inv1', grandTotal: '236', status: 'PENDING' } });
    expect(await recordCollectionPaymentLater({ workspaceId: 'w1', userId: 'u1', collectionId: 'col1', payment: { method: 'UPI' } })).toEqual({ ok: true, paymentId: 'pay1' });
    expect(m.pay).toHaveBeenCalledWith(expect.objectContaining({ amount: '236.00', method: 'UPI', idempotencyKey: 'mail-collection-col1' }));
    m.prisma.mailCollection.findFirst.mockResolvedValue({ id: 'col1', invoice: { id: 'inv1', grandTotal: '236', status: 'PAID' } });
    await expect(recordCollectionPaymentLater({ workspaceId: 'w1', userId: 'u1', collectionId: 'col1', payment: { method: 'UPI' } })).rejects.toMatchObject({ code: 'NOT_PAYABLE' });
  });
});

describe('opening position', () => {
  it('sets the first charged day only for addresses nothing was collected from, within the workspace', async () => {
    m.prisma.mailBillingMailbox.updateMany.mockResolvedValue({ count: 7 });
    expect(await setChargingStart({ workspaceId: 'w1', userId: 'u1', scope: { clientId: 'c1' }, date: d('2025-06-01') })).toBe(7);
    expect(m.prisma.mailBillingMailbox.updateMany).toHaveBeenCalledWith({ where: { workspaceId: 'w1', domain: { clientId: 'c1' }, billedThrough: null }, data: { billingStartsOn: d('2025-06-01') } });
    await setChargingStart({ workspaceId: 'w1', userId: 'u1', scope: { domainId: 'd1' }, date: d('2025-06-01') });
    expect(m.prisma.mailBillingMailbox.updateMany.mock.calls[1][0].where).toEqual({ workspaceId: 'w1', domainId: 'd1', billedThrough: null });
    await expect(setChargingStart({ workspaceId: 'w1', userId: 'u1', scope: { mailboxId: 'a' }, date: d('2099-01-01') })).rejects.toMatchObject({ code: 'DATE_INVALID' });
  });

  it('marks addresses as paid up to a day, forward only and never in the future', async () => {
    m.prisma.mailBillingMailbox.updateMany.mockResolvedValue({ count: 3 });
    expect(await markCollectedThrough({ workspaceId: 'w1', userId: 'u1', scope: { clientId: 'c1' }, date: d('2026-01-31'), now: NOW })).toBe(3);
    expect(m.prisma.mailBillingMailbox.updateMany).toHaveBeenCalledWith({ where: { workspaceId: 'w1', domain: { clientId: 'c1' }, OR: [{ billedThrough: null }, { billedThrough: { lt: d('2026-01-31') } }] }, data: { billedThrough: d('2026-01-31') } });
    await expect(markCollectedThrough({ workspaceId: 'w1', userId: 'u1', scope: { clientId: 'c1' }, date: d('2026-03-01'), now: NOW })).rejects.toBeInstanceOf(CollectionError);
  });
});
