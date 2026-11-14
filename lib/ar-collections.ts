import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { buildDunningEmail } from '@/lib/notifications/transactional-email-templates';
import { logActivity } from '@/lib/security/activity-log';
import { getClientRecipients } from '@/lib/clients/service';
import {
  AGING_BUCKETS, DEFAULT_DUNNING, FOLLOW_UP_STATUSES, bucketOf, daysOverdue as daysOverdueOf, dsoFrom, effectiveDue, nextAction, outstandingBase, priority, riskScore, sanitizeDunning, stageFor, startOfDay, statusView,
  type AgingBucketKey, type DunningConfig, type FollowUpStatus, type NextAction, type Tone,
} from '@/lib/ar/engine';

export { FOLLOW_UP_STATUSES, AGING_BUCKETS };
export type { AgingBucketKey, FollowUpStatus };

const DAY = 86_400_000;
const FOLLOW_UP_SET = new Set<string>(FOLLOW_UP_STATUSES);
export function parseFollowUpStatus(raw: unknown): FollowUpStatus | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return FOLLOW_UP_SET.has(t) ? (t as FollowUpStatus) : null;
}
/** Treats null/undefined/NaN as unset (default 50). Legitimate 0 is preserved. */
export function normalizeRiskScore(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

export type WorkRow = {
  id: string; invoiceNumber: string; clientId: string | null; clientName: string; currency: string;
  invoiceDate: string; dueDate: string; dueIsDerived: boolean; daysOverdue: number; bucket: AgingBucketKey;
  outstanding: number; outstandingOriginal: number; status: string;
  followUpStatus: FollowUpStatus; promiseDate: string | null; nextFollowUpAt: string | null; disputeReason: string | null;
  lastReminderSentAt: string | null; reminders: number; risk: number; riskSource: 'manual' | 'auto'; priority: number; paused: boolean;
  action: { kind: NextAction['kind']; tone?: Tone; date?: string };
};
export type ClientRow = { clientId: string | null; name: string; invoices: number; outstanding: number; overdue: number; oldestDays: number; risk: number; creditLimit: number | null };
export type Filters = { bucket?: AgingBucketKey; q?: string; view?: 'all' | 'actionable' | 'promises' | 'broken' | 'disputed' | 'paused'; clientId?: string };

export type Snapshot = {
  rows: WorkRow[]; truncated: boolean; clients: ClientRow[];
  totals: {
    totalOutstanding: number; current: number; overdueInvoices: number; overdueAmount: number; remindersSentLast7Days: number;
    collectedLast30Days: number; dso: number | null; atRiskAmount: number;
    promisesDue: { count: number; amount: number }; brokenPromises: { count: number; amount: number }; disputed: { count: number; amount: number }; actionable: number;
  };
  buckets: Array<{ key: AgingBucketKey; count: number; amount: number }>;
  workspace: { baseCurrency: string; countryCode: string };
  settings: DunningConfig; smtpReminderReady: boolean;
};

export async function getSettings(workspaceId: string): Promise<DunningConfig> {
  const row = await prisma.workspaceModule.findUnique({ where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'AR_COLLECTIONS' } }, select: { configJson: true } });
  return sanitizeDunning(row?.configJson ?? DEFAULT_DUNNING);
}

export async function saveSettings(workspaceId: string, raw: unknown, actor: { userId: string; email: string | null }): Promise<DunningConfig> {
  const next = sanitizeDunning(raw);
  const row = await prisma.workspaceModule.findUnique({ where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'AR_COLLECTIONS' } }, select: { configJson: true } });
  const cfg = { ...((row?.configJson ?? {}) as Record<string, unknown>), ...next } as Prisma.InputJsonValue;
  await prisma.workspaceModule.upsert({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'AR_COLLECTIONS' } },
    create: { workspaceId, moduleKey: 'AR_COLLECTIONS', isEnabled: true, configJson: cfg }, update: { configJson: cfg },
  });
  void logActivity({ workspaceId, action: 'ar_collections.settings_updated', status: 'SUCCESS', actor: { userId: actor.userId, email: actor.email }, entity: { type: 'workspace', id: workspaceId }, metadata: { settings: next } });
  return next;
}

