import 'server-only';
import { format } from 'date-fns';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decimalToNumber, sumMoney, toDecimal } from '@/lib/money';
import { logActivity } from '@/lib/security/activity-log';
import { finalizeInvoiceFromDraft } from '@/lib/invoice/finalize-draft';
import { InvoiceValidationError } from '@/lib/invoice/generation-context';
import { recordInvoicePayment } from '@/lib/invoices/payments';
import { voidInvoice } from '@/lib/invoices/void';
import type { PaymentMethodValue } from '@/lib/invoices/types';
import { accrueAddress, monthlyRate } from './accrual';
import { utcDay } from './usage-math';

export class CollectionError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'COLLECTION_ERROR') {
    super(message);
    this.name = 'CollectionError';
  }
}

const DAY_MS = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);

export type StatementLine = {
  mailboxId: string; email: string; domainId: string; domain: string;
  firstDay: string; lastDay: string; previousBilledThrough: string | null; months: number; amount: number;
};
export type DomainStatement = { domainId: string; domain: string; addresses: number; firstDay: string; lastDay: string; subtotal: number; lines: StatementLine[] };
export type CurrencyStatement = { currency: string; total: number; addresses: number; domains: DomainStatement[] };
export type ClientStatement = {
  clientId: string; clientName: string; asOf: string; currencies: CurrencyStatement[];
  /** Domains of this client that cannot be charged because they have no plan yet. */
  unrated: Array<{ domainId: string; domain: string }>;
};

const domainInclude = {
  subscriptions: { select: { billingStatus: true, cancelledAt: true, basePriceSnapshot: true, currencySnapshot: true, plan: { select: { frequency: true } } }, take: 1 },
  mailboxes: { select: { id: true, email: true, billingStartsOn: true, billedThrough: true, archivedAt: true } },
} satisfies Prisma.MailBillingDomainInclude;
type DomainForStatement = Prisma.MailBillingDomainGetPayload<{ include: typeof domainInclude }>;

/** The charges that have built up for the domains of one client (or all clients) as of a day, per address. */
function statementsFor(domains: DomainForStatement[], asOf: Date): { byDomain: Array<DomainStatement & { currency: string }>; unrated: Array<{ domainId: string; domain: string }> } {
  const byDomain: Array<DomainStatement & { currency: string }> = [];
  const unrated: Array<{ domainId: string; domain: string }> = [];
  for (const domain of domains) {
    const sub = domain.subscriptions[0];
    if (!sub) { unrated.push({ domainId: domain.id, domain: domain.domain }); continue; }
    const rate = monthlyRate(sub.basePriceSnapshot, sub.plan?.frequency ?? 'MONTHLY');
    const lines: StatementLine[] = [];
    for (const mailbox of domain.mailboxes) {
      // Service stops on whichever came first: the address being removed, the domain being removed, or the plan being cancelled.
      const ends = [mailbox.archivedAt, domain.status === 'REMOVED' ? domain.archivedAt : null, sub.billingStatus === 'CANCELLED' ? sub.cancelledAt : null].filter((d): d is Date => Boolean(d));
      const endsBefore = ends.length ? new Date(Math.min(...ends.map((d) => d.getTime()))) : null;
      const period = accrueAddress({ billingStartsOn: mailbox.billingStartsOn, billedThrough: mailbox.billedThrough, asOf, endsBefore, monthlyRate: rate });
      if (!period || period.amount <= 0) continue;
      lines.push({
        mailboxId: mailbox.id, email: mailbox.email, domainId: domain.id, domain: domain.domain, firstDay: iso(period.firstDay), lastDay: iso(period.lastDay),
        previousBilledThrough: mailbox.billedThrough ? iso(mailbox.billedThrough) : null, months: Math.round(period.months * 10000) / 10000, amount: period.amount,
      });
    }
    if (lines.length === 0) continue;
    lines.sort((a, b) => a.email.localeCompare(b.email));
    byDomain.push({
      domainId: domain.id, domain: domain.domain, currency: sub.currencySnapshot, addresses: lines.length,
      firstDay: lines.map((l) => l.firstDay).sort()[0], lastDay: lines.map((l) => l.lastDay).sort().at(-1)!,
      subtotal: decimalToNumber(sumMoney(lines.map((l) => l.amount))), lines,
    });
  }
  return { byDomain, unrated };
}

