import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const m = vi.hoisted(() => ({
  guard: vi.fn(), perms: vi.fn(), rate: vi.fn(),
  collect: vi.fn(), recover: vi.fn(), undo: vi.fn(), later: vi.fn(), statement: vi.fn(), balances: vi.fn(), start: vi.fn(), through: vi.fn(),
}));
vi.mock('@/app/api/email-billing/_lib/auth', () => ({ requireEmailBilling: m.guard }));
vi.mock('@/lib/rbac', () => ({ checkPermissionsSilent: m.perms }));
vi.mock('@/lib/route-rate-limit', () => ({ enforceRouteRateLimit: m.rate }));
vi.mock('@/lib/email-billing/collections', async (orig) => ({
  ...(await orig<typeof import('@/lib/email-billing/collections')>()),
  collectFromClient: m.collect, recoverCollection: m.recover, undoCollection: m.undo, recordCollectionPaymentLater: m.later,
  buildStatement: m.statement, listBalances: m.balances, setChargingStart: m.start, markCollectedThrough: m.through,
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/invoice/finalize-draft', () => ({ finalizeInvoiceFromDraft: vi.fn() }));
vi.mock('@/lib/invoice/generation-context', () => ({ InvoiceValidationError: class extends Error {} }));
vi.mock('@/lib/invoices/payments', () => ({ recordInvoicePayment: vi.fn() }));
vi.mock('@/lib/invoices/void', () => ({ voidInvoice: vi.fn() }));

import { GET as BALANCES } from '@/app/api/email-billing/collections/balances/route';
import { GET as STATEMENT } from '@/app/api/email-billing/collections/clients/[clientId]/statement/route';
import { POST as COLLECT } from '@/app/api/email-billing/collections/clients/[clientId]/collect/route';
import { POST as PAYMENT } from '@/app/api/email-billing/collections/[id]/payment/route';
import { POST as RECOVER } from '@/app/api/email-billing/collections/[id]/recover/route';
import { POST as UNDO } from '@/app/api/email-billing/collections/[id]/undo/route';
import { POST as DATES } from '@/app/api/email-billing/collections/dates/route';
import { CollectionError } from '@/lib/email-billing/collections';

const ok = { userId: 'u1', workspaceId: 'w1' };
const req = (body: unknown, url = 'http://x') => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const p = <T,>(v: T) => ({ params: Promise.resolve(v) });
const allow = (keys: string[]) => m.perms.mockImplementation(async (_u: string, _w: string, needed: string[]) => Object.fromEntries(needed.map((k) => [k, keys.includes(k)])));

beforeEach(() => {
  vi.clearAllMocks();
  m.guard.mockResolvedValue(ok);
  m.rate.mockResolvedValue({ ok: true });
  allow(['invoices.create', 'invoices.edit', 'invoices.delete']);
  m.collect.mockResolvedValue({ collectionId: 'col1', status: 'INVOICED', total: 200 });
});

describe('collect route', () => {
  const collect = (body: unknown = {}) => COLLECT(req(body), p({ clientId: 'c1' }));

  it('needs billing access plus permission to create invoices, and also to record payments when a payment is included', async () => {
    allow([]);
    expect((await collect()).status).toBe(403);
    allow(['invoices.create']);
    expect((await collect()).status).toBe(201);
    expect((await collect({ payment: { method: 'CASH' } })).status).toBe(403);
    expect(m.collect).toHaveBeenCalledTimes(1);
    allow(['invoices.create', 'invoices.edit']);
    expect((await collect({ payment: { method: 'CASH' } })).status).toBe(201);
    expect(m.guard).toHaveBeenCalledWith('billing', { legacy: 'invoices.create' });
  });

  it('passes the day, currency, idempotency key and payment through, and never caches the answer', async () => {
    const res = await collect({ asOf: '2026-02-09', currency: 'inr', idempotencyKey: 'key-12345678', expectedTotal: 200, payment: { method: 'UPI', reference: 'r1' } });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(m.collect).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', userId: 'u1', clientId: 'c1', asOf: new Date('2026-02-09'), currency: 'INR', idempotencyKey: 'key-12345678', expectedTotal: 200, payment: { method: 'UPI', reference: 'r1' } }));
  });

  it('rejects bad input before doing anything', async () => {
    for (const body of [{ asOf: 'tomorrowish' }, { payment: { method: 'BITCOIN' } }, { idempotencyKey: 'x' }, { currency: 'rupees' }]) expect((await collect(body)).status).toBe(400);
    expect(m.collect).not.toHaveBeenCalled();
  });

  it('is rate limited, and maps rule errors to their status without leaking unexpected ones', async () => {
    m.rate.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'slow' }, { status: 429 }) });
    expect((await collect()).status).toBe(429);
    m.rate.mockResolvedValue({ ok: true });
    m.collect.mockRejectedValueOnce(new CollectionError('Nothing has built up.', 409, 'NOTHING_TO_COLLECT'));
    const res = await collect();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Nothing has built up.', code: 'NOTHING_TO_COLLECT' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.collect.mockRejectedValueOnce(new Error('connection string postgres://secret'));
    const boom = await collect();
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toContain('secret');
    spy.mockRestore();
  });
});