/** Open invoices, each with its real due date, base-currency balance, risk, status and next best action, newest priorities first. */
export async function getArCollectionsSnapshot(workspaceId: string, filters: Filters = {}): Promise<Snapshot> {
  const now = new Date();
  const [workspace, profile, cfg] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true, countryCode: true } }),
    prisma.businessProfile.findUnique({ where: { workspaceId }, select: { smtpHost: true, smtpUser: true, smtpPassword: true } }),
    getSettings(workspaceId),
  ]);
  const baseCurrency = (workspace?.baseCurrency ?? 'INR').trim() || 'INR';

  const [invoices, behaviors, payments, paid] = await Promise.all([
    prisma.invoice.findMany({
      where: { workspaceId, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
      select: {
        id: true, invoiceNumber: true, clientId: true, clientName: true, currency: true, exchangeRate: true, invoiceDate: true, dueDate: true, paymentTermsDays: true, totalAmount: true, amountReceived: true, status: true,
        followUpStatus: true, promiseDate: true, nextFollowUpAt: true, disputeReason: true, lastReminderSentAt: true, collectionReminders: true, collectionRiskScore: true,
        client: { select: { paymentTermsDays: true, creditLimit: true } },
      },
    }),
    prisma.clientPaymentBehavior.findMany({ where: { workspaceId }, select: { clientId: true, avgDaysToPay: true, lateRate: true, partialPaymentRate: true } }),
    prisma.invoicePayment.findMany({ where: { workspaceId, reversedAt: null, receivedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { amount: true, invoice: { select: { exchangeRate: true } } }, take: 5000 }),
    prisma.invoice.findMany({ where: { workspaceId, status: 'PAID', dateReceived: { gte: new Date(now.getTime() - 90 * DAY) } }, select: { invoiceDate: true, dateReceived: true, totalAmount: true, exchangeRate: true }, take: 2000 }),
  ]);
  const behaviorBy = new Map(behaviors.map((b) => [b.clientId, b]));
  const amountReference = baseCurrency === 'INR' ? 100_000 : 1_000;
  const bigAmount = amountReference * 5;

  const all: WorkRow[] = invoices.map((inv) => {
    const like = {
      invoiceDate: inv.invoiceDate, dueDate: inv.dueDate, paymentTermsDays: inv.paymentTermsDays ?? inv.client?.paymentTermsDays ?? null,
      totalAmount: num(inv.totalAmount), amountReceived: num(inv.amountReceived), exchangeRate: num(inv.exchangeRate) || 1,
      followUpStatus: inv.followUpStatus, promiseDate: inv.promiseDate, nextFollowUpAt: inv.nextFollowUpAt, lastReminderSentAt: inv.lastReminderSentAt, collectionReminders: inv.collectionReminders, collectionRiskScore: inv.collectionRiskScore,
    };
    const due = effectiveDue(like);
    const overdue = daysOverdueOf(due, now);
    const sv = statusView(like, now, cfg);
    const outstanding = outstandingBase(like);
    const risk = riskScore(like, inv.clientId ? (behaviorBy.get(inv.clientId) ?? null) : null, overdue, sv.promiseBroken);
    const act = nextAction(like, sv, overdue, outstanding, cfg, now, bigAmount);
    return {
      id: inv.id, invoiceNumber: inv.invoiceNumber, clientId: inv.clientId, clientName: inv.clientName, currency: (inv.currency ?? baseCurrency) || baseCurrency,
      invoiceDate: inv.invoiceDate.toISOString(), dueDate: due.toISOString(), dueIsDerived: !inv.dueDate, daysOverdue: overdue, bucket: bucketOf(overdue),
      outstanding, outstandingOriginal: Math.max(0, like.totalAmount - like.amountReceived), status: inv.status,
      followUpStatus: sv.status, promiseDate: inv.promiseDate?.toISOString() ?? null, nextFollowUpAt: inv.nextFollowUpAt?.toISOString() ?? null, disputeReason: inv.disputeReason,
      lastReminderSentAt: inv.lastReminderSentAt?.toISOString() ?? null, reminders: inv.collectionReminders, risk: risk.score, riskSource: risk.source,
      priority: priority({ overdue, outstanding, amountReference, risk: risk.score, promiseBroken: sv.promiseBroken, paused: sv.paused, escalated: sv.status === 'ESCALATED' }), paused: sv.paused,
      action: { kind: act.kind, tone: act.kind === 'REMIND' ? act.tone : undefined, date: act.kind === 'WAIT_PROMISE' ? act.date.toISOString() : act.kind === 'SNOOZED' ? act.until.toISOString() : undefined },
    };
  });

  const weekAhead = startOfDay(now).getTime() + 8 * DAY;
  const sum = (rows: WorkRow[]) => ({ count: rows.length, amount: rows.reduce((s, r) => s + r.outstanding, 0) });
  const overdueRows = all.filter((r) => r.daysOverdue > 0);
  const totals: Snapshot['totals'] = {
    totalOutstanding: all.reduce((s, r) => s + r.outstanding, 0),
    current: all.filter((r) => r.daysOverdue <= 0).reduce((s, r) => s + r.outstanding, 0),
    overdueInvoices: overdueRows.length, overdueAmount: overdueRows.reduce((s, r) => s + r.outstanding, 0),
    remindersSentLast7Days: all.filter((r) => r.lastReminderSentAt && new Date(r.lastReminderSentAt).getTime() >= now.getTime() - 7 * DAY).length,
    collectedLast30Days: payments.reduce((s, p) => s + num(p.amount) * (num(p.invoice.exchangeRate) || 1), 0),
    dso: dsoFrom(paid.filter((p) => p.dateReceived).map((p) => ({ invoiceDate: p.invoiceDate, paidAt: p.dateReceived!, amount: num(p.totalAmount) * (num(p.exchangeRate) || 1) }))),
    atRiskAmount: overdueRows.filter((r) => r.risk >= 70).reduce((s, r) => s + r.outstanding, 0),
    promisesDue: sum(all.filter((r) => r.followUpStatus === 'PROMISE_TO_PAY' && r.promiseDate && new Date(r.promiseDate).getTime() < weekAhead)),
    brokenPromises: sum(all.filter((r) => r.followUpStatus === 'PROMISE_BROKEN')),
    disputed: sum(all.filter((r) => r.followUpStatus === 'DISPUTED')),
    actionable: all.filter((r) => r.action.kind === 'REMIND' || r.action.kind === 'CALL' || r.action.kind === 'ESCALATE').length,
  };
  const buckets = AGING_BUCKETS.map((b) => { const rs = all.filter((r) => r.bucket === b.key); return { key: b.key, count: rs.length, amount: rs.reduce((s, r) => s + r.outstanding, 0) }; });

  const byClient = new Map<string, ClientRow>();
  for (const r of all) {
    const key = r.clientId ?? `name:${r.clientName}`;
    const cur = byClient.get(key) ?? { clientId: r.clientId, name: r.clientName, invoices: 0, outstanding: 0, overdue: 0, oldestDays: 0, risk: 0, creditLimit: null };
    cur.invoices += 1; cur.outstanding += r.outstanding; if (r.daysOverdue > 0) cur.overdue += r.outstanding; cur.oldestDays = Math.max(cur.oldestDays, r.daysOverdue); cur.risk = Math.max(cur.risk, r.risk);
    byClient.set(key, cur);
  }
  for (const inv of invoices) if (inv.clientId && inv.client?.creditLimit != null) { const c = byClient.get(inv.clientId); if (c) c.creditLimit = num(inv.client.creditLimit); }
  const clients = [...byClient.values()].sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding).slice(0, 50);

  const q = filters.q?.trim().toLowerCase();
  let rows = all.filter((r) => {
    if (filters.bucket && r.bucket !== filters.bucket) return false;
    if (filters.clientId && r.clientId !== filters.clientId) return false;
    if (q && !`${r.invoiceNumber} ${r.clientName}`.toLowerCase().includes(q)) return false;
    switch (filters.view) {
      case 'actionable': return r.action.kind === 'REMIND' || r.action.kind === 'CALL' || r.action.kind === 'ESCALATE';
      case 'promises': return r.followUpStatus === 'PROMISE_TO_PAY';
      case 'broken': return r.followUpStatus === 'PROMISE_BROKEN';
      case 'disputed': return r.followUpStatus === 'DISPUTED';
      case 'paused': return r.paused;
      default: return true;
    }
  });
  rows.sort((a, b) => b.priority - a.priority || b.outstanding - a.outstanding);
  const truncated = rows.length > 400;
  if (truncated) rows = rows.slice(0, 400);

  return { rows, truncated, clients, totals, buckets, workspace: { baseCurrency, countryCode: (workspace?.countryCode ?? 'IN').trim() || 'IN' }, settings: cfg, smtpReminderReady: Boolean(profile?.smtpHost && profile.smtpUser && profile.smtpPassword) };
}