const groupByCurrency = (domains: Array<DomainStatement & { currency: string }>): CurrencyStatement[] => {
  const map = new Map<string, Array<DomainStatement & { currency: string }>>();
  for (const d of domains) map.set(d.currency, [...(map.get(d.currency) ?? []), d]);
  return [...map].map(([currency, list]) => ({
    currency, addresses: list.reduce((n, d) => n + d.addresses, 0), total: decimalToNumber(sumMoney(list.map((d) => d.subtotal))),
    domains: list.map(({ currency: _c, ...rest }) => rest).sort((a, b) => a.domain.localeCompare(b.domain)),
  }));
};

/** Everything one client owes as of `asOf` (the last day charged, inclusive), by domain and by address. */
export async function buildStatement(workspaceId: string, clientId: string, asOf: Date): Promise<ClientStatement> {
  const client = await prisma.client.findFirst({ where: { id: clientId, workspaceId }, select: { id: true, name: true } });
  if (!client) throw new CollectionError('Client not found.', 404, 'CLIENT_NOT_FOUND');
  const domains = await prisma.mailBillingDomain.findMany({ where: { workspaceId, clientId, status: { not: 'IGNORED' } }, include: domainInclude, orderBy: { domain: 'asc' } });
  const { byDomain, unrated } = statementsFor(domains, utcDay(asOf));
  return { clientId: client.id, clientName: client.name, asOf: iso(utcDay(asOf)), currencies: groupByCurrency(byDomain), unrated };
}

export type BalanceRow = {
  clientId: string; clientName: string; currency: string; owed: number; addresses: number; domains: number;
  oldestUnchargedDay: string; lastCollectedOn: string | null; openInvoices: number; openInvoiceAmount: number;
};

/** What every client owes as of a day, biggest first. This is the list the owner takes on a collection round. */
export async function listBalances(workspaceId: string, asOf: Date): Promise<{ asOf: string; rows: BalanceRow[]; totals: Array<{ currency: string; owed: number }> }> {
  const domains = await prisma.mailBillingDomain.findMany({
    where: { workspaceId, clientId: { not: null }, status: { not: 'IGNORED' }, subscriptions: { some: {} } },
    include: { ...domainInclude, client: { select: { id: true, name: true } } },
  });
  const day = utcDay(asOf);
  const perClient = new Map<string, { name: string; domains: DomainForStatement[] }>();
  for (const d of domains) {
    if (!d.client) continue;
    const entry = perClient.get(d.client.id) ?? { name: d.client.name, domains: [] };
    entry.domains.push(d);
    perClient.set(d.client.id, entry);
  }
  const clientIds = [...perClient.keys()];
  const [collected, openInvoices] = await Promise.all([
    prisma.mailCollection.groupBy({ by: ['clientId'], where: { workspaceId, clientId: { in: clientIds }, status: 'INVOICED' }, _max: { asOf: true } }),
    prisma.invoice.findMany({ where: { workspaceId, clientId: { in: clientIds }, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, mailCollections: { some: { status: 'INVOICED' } } }, select: { clientId: true, grandTotal: true } }),
  ]);
  const lastBy = new Map(collected.map((c) => [c.clientId, c._max.asOf]));
  const openBy = new Map<string, { n: number; sum: Prisma.Decimal }>();
  for (const inv of openInvoices) {
    if (!inv.clientId) continue;
    const cur = openBy.get(inv.clientId) ?? { n: 0, sum: new Prisma.Decimal(0) };
    openBy.set(inv.clientId, { n: cur.n + 1, sum: cur.sum.plus(toDecimal(inv.grandTotal)) });
  }

  const rows: BalanceRow[] = [];
  for (const [clientId, { name, domains: list }] of perClient) {
    const { byDomain } = statementsFor(list, day);
    for (const group of groupByCurrency(byDomain)) {
      const open = openBy.get(clientId);
      rows.push({
        clientId, clientName: name, currency: group.currency, owed: group.total, addresses: group.addresses, domains: group.domains.length,
        oldestUnchargedDay: group.domains.map((d) => d.firstDay).sort()[0], lastCollectedOn: lastBy.get(clientId) ? iso(lastBy.get(clientId)!) : null,
        openInvoices: open?.n ?? 0, openInvoiceAmount: open ? decimalToNumber(open.sum) : 0,
      });
    }
    // Clients with open collection invoices but nothing new owed still show, so unpaid ones are not forgotten.
    if (!byDomain.length && openBy.get(clientId)) {
      const open = openBy.get(clientId)!;
      rows.push({ clientId, clientName: name, currency: list[0].subscriptions[0]?.currencySnapshot ?? 'INR', owed: 0, addresses: 0, domains: 0, oldestUnchargedDay: iso(day), lastCollectedOn: lastBy.get(clientId) ? iso(lastBy.get(clientId)!) : null, openInvoices: open.n, openInvoiceAmount: decimalToNumber(open.sum) });
    }
  }
  rows.sort((a, b) => b.owed - a.owed || a.clientName.localeCompare(b.clientName));
  const totals = [...new Set(rows.map((r) => r.currency))].map((currency) => ({ currency, owed: decimalToNumber(sumMoney(rows.filter((r) => r.currency === currency).map((r) => r.owed))) }));
  return { asOf: iso(day), rows, totals };
}