describe('payment, recover and undo routes', () => {
  it('payment needs invoices.edit', async () => {
    allow(['invoices.create']);
    expect((await PAYMENT(req({ method: 'CASH' }), p({ id: 'col1' }))).status).toBe(403);
    allow(['invoices.edit']);
    m.later.mockResolvedValue({ ok: true, paymentId: 'pay1' });
    expect((await PAYMENT(req({ method: 'CASH' }), p({ id: 'col1' }))).status).toBe(201);
    expect((await PAYMENT(req({ method: 'GOLD' }), p({ id: 'col1' }))).status).toBe(400);
  });

  it('recover needs invoices.create; undo needs invoices.delete and a reason', async () => {
    allow(['invoices.edit']);
    expect((await RECOVER(req({}), p({ id: 'col1' }))).status).toBe(403);
    allow(['invoices.create']);
    m.recover.mockResolvedValue({ collectionId: 'col1' });
    expect((await RECOVER(req({}), p({ id: 'col1' }))).status).toBe(200);

    allow(['invoices.create']);
    expect((await UNDO(req({ reason: 'Wrong client' }), p({ id: 'col1' }))).status).toBe(403);
    allow(['invoices.delete']);
    expect((await UNDO(req({ reason: 'x' }), p({ id: 'col1' }))).status).toBe(400);
    m.undo.mockResolvedValue({ creditNoteNumber: 'CN-1' });
    expect(await (await UNDO(req({ reason: 'Wrong client' }), p({ id: 'col1' }))).json()).toEqual({ creditNoteNumber: 'CN-1' });
    m.undo.mockRejectedValueOnce(new CollectionError('A later collection exists.', 409, 'NOT_LATEST'));
    expect((await UNDO(req({ reason: 'Wrong client' }), p({ id: 'col1' }))).status).toBe(409);
  });
});

describe('read routes and opening dates', () => {
  it('balances and statements are read-only and reject an invalid date', async () => {
    m.balances.mockResolvedValue({ rows: [] });
    m.statement.mockResolvedValue({ clientId: 'c1' });
    expect((await BALANCES(new NextRequest('http://x/b?asOf=2026-02-09'))).status).toBe(200);
    expect(m.guard).toHaveBeenLastCalledWith('view');
    expect(m.balances).toHaveBeenCalledWith('w1', new Date('2026-02-09'));
    expect((await BALANCES(new NextRequest('http://x/b?asOf=nope'))).status).toBe(400);
    expect((await STATEMENT(new NextRequest('http://x/s?asOf=2026-02-09'), p({ clientId: 'c1' }))).status).toBe(200);
    expect((await STATEMENT(new NextRequest('http://x/s?asOf=nope'), p({ clientId: 'c1' }))).status).toBe(400);
  });

  it('opening dates call the right operation for the right scope', async () => {
    m.start.mockResolvedValue(4);
    m.through.mockResolvedValue(2);
    expect(await (await DATES(req({ kind: 'chargingStart', scope: { clientId: 'c1' }, date: '2025-06-01' }))).json()).toEqual({ changed: 4 });
    expect(m.start).toHaveBeenCalledWith({ workspaceId: 'w1', userId: 'u1', scope: { clientId: 'c1' }, date: new Date('2025-06-01') });
    expect(await (await DATES(req({ kind: 'collectedThrough', scope: { domainId: 'd1' }, date: '2026-01-31' }))).json()).toEqual({ changed: 2 });
    expect((await DATES(req({ kind: 'chargingStart', scope: {}, date: '2025-06-01' }))).status).toBe(400);
    expect((await DATES(req({ kind: 'later', scope: { clientId: 'c1' }, date: '2025-06-01' }))).status).toBe(400);
  });
});