type Actor = { userId: string | null; email: string | null };
const event = (workspaceId: string, invoiceId: string, type: string, message: string, actor: Actor, metadata?: Record<string, unknown>) =>
  prisma.invoiceEvent.create({ data: { workspaceId, invoiceId, type, message, actorUserId: actor.userId, metadata: metadata ? JSON.stringify(metadata) : null } }).catch(() => null);
const audit = (workspaceId: string, action: string, invoiceId: string, actor: Actor, metadata?: Record<string, unknown>) =>
  void logActivity({ workspaceId, action: `ar_collections.${action}`, status: 'SUCCESS', actor: { userId: actor.userId, email: actor.email }, entity: { type: 'invoice', id: invoiceId }, metadata });

export type ActionResult = { ok: true } | { ok: false; code: string; message: string; status: number };
const fail = (status: number, code: string, message: string): ActionResult => ({ ok: false, status, code, message });

async function openInvoice(workspaceId: string, id: string) {
  return prisma.invoice.findFirst({ where: { id, workspaceId, status: { in: ['PENDING', 'PARTIALLY_PAID'] } }, select: { id: true, invoiceNumber: true } });
}

/** The customer says when they will pay. The date also becomes the invoice's expected payment date, so the cash-flow forecast follows it. */
export async function recordPromise(workspaceId: string, id: string, input: { date: string; note?: string }, actor: Actor): Promise<ActionResult> {
  const inv = await openInvoice(workspaceId, id);
  if (!inv) return fail(404, 'NOT_FOUND', 'Open invoice not found.');
  const d = new Date(input.date);
  const today = startOfDay(new Date());
  if (Number.isNaN(d.getTime()) || d < today || d.getTime() > today.getTime() + 120 * DAY) return fail(422, 'DATE', 'Pick a date from today to 120 days ahead.');
  await prisma.invoice.update({ where: { id }, data: { followUpStatus: 'PROMISE_TO_PAY', promiseDate: d, expectedPaymentDate: d, nextFollowUpAt: null, disputeReason: null } });
  await event(workspaceId, id, 'PROMISE_TO_PAY', `Promised to pay on ${d.toISOString().slice(0, 10)}${input.note ? `: ${input.note.slice(0, 300)}` : ''}`, actor, { date: d.toISOString() });
  audit(workspaceId, 'promise_recorded', id, actor, { date: d.toISOString() });
  return { ok: true };
}