// ---------------------------------------------------------------------------------------------------------------------
// Collecting

type StoredLine = StatementLine;

/** Invoice lines: one per domain, so a client with many addresses still gets a short, readable invoice. */
export function invoiceServices(lines: StoredLine[]): Array<{ title: string; amount: number }> {
  const byDomain = new Map<string, StoredLine[]>();
  for (const l of lines) byDomain.set(l.domain, [...(byDomain.get(l.domain) ?? []), l]);
  const fmt = (day: string) => format(new Date(`${day}T00:00:00Z`), 'd MMM yyyy');
  return [...byDomain].sort(([a], [b]) => a.localeCompare(b)).map(([domain, list]) => {
    const first = list.map((l) => l.firstDay).sort()[0];
    const last = list.map((l) => l.lastDay).sort().at(-1)!;
    // The invoice engine limits a line title to 200 characters; a very long domain name must not stop a collection.
    const tail = `: ${list.length} address${list.length === 1 ? '' : 'es'}, ${fmt(first)} to ${fmt(last)}`;
    const head = `Email hosting for ${domain}`;
    return { title: `${head.slice(0, Math.max(10, 200 - tail.length))}${tail}`, amount: decimalToNumber(sumMoney(list.map((l) => l.amount))) };
  });
}

async function createInvoice(args: { workspaceId: string; userId: string | null; clientId: string; currency: string; lines: StoredLine[]; asOf: string; now: Date }) {
  const created = await finalizeInvoiceFromDraft({
    workspaceId: args.workspaceId, actorId: args.userId,
    draftInput: {
      clientId: args.clientId, billingMonth: format(args.now, 'MMMM yyyy'), customDate: args.now.toISOString(), sendEmail: false, status: 'PENDING', currency: args.currency,
      services: invoiceServices(args.lines),
    },
    draftPaymentLink: { url: null, linkId: null, gateway: null },
  });
  return created.invoice as { id: string; invoiceNumber: string; grandTotal: Prisma.Decimal | number | string; subtotal: Prisma.Decimal | number | string };
}

/** Groups lines that share the same previous/new date, so thousands of addresses are updated in a few statements. */
const dateGroups = (lines: StoredLine[]) => {
  const groups = new Map<string, { previous: string | null; last: string; ids: string[] }>();
  for (const l of lines) {
    const key = `${l.previousBilledThrough}|${l.lastDay}`;
    const g = groups.get(key) ?? { previous: l.previousBilledThrough, last: l.lastDay, ids: [] };
    g.ids.push(l.mailboxId);
    groups.set(key, g);
  }
  return [...groups.values()];
};
const asDate = (day: string | null) => (day ? new Date(`${day}T00:00:00.000Z`) : null);

/** Moves addresses from one charged-through date to another, but only if they are still at the expected one. */
async function moveChargedThrough(tx: Prisma.TransactionClient, workspaceId: string, lines: StoredLine[], direction: 'forward' | 'back'): Promise<boolean> {
  for (const g of dateGroups(lines)) {
    const from = direction === 'forward' ? asDate(g.previous) : asDate(g.last);
    const to = direction === 'forward' ? asDate(g.last) : asDate(g.previous);
    const res = await tx.mailBillingMailbox.updateMany({ where: { id: { in: g.ids }, workspaceId, billedThrough: from }, data: { billedThrough: to } });
    if (res.count !== g.ids.length) return false;
  }
  return true;
}