export async function recordDispute(workspaceId: string, id: string, reason: string, actor: Actor): Promise<ActionResult> {
  const inv = await openInvoice(workspaceId, id);
  if (!inv) return fail(404, 'NOT_FOUND', 'Open invoice not found.');
  const r = reason.trim();
  if (r.length < 3 || r.length > 300) return fail(422, 'REASON', 'Describe the dispute in 3 to 300 characters.');
  await prisma.invoice.update({ where: { id }, data: { followUpStatus: 'DISPUTED', disputeReason: r, promiseDate: null } });
  await event(workspaceId, id, 'DISPUTED', `Disputed: ${r}`, actor);
  audit(workspaceId, 'disputed', id, actor);
  return { ok: true };
}

export async function resolveDispute(workspaceId: string, id: string, actor: Actor): Promise<ActionResult> {
  const inv = await openInvoice(workspaceId, id);
  if (!inv) return fail(404, 'NOT_FOUND', 'Open invoice not found.');
  await prisma.invoice.update({ where: { id }, data: { followUpStatus: 'UNTOUCHED', disputeReason: null } });
  await event(workspaceId, id, 'DISPUTE_RESOLVED', 'Dispute resolved', actor);
  audit(workspaceId, 'dispute_resolved', id, actor);
  return { ok: true };
}