export type CollectionOutcome = {
  collectionId: string; status: string; total: number; currency: string;
  invoice: { id: string; invoiceNumber: string; total: number } | null;
  payment: { ok: true; paymentId: string } | { ok: false; message: string } | null;
};

/**
 * Collects what a client owes as of a day. In order, so that no failure can charge twice:
 *  1. one transaction records the collection and moves every included address's "charged through" date (only if it has not
 *     changed since the statement, so two people collecting at once cannot both take it);
 *  2. the invoice is created through the normal invoice engine (tax, numbering, PDF); if that fails the dates are put back;
 *  3. the collection is linked to its invoice, and, if asked, the payment is recorded.
 * A crash between 1 and 3 leaves a collection marked INVOICING that `recoverCollection` finishes.
 */
export async function collectFromClient(args: {
  workspaceId: string; userId: string; clientId: string; asOf: Date; currency?: string; idempotencyKey?: string;
  /** The total the person saw and confirmed. If the amount has changed since, nothing is charged. */
  expectedTotal?: number;
  payment?: { method: PaymentMethodValue; reference?: string | null; notes?: string | null }; now?: Date;
}): Promise<CollectionOutcome> {
  const now = args.now ?? new Date();
  const today = utcDay(now);
  const asOf = utcDay(args.asOf);
  if (asOf.getTime() > today.getTime()) throw new CollectionError('You can only collect up to today. Pick today or an earlier date.', 400, 'DATE_IN_FUTURE');

  if (args.idempotencyKey) {
    const repeated = await prisma.mailCollection.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: args.workspaceId, idempotencyKey: args.idempotencyKey } } });
    if (repeated) return outcomeOf(repeated.id);
  }
  const pending = await prisma.mailCollection.findFirst({ where: { workspaceId: args.workspaceId, clientId: args.clientId, status: 'INVOICING' }, select: { id: true } });
  if (pending) throw new CollectionError('An earlier collection for this client did not finish. Finish it first.', 409, 'COLLECTION_PENDING');

  const workspace = await prisma.workspace.findUnique({ where: { id: args.workspaceId }, select: { baseCurrency: true } });
  const statement = await buildStatement(args.workspaceId, args.clientId, asOf);
  if (statement.currencies.length === 0) throw new CollectionError('Nothing has built up for this client up to that date.', 409, 'NOTHING_TO_COLLECT');
  if (statement.currencies.length > 1 && !args.currency) throw new CollectionError(`This client is charged in ${statement.currencies.map((c) => c.currency).join(' and ')}. Collect one currency at a time.`, 409, 'CURRENCY_REQUIRED');
  const group = statement.currencies.find((c) => c.currency === (args.currency ?? statement.currencies[0].currency));
  if (!group) throw new CollectionError('Nothing has built up in that currency.', 409, 'NOTHING_TO_COLLECT');
  if (group.total <= 0) throw new CollectionError('Nothing has built up for this client up to that date.', 409, 'NOTHING_TO_COLLECT');
  if (args.expectedTotal !== undefined && toDecimal(args.expectedTotal).toDecimalPlaces(2).comparedTo(toDecimal(group.total).toDecimalPlaces(2)) !== 0) {
    throw new CollectionError(`The amount changed since you looked at it (it was ${args.expectedTotal.toFixed(2)}, it is now ${group.total.toFixed(2)}). Review the statement and collect again.`, 409, 'AMOUNT_CHANGED');
  }
  if (workspace && group.currency !== workspace.baseCurrency) throw new CollectionError(`Collections are invoiced in your base currency (${workspace.baseCurrency}); this plan is priced in ${group.currency}.`, 409, 'CURRENCY_UNSUPPORTED');

  const lines = group.domains.flatMap((d) => d.lines);
  let collectionId: string;
  try {
    collectionId = await prisma.$transaction(async (tx) => {
      const created = await tx.mailCollection.create({
        data: {
          workspaceId: args.workspaceId, clientId: args.clientId, asOf, currency: group.currency, total: toDecimal(group.total).toDecimalPlaces(2), status: 'INVOICING',
          linesJson: lines as unknown as Prisma.InputJsonValue, idempotencyKey: args.idempotencyKey ?? null, createdByUserId: args.userId,
        },
        select: { id: true },
      });
      if (!(await moveChargedThrough(tx, args.workspaceId, lines, 'forward'))) throw new CollectionError('Something changed while collecting (another collection or an edit). Review the statement and try again.', 409, 'CHANGED_CONCURRENTLY');
      return created.id;
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && args.idempotencyKey) {
      const raced = await prisma.mailCollection.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: args.workspaceId, idempotencyKey: args.idempotencyKey } }, select: { id: true } });
      if (raced) return outcomeOf(raced.id);
    }
    throw error;
  }

  let invoice;
  try {
    invoice = await createInvoice({ workspaceId: args.workspaceId, userId: args.userId, clientId: args.clientId, currency: group.currency, lines, asOf: iso(asOf), now });
  } catch (error) {
    // The invoice was not created: put the dates back and mark the collection void, so nothing is left half-charged.
    await prisma.$transaction(async (tx) => {
      await moveChargedThrough(tx, args.workspaceId, lines, 'back');
      await tx.mailCollection.update({ where: { id: collectionId }, data: { status: 'VOID', completedAt: new Date() } });
    }).catch((e) => console.error('Collection rollback failed; finish or undo it from the client page:', collectionId, e));
    console.error('Collection invoice failed:', collectionId, error);
    // The invoice engine's own messages (missing business profile, plan limit, ...) are written for the user, so they are shown as they are.
    throw new CollectionError(error instanceof InvoiceValidationError ? `${error.message} Nothing was charged.` : 'The invoice could not be created, so nothing was charged. Try again.', error instanceof InvoiceValidationError ? 422 : 502, 'INVOICE_FAILED');
  }
  await prisma.mailCollection.update({ where: { id: collectionId }, data: { invoiceId: invoice.id, status: 'INVOICED', completedAt: new Date() } });

  let payment: CollectionOutcome['payment'] = null;
  if (args.payment) payment = await recordCollectionPayment({ workspaceId: args.workspaceId, userId: args.userId, collectionId, invoice, payment: args.payment, now });
  void logActivity({
    workspaceId: args.workspaceId, action: 'email_billing.collection_created', status: 'SUCCESS', actor: { userId: args.userId, email: null },
    entity: { type: 'mail_collection', id: collectionId }, metadata: { clientId: args.clientId, asOf: iso(asOf), total: group.total, currency: group.currency, addresses: lines.length, invoiceId: invoice.id, paid: payment?.ok === true },
  });
  return { collectionId, status: 'INVOICED', total: group.total, currency: group.currency, invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, total: decimalToNumber(toDecimal(invoice.grandTotal)) }, payment };
}