export async function addNote(workspaceId: string, id: string, note: string, actor: Actor): Promise<ActionResult> {
  const inv = await prisma.invoice.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found.');
  const n = note.trim();
  if (n.length < 1 || n.length > 500) return fail(422, 'NOTE', 'Write a note of up to 500 characters.');
  await event(workspaceId, id, 'NOTE', n, actor);
  return { ok: true };
}

export async function snooze(workspaceId: string, id: string, days: number, actor: Actor): Promise<ActionResult> {
  const inv = await openInvoice(workspaceId, id);
  if (!inv) return fail(404, 'NOT_FOUND', 'Open invoice not found.');
  if (!Number.isFinite(days) || days < 1 || days > 90) return fail(422, 'DAYS', 'Snooze for 1 to 90 days.');
  const until = new Date(startOfDay(new Date()).getTime() + Math.round(days) * DAY);
  await prisma.invoice.update({ where: { id }, data: { nextFollowUpAt: until, followUpStatus: 'FOLLOWUP_SCHEDULED' } });
  await event(workspaceId, id, 'SNOOZED', `Follow up again on ${until.toISOString().slice(0, 10)}`, actor);
  return { ok: true };
}

export async function setStatus(workspaceId: string, id: string, status: FollowUpStatus, actor: Actor): Promise<ActionResult> {
  const inv = await openInvoice(workspaceId, id);
  if (!inv) return fail(404, 'NOT_FOUND', 'Open invoice not found.');
  const data: Prisma.InvoiceUpdateInput = { followUpStatus: status };
  if (status !== 'PROMISE_TO_PAY') data.promiseDate = null;
  if (status !== 'DISPUTED') data.disputeReason = null;
  if (status !== 'FOLLOWUP_SCHEDULED') data.nextFollowUpAt = null;
  await prisma.invoice.update({ where: { id }, data });
  await event(workspaceId, id, 'STATUS', `Status set to ${status}`, actor);
  audit(workspaceId, 'status_changed', id, actor, { status });
  return { ok: true };
}

export async function setRisk(workspaceId: string, id: string, score: number | null, actor: Actor): Promise<ActionResult> {
  const inv = await prisma.invoice.findFirst({ where: { id, workspaceId }, select: { id: true } });
  if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found.');
  if (score !== null && !Number.isFinite(score)) return fail(422, 'SCORE', 'Risk is a number from 0 to 100.');
  await prisma.invoice.update({ where: { id }, data: { collectionRiskScore: score === null ? null : Math.max(0, Math.min(100, Math.round(score))) } });
  audit(workspaceId, 'risk_set', id, actor, { score });
  return { ok: true };
}

function money(amount: number, currency: string, country: string) {
  const digits = ['JPY', 'KRW', 'VND', 'CLP'].includes(currency.toUpperCase()) ? 0 : 2;
  try { return amount.toLocaleString(country === 'IN' ? 'en-IN' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); } catch { return amount.toFixed(digits); }
}

export type SendArReminderEmailResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'NO_CLIENT_EMAIL' | 'SMTP_NOT_CONFIGURED' | 'SEND_FAILED'; message?: string };