async function recordCollectionPayment(args: { workspaceId: string; userId: string; collectionId: string; invoice: { id: string; grandTotal: Prisma.Decimal | number | string }; payment: { method: PaymentMethodValue; reference?: string | null; notes?: string | null }; now: Date }) {
  const result = await recordInvoicePayment({
    workspaceId: args.workspaceId, userId: args.userId, invoiceId: args.invoice.id, amount: toDecimal(args.invoice.grandTotal).toFixed(2), receivedAt: args.now,
    method: args.payment.method, reference: args.payment.reference ?? null, notes: args.payment.notes ?? 'Collected in person', idempotencyKey: `mail-collection-${args.collectionId}`,
  });
  return result.ok ? ({ ok: true, paymentId: result.paymentId } as const) : ({ ok: false, message: result.message } as const);
}

async function outcomeOf(collectionId: string): Promise<CollectionOutcome> {
  const c = await prisma.mailCollection.findUniqueOrThrow({ where: { id: collectionId }, include: { invoice: { select: { id: true, invoiceNumber: true, grandTotal: true } } } });
  return {
    collectionId: c.id, status: c.status, total: decimalToNumber(c.total), currency: c.currency, payment: null,
    invoice: c.invoice ? { id: c.invoice.id, invoiceNumber: c.invoice.invoiceNumber, total: decimalToNumber(c.invoice.grandTotal) } : null,
  };
}

/**
 * Finishes a collection that was recorded but not linked to an invoice (a crash, or a failed rollback). It first looks for the
 * invoice that may already have been created, so the client is never invoiced twice; only if none exists is one created.
 */
export async function recoverCollection(args: { workspaceId: string; userId: string; collectionId: string; now?: Date }): Promise<CollectionOutcome> {
  const now = args.now ?? new Date();
  const c = await prisma.mailCollection.findFirst({ where: { id: args.collectionId, workspaceId: args.workspaceId } });
  if (!c) throw new CollectionError('Collection not found.', 404, 'NOT_FOUND');
  if (c.status !== 'INVOICING') throw new CollectionError('This collection is already finished.', 409, 'ALREADY_FINISHED');
  const lines = c.linesJson as unknown as StoredLine[];
  const existing = await prisma.invoice.findMany({
    where: { workspaceId: args.workspaceId, clientId: c.clientId, createdAt: { gte: c.createdAt }, status: { not: 'VOID' }, subtotal: c.total, mailCollections: { none: {} } },
    select: { id: true, invoiceNumber: true, grandTotal: true, subtotal: true }, take: 2,
  });
  const invoice = existing.length === 1 ? existing[0] : existing.length === 0
    ? await createInvoice({ workspaceId: args.workspaceId, userId: args.userId, clientId: c.clientId, currency: c.currency, lines, asOf: iso(c.asOf), now })
    : null;
  if (!invoice) throw new CollectionError('More than one invoice could belong to this collection. Link the right one by hand.', 409, 'AMBIGUOUS');
  await prisma.mailCollection.update({ where: { id: c.id }, data: { invoiceId: invoice.id, status: 'INVOICED', completedAt: new Date() } });
  void logActivity({ workspaceId: args.workspaceId, action: 'email_billing.collection_recovered', status: 'SUCCESS', actor: { userId: args.userId, email: null }, entity: { type: 'mail_collection', id: c.id }, metadata: { invoiceId: invoice.id, reused: existing.length === 1 } });
  return outcomeOf(c.id);
}

/** Records the payment for a collection's invoice (when the money arrives after the collection was made). */
export async function recordCollectionPaymentLater(args: { workspaceId: string; userId: string; collectionId: string; payment: { method: PaymentMethodValue; reference?: string | null; notes?: string | null }; now?: Date }) {
  const c = await prisma.mailCollection.findFirst({ where: { id: args.collectionId, workspaceId: args.workspaceId }, include: { invoice: { select: { id: true, grandTotal: true, status: true } } } });
  if (!c?.invoice) throw new CollectionError('This collection has no invoice yet.', 409, 'NO_INVOICE');
  if (c.invoice.status === 'PAID' || c.invoice.status === 'VOID') throw new CollectionError(`This invoice is already ${c.invoice.status.toLowerCase()}.`, 409, 'NOT_PAYABLE');
  const result = await recordCollectionPayment({ workspaceId: args.workspaceId, userId: args.userId, collectionId: c.id, invoice: c.invoice, payment: args.payment, now: args.now ?? new Date() });
  if (!result.ok) throw new CollectionError(result.message, 400, 'PAYMENT_FAILED');
  return result;
}

/**
 * Undoes the client's latest collection: voids its invoice (refused if money was recorded against it) and gives the days back,
 * so the next collection charges them again. Only the latest collection can be undone, and only while no address was
 * changed afterwards, otherwise days would be skipped or counted twice.
 */