/** Email a reminder for one invoice in the tone its stage calls for, then record it (count, time, timeline). */
export async function sendArReminderEmailForInvoice(workspaceId: string, invoiceId: string, opts: { tone?: Tone; actor?: Actor } = {}): Promise<SendArReminderEmailResult> {
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
  if (!profile?.smtpHost || !profile.smtpUser || !profile.smtpPassword) return { ok: false, code: 'SMTP_NOT_CONFIGURED' };
  const [workspace, cfg, invoice] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true, countryCode: true } }),
    getSettings(workspaceId),
    prisma.invoice.findFirst({ where: { id: invoiceId, workspaceId }, include: { client: true } }),
  ]);
  if (!invoice) return { ok: false, code: 'NOT_FOUND' };
  const recipients = invoice.clientId ? await getClientRecipients(invoice.clientId, workspaceId, 'reminder') : [];
  const to = recipients.join(', ');
  if (!to) return { ok: false, code: 'NO_CLIENT_EMAIL' };

  const now = new Date();
  const due = effectiveDue({ invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate, paymentTermsDays: invoice.paymentTermsDays ?? invoice.client?.paymentTermsDays ?? null });
  const overdue = daysOverdueOf(due, now);
  const stage = stageFor(invoice.collectionReminders, overdue, cfg);
  const tone: Tone = opts.tone ?? cfg.steps[Math.min(stage, cfg.steps.length - 1)]?.tone ?? 'friendly';
  const currency = (invoice.currency ?? workspace?.baseCurrency ?? 'INR').trim() || 'INR';
  const country = workspace?.countryCode ?? 'IN';
  const outstanding = Math.max(0, num(invoice.totalAmount) - num(invoice.amountReceived));
  const mail = buildDunningEmail({ companyName: profile.companyName, clientName: invoice.client?.name ?? invoice.clientName, invoiceNumber: invoice.invoiceNumber, outstandingAmountFormatted: `${currency} ${money(outstanding, currency, country)}`, dueDateFormatted: due.toISOString().slice(0, 10), daysOverdue: overdue, tone });
  try {
    await sendEmail({ route: 'user', profile, to, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (e) {
    console.error('[ar-collections] reminder email failed', e);
    return { ok: false, code: 'SEND_FAILED', message: e instanceof Error ? e.message : String(e) };
  }
  const keepStatus = ['PROMISE_TO_PAY', 'PROMISE_BROKEN', 'DISPUTED', 'ESCALATED'].includes(invoice.followUpStatus ?? '');
  await prisma.invoice.update({ where: { id: invoice.id }, data: { lastReminderSentAt: now, collectionReminders: Math.max(invoice.collectionReminders + 1, stage + 1), nextFollowUpAt: null, ...(keepStatus ? {} : { followUpStatus: 'REMINDER_SENT' }) } });
  await event(workspaceId, invoice.id, 'REMINDER_SENT', `${tone} reminder emailed to ${to}`, opts.actor ?? { userId: null, email: null }, { tone, daysOverdue: overdue });
  audit(workspaceId, 'reminder_email_sent', invoice.id, opts.actor ?? { userId: null, email: null }, { invoiceNumber: invoice.invoiceNumber, tone, auto: !opts.actor?.userId });
  return { ok: true };
}

/** Promises whose day has passed with the invoice still open become broken promises, so the worklist surfaces them. */
export async function markBrokenPromises(workspaceId: string): Promise<number> {
  const stale = await prisma.invoice.findMany({ where: { workspaceId, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, followUpStatus: 'PROMISE_TO_PAY', promiseDate: { lt: startOfDay(new Date()) } }, select: { id: true, promiseDate: true }, take: 500 });
  for (const s of stale) {
    await prisma.invoice.update({ where: { id: s.id }, data: { followUpStatus: 'PROMISE_BROKEN' } });
    await event(workspaceId, s.id, 'PROMISE_BROKEN', `Promised ${s.promiseDate?.toISOString().slice(0, 10)}; not paid`, { userId: null, email: null });
  }
  return stale.length;
}

export type ReminderAutomationResult = { processed: number; emailsSent: number; emailsFailed: number; skippedNoClientEmail: number; smtpConfigured: boolean; brokenPromises: number; blocked?: 'SMTP_NOT_CONFIGURED' | 'RATE_LIMIT_COOLDOWN' };
const AUTOMATION_COOLDOWN_MS = 60_000;

/** Send every reminder the ladder says is due (never to paused invoices), up to 50 a run. */
export async function runReminderAutomation(workspaceId: string, actor?: { userId: string | null; email: string | null }): Promise<ReminderAutomationResult> {
  const now = new Date();
  const moduleRow = await prisma.workspaceModule.findUnique({ where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'AR_COLLECTIONS' } }, select: { configJson: true } });
  const cfg = (moduleRow?.configJson ?? {}) as { lastReminderAutomationAt?: string };
  const lastRun = cfg.lastReminderAutomationAt ? new Date(cfg.lastReminderAutomationAt).getTime() : 0;
  if (lastRun && now.getTime() - lastRun < AUTOMATION_COOLDOWN_MS) { const err = new Error('RATE_LIMIT_COOLDOWN'); (err as Error & { code?: string }).code = 'RATE_LIMIT_COOLDOWN'; throw err; }

  const brokenPromises = await markBrokenPromises(workspaceId);
  const snap = await getArCollectionsSnapshot(workspaceId, { view: 'actionable' });
  const due = snap.rows.filter((r) => r.action.kind === 'REMIND').slice(0, 50);
  const base = { processed: 0, emailsSent: 0, emailsFailed: 0, skippedNoClientEmail: 0, smtpConfigured: snap.smtpReminderReady, brokenPromises };
  if (!due.length) return base;
  if (!snap.smtpReminderReady) {
    await logActivity({ workspaceId, action: 'ar_collections.automation_blocked', status: 'FAILURE', actor: { userId: actor?.userId ?? null, email: actor?.email ?? null }, entity: { type: 'workspace', id: workspaceId }, metadata: { reason: 'SMTP_NOT_CONFIGURED', candidateCount: due.length } });
    return { ...base, blocked: 'SMTP_NOT_CONFIGURED' };
  }
  let sent = 0, failed = 0, skipped = 0;
  for (const r of due) {
    const res = await sendArReminderEmailForInvoice(workspaceId, r.id, { tone: r.action.tone, actor: actor ?? { userId: null, email: null } });
    if (res.ok) sent += 1; else if (res.code === 'NO_CLIENT_EMAIL') skipped += 1; else failed += 1;
  }
  const merged = { ...(moduleRow?.configJson as Record<string, unknown> | null ?? {}), lastReminderAutomationAt: now.toISOString() } as Prisma.InputJsonValue;
  await prisma.workspaceModule.upsert({ where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'AR_COLLECTIONS' } }, create: { workspaceId, moduleKey: 'AR_COLLECTIONS', isEnabled: true, configJson: merged }, update: { configJson: merged } });
  await logActivity({ workspaceId, action: 'ar_collections.automation_run', status: failed > 0 && sent === 0 ? 'FAILURE' : 'SUCCESS', actor: { userId: actor?.userId ?? null, email: actor?.email ?? null }, entity: { type: 'workspace', id: workspaceId }, metadata: { emailsSent: sent, emailsFailed: failed, skippedNoClientEmail: skipped, candidateCount: due.length, brokenPromises } });
  return { processed: sent, emailsSent: sent, emailsFailed: failed, skippedNoClientEmail: skipped, smtpConfigured: true, brokenPromises };
}

export async function getTimeline(workspaceId: string, invoiceId: string) {
  const events = await prisma.invoiceEvent.findMany({ where: { workspaceId, invoiceId }, orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, type: true, message: true, createdAt: true } });
  return events.map((e) => ({ id: e.id, type: e.type, message: e.message, at: e.createdAt.toISOString() }));
}