export async function undoCollection(args: { workspaceId: string; userId: string; collectionId: string; reason: string }) {
  const c = await prisma.mailCollection.findFirst({ where: { id: args.collectionId, workspaceId: args.workspaceId } });
  if (!c) throw new CollectionError('Collection not found.', 404, 'NOT_FOUND');
  if (c.status !== 'INVOICED' || !c.invoiceId) throw new CollectionError('Only a finished collection can be undone.', 409, 'NOT_UNDOABLE');
  const later = await prisma.mailCollection.findFirst({ where: { workspaceId: args.workspaceId, clientId: c.clientId, status: { not: 'VOID' }, createdAt: { gt: c.createdAt } }, select: { id: true } });
  if (later) throw new CollectionError('A later collection exists for this client. Undo that one first.', 409, 'NOT_LATEST');
  const lines = c.linesJson as unknown as StoredLine[];
  // Check the days can be given back before voiding anything.
  for (const g of dateGroups(lines)) {
    const still = await prisma.mailBillingMailbox.count({ where: { id: { in: g.ids }, workspaceId: args.workspaceId, billedThrough: asDate(g.last) } });
    if (still !== g.ids.length) throw new CollectionError('Some addresses were changed after this collection, so it cannot be undone safely.', 409, 'CHANGED_AFTER');
  }
  const voided = await voidInvoice({ workspaceId: args.workspaceId, userId: args.userId, invoiceId: c.invoiceId, reason: args.reason });
  if (!voided.ok) throw new CollectionError(voided.message, voided.status === 409 ? 409 : 400, voided.code);
  await prisma.$transaction(async (tx) => {
    if (!(await moveChargedThrough(tx, args.workspaceId, lines, 'back'))) throw new CollectionError('Some addresses changed while undoing. Try again.', 409, 'CHANGED_CONCURRENTLY');
    await tx.mailCollection.update({ where: { id: c.id }, data: { status: 'VOID', completedAt: new Date() } });
  }, { timeout: 60_000 });
  void logActivity({ workspaceId: args.workspaceId, action: 'email_billing.collection_undone', status: 'SUCCESS', actor: { userId: args.userId, email: null }, entity: { type: 'mail_collection', id: c.id }, metadata: { invoiceId: c.invoiceId, creditNote: voided.creditNoteNumber } });
  return { creditNoteNumber: voided.creditNoteNumber };
}

// ---------------------------------------------------------------------------------------------------------------------
// Opening position for addresses that existed before the ERP

export type DateScope = { clientId: string } | { domainId: string } | { mailboxId: string };
const scopeWhere = (workspaceId: string, scope: DateScope): Prisma.MailBillingMailboxWhereInput =>
  'mailboxId' in scope ? { workspaceId, id: scope.mailboxId } : 'domainId' in scope ? { workspaceId, domainId: scope.domainId } : { workspaceId, domain: { clientId: scope.clientId } };

/** Sets the first day charged, for addresses nothing has been collected from yet. Returns how many were changed. */
export async function setChargingStart(args: { workspaceId: string; userId: string; scope: DateScope; date: Date }): Promise<number> {
  const day = utcDay(args.date);
  if (day.getTime() > utcDay(new Date()).getTime() + 365 * DAY_MS) throw new CollectionError('That date is too far ahead.', 400, 'DATE_INVALID');
  const res = await prisma.mailBillingMailbox.updateMany({ where: { ...scopeWhere(args.workspaceId, args.scope), billedThrough: null }, data: { billingStartsOn: day } });
  void logActivity({ workspaceId: args.workspaceId, action: 'email_billing.charging_start_set', status: 'SUCCESS', actor: { userId: args.userId, email: null }, entity: { type: 'mail_billing_scope', id: Object.values(args.scope)[0] }, metadata: { scope: Object.keys(args.scope)[0], date: iso(day), addresses: res.count } });
  return res.count;
}

/**
 * Records that addresses were already paid up to a day (collected outside the ERP). Forward only, so a date can never
 * make days be charged twice. Returns how many were changed.
 */
export async function markCollectedThrough(args: { workspaceId: string; userId: string; scope: DateScope; date: Date; now?: Date }): Promise<number> {
  const day = utcDay(args.date);
  if (day.getTime() > utcDay(args.now ?? new Date()).getTime()) throw new CollectionError('Paid-up-to cannot be in the future.', 400, 'DATE_IN_FUTURE');
  const res = await prisma.mailBillingMailbox.updateMany({
    where: { ...scopeWhere(args.workspaceId, args.scope), OR: [{ billedThrough: null }, { billedThrough: { lt: day } }] },
    data: { billedThrough: day },
  });
  void logActivity({ workspaceId: args.workspaceId, action: 'email_billing.collected_through_set', status: 'SUCCESS', actor: { userId: args.userId, email: null }, entity: { type: 'mail_billing_scope', id: Object.values(args.scope)[0] }, metadata: { scope: Object.keys(args.scope)[0], date: iso(day), addresses: res.count } });
  return res.count;
}
