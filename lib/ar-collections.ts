import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { buildPaymentReminderEmail } from '@/lib/notifications/transactional-email-templates';
import { logActivity } from '@/lib/security/activity-log';

/** Closed set stored on Invoice.followUpStatus — keep in sync with UI selects. */
export const FOLLOW_UP_STATUSES = [
  'UNTOUCHED',
  'REMINDER_SENT',
  'FOLLOWUP_SCHEDULED',
  'PROMISE_TO_PAY',
  'PROMISE_BROKEN',
  'DISPUTED',
  'ESCALATED',
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

const FOLLOW_UP_SET = new Set<string>(FOLLOW_UP_STATUSES);

export function parseFollowUpStatus(raw: unknown): FollowUpStatus | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return FOLLOW_UP_SET.has(trimmed) ? (trimmed as FollowUpStatus) : null;
}

/**
 * Aging buckets for open receivables. `current` = not yet overdue (days overdue ≤ 0).
 * The numeric ranges describe overdue days for non-current buckets only.
 */
export const AGING_BUCKETS = [
  { key: 'current', label: 'Current (not overdue)', min: 0, max: 0 },
  { key: 'd1_30', label: '1-30 days', min: 1, max: 30 },
  { key: 'd31_60', label: '31-60 days', min: 31, max: 60 },
  { key: 'd61_90', label: '61-90 days', min: 61, max: 90 },
  { key: 'd90_plus', label: '90+ days', min: 91, max: Number.POSITIVE_INFINITY },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key'];

export type ArCollectionRow = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  dueDate: string | null;
  daysOverdue: number;
  bucket: AgingBucketKey;
  outstandingAmount: number;
  status: string;
  followUpStatus: string | null;
  lastReminderSentAt: string | null;
  priorityScore: number;
  collectionRiskScore: number | null;
};

function decimalToNumberLocal(value: Prisma.Decimal | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(value);
}

function resolveOutstandingAmount(invoice: {
  totalAmount: Prisma.Decimal;
  amountReceived: Prisma.Decimal | null;
}): number {
  const total = decimalToNumberLocal(invoice.totalAmount);
  const received = decimalToNumberLocal(invoice.amountReceived);
  return Math.max(0, total - received);
}

function resolveDaysOverdue(dueDate: Date | null, now: Date): number {
  if (!dueDate) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / msPerDay));
}

function resolveBucket(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90_plus';
}

/** Treats null/undefined/NaN as unset (default 50). Legitimate 0 is preserved. */
export function normalizeRiskScore(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Amount axis: 100 points when outstanding ≥ 1% of reference (e.g. 100k INR → 1k). */
function computePriorityScore(params: {
  daysOverdue: number;
  outstandingAmount: number;
  riskScore: number;
  followUpStatus: string | null;
  amountReference: number;
}): number {
  const ref = Math.max(1, params.amountReference);
  const amountWeight = Math.min(100, (params.outstandingAmount / ref) * 100);
  const ageWeight = Math.min(100, params.daysOverdue * 1.5);
  const riskWeight = params.riskScore;
  const statusBoost =
    params.followUpStatus === 'PROMISE_BROKEN' ? 20 : params.followUpStatus === 'ESCALATED' ? 15 : 0;
  return Math.round(ageWeight * 0.4 + amountWeight * 0.3 + riskWeight * 0.3 + statusBoost);
}

export async function getArCollectionsSnapshot(workspaceId: string): Promise<{
  rows: ArCollectionRow[];
  totals: {
    totalOutstanding: number;
    overdueInvoices: number;
    overdueAmount: number;
    remindersSentLast7Days: number;
  };
  buckets: Array<{ key: AgingBucketKey; label: string; count: number; amount: number }>;
  workspace: { baseCurrency: string; countryCode: string };
  smtpReminderReady: boolean;
}> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { baseCurrency: true, countryCode: true },
  });
  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: { smtpHost: true, smtpUser: true, smtpPassword: true },
  });
  const baseCurrency = (workspace?.baseCurrency ?? 'INR').trim() || 'INR';
  const smtpReminderReady = Boolean(profile?.smtpHost && profile.smtpUser && profile.smtpPassword);
  const amountReference = majorUnitFromMinorBase(100_000, baseCurrency);

  const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId,
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
    },
    select: {
      id: true,
      invoiceNumber: true,
      clientName: true,
      dueDate: true,
      totalAmount: true,
      amountReceived: true,
      status: true,
      followUpStatus: true,
      lastReminderSentAt: true,
      collectionRiskScore: true,
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
  });

  const rows = invoices.map((invoice) => {
    const outstandingAmount = resolveOutstandingAmount(invoice);
    const daysOverdue = resolveDaysOverdue(invoice.dueDate, now);
    const bucket = resolveBucket(daysOverdue);
    const priorityScore = computePriorityScore({
      daysOverdue,
      outstandingAmount,
      riskScore: normalizeRiskScore(invoice.collectionRiskScore),
      followUpStatus: invoice.followUpStatus,
      amountReference,
    });

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      dueDate: invoice.dueDate?.toISOString() ?? null,
      daysOverdue,
      bucket,
      outstandingAmount,
      status: invoice.status,
      followUpStatus: invoice.followUpStatus,
      lastReminderSentAt: invoice.lastReminderSentAt?.toISOString() ?? null,
      priorityScore,
      collectionRiskScore:
        invoice.collectionRiskScore === null || invoice.collectionRiskScore === undefined
          ? null
          : normalizeRiskScore(invoice.collectionRiskScore),
    } satisfies ArCollectionRow;
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalOutstanding += row.outstandingAmount;
      if (row.daysOverdue > 0) {
        acc.overdueInvoices += 1;
        acc.overdueAmount += row.outstandingAmount;
      }
      if (row.lastReminderSentAt && new Date(row.lastReminderSentAt) >= sevenDaysAgo) {
        acc.remindersSentLast7Days += 1;
      }
      return acc;
    },
    { totalOutstanding: 0, overdueInvoices: 0, overdueAmount: 0, remindersSentLast7Days: 0 },
  );

  const buckets = AGING_BUCKETS.map((bucket) => {
    const bucketRows = rows.filter((row) => row.bucket === bucket.key);
    return {
      key: bucket.key,
      label: bucket.label,
      count: bucketRows.length,
      amount: bucketRows.reduce((sum, row) => sum + row.outstandingAmount, 0),
    };
  });

  rows.sort((a, b) => b.priorityScore - a.priorityScore || b.outstandingAmount - a.outstandingAmount);

  return {
    rows,
    totals,
    buckets,
    workspace: {
      baseCurrency,
      countryCode: (workspace?.countryCode ?? 'IN').trim() || 'IN',
    },
    smtpReminderReady,
  };
}

/** ISO 4217 minor units — for weighting amounts in tenant currency. */
function minorUnitsForCurrency(code: string): number {
  const c = code.trim().toUpperCase();
  const zeroDecimal = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
  const threeDecimal = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
  if (zeroDecimal.has(c)) return 0;
  if (threeDecimal.has(c)) return 3;
  return 2;
}

function majorUnitFromMinorBase(minorBase: number, currencyCode: string): number {
  const exp = minorUnitsForCurrency(currencyCode);
  return minorBase / 10 ** exp;
}

export type ReminderAutomationResult = {
  /** Invoices that received a reminder email and were stamped in this run */
  processed: number;
  emailsSent: number;
  emailsFailed: number;
  skippedNoClientEmail: number;
  smtpConfigured: boolean;
  blocked?: 'SMTP_NOT_CONFIGURED' | 'RATE_LIMIT_COOLDOWN';
};

const AUTOMATION_COOLDOWN_MS = 60_000;

export async function runReminderAutomation(
  workspaceId: string,
  actor?: { userId: string | null; email: string | null },
): Promise<ReminderAutomationResult> {
  const now = new Date();

  const moduleRow = await prisma.workspaceModule.findUnique({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'AR_COLLECTIONS' } },
    select: { configJson: true },
  });
  const cfg = (moduleRow?.configJson ?? {}) as { lastReminderAutomationAt?: string };
  const lastRun = cfg.lastReminderAutomationAt ? new Date(cfg.lastReminderAutomationAt).getTime() : 0;
  if (lastRun && now.getTime() - lastRun < AUTOMATION_COOLDOWN_MS) {
    const err = new Error('RATE_LIMIT_COOLDOWN');
    (err as Error & { code?: string }).code = 'RATE_LIMIT_COOLDOWN';
    throw err;
  }

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { baseCurrency: true, countryCode: true },
  });
  const baseCurrency = (workspace?.baseCurrency ?? 'INR').trim() || 'INR';

  const smtpConfigured = Boolean(profile?.smtpHost && profile.smtpUser && profile.smtpPassword);

  const candidates = await prisma.invoice.findMany({
    where: {
      workspaceId,
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      dueDate: { lt: now },
      OR: [
        { lastReminderSentAt: null },
        { lastReminderSentAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
      ],
    },
    select: { id: true },
    take: 50,
    orderBy: { dueDate: 'asc' },
  });

  if (candidates.length === 0) {
    return { processed: 0, emailsSent: 0, emailsFailed: 0, skippedNoClientEmail: 0, smtpConfigured };
  }

  if (!smtpConfigured || !profile) {
    await logActivity({
      workspaceId,
      action: 'ar_collections.automation_blocked',
      status: 'FAILURE',
      actor: { userId: actor?.userId ?? null, email: actor?.email ?? null },
      entity: { type: 'workspace', id: workspaceId },
      metadata: { reason: 'SMTP_NOT_CONFIGURED', candidateCount: candidates.length },
    });
    return {
      processed: 0,
      emailsSent: 0,
      emailsFailed: 0,
      skippedNoClientEmail: 0,
      smtpConfigured: false,
      blocked: 'SMTP_NOT_CONFIGURED',
    };
  }

  let emailsSent = 0;
  let emailsFailed = 0;
  let skippedNoClientEmail = 0;

  for (const c of candidates) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: c.id, workspaceId },
      include: { client: true },
    });
    if (!invoice) continue;

    const to = invoice.client?.email?.trim();
    if (!to) {
      skippedNoClientEmail += 1;
      continue;
    }

    const outstanding = resolveOutstandingAmount(invoice);
    const invoiceCurrency = (invoice.currency ?? baseCurrency).trim() || baseCurrency;
    const formatted = formatMoneyForLocale(outstanding, invoiceCurrency, workspace?.countryCode ?? 'IN');
    const reminderEmail = buildPaymentReminderEmail({
      companyName: profile.companyName,
      clientName: invoice.client?.name ?? invoice.clientName,
      invoiceNumber: invoice.invoiceNumber,
      outstandingAmountFormatted: `${invoiceCurrency} ${formatted}`,
    });

    try {
      await sendEmail({
        route: 'user',
        profile,
        to,
        subject: reminderEmail.subject,
        html: reminderEmail.html,
        text: reminderEmail.text,
      });

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          lastReminderSentAt: now,
          followUpStatus: 'REMINDER_SENT',
        },
      });
      emailsSent += 1;
    } catch (e) {
      console.error('[ar-collections] reminder email failed', e);
      emailsFailed += 1;
    }
  }

  await prisma.workspaceModule.upsert({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'AR_COLLECTIONS' } },
    create: {
      workspaceId,
      moduleKey: 'AR_COLLECTIONS',
      isEnabled: true,
      configJson: {
        ...cfg,
        lastReminderAutomationAt: now.toISOString(),
      } as Prisma.InputJsonValue,
    },
    update: {
      configJson: {
        ...cfg,
        lastReminderAutomationAt: now.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  await logActivity({
    workspaceId,
    action: 'ar_collections.automation_run',
    status: emailsFailed > 0 && emailsSent === 0 ? 'FAILURE' : 'SUCCESS',
    actor: { userId: actor?.userId ?? null, email: actor?.email ?? null },
    entity: { type: 'workspace', id: workspaceId },
    metadata: {
      emailsSent,
      emailsFailed,
      skippedNoClientEmail,
      candidateCount: candidates.length,
    },
  });

  return {
    processed: emailsSent,
    emailsSent,
    emailsFailed,
    skippedNoClientEmail,
    smtpConfigured: true,
  };
}

function formatMoneyForLocale(amount: number, currencyCode: string, countryCode: string): string {
  const minor = minorUnitsForCurrency(currencyCode);
  try {
    const localeTag = countryCode === 'US' ? 'en-US' : countryCode === 'IN' ? 'en-IN' : 'en-US';
    return amount.toLocaleString(localeTag, {
      minimumFractionDigits: minor,
      maximumFractionDigits: minor,
    });
  } catch {
    return amount.toFixed(minor);
  }
}

export type SendArReminderEmailResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'NO_CLIENT_EMAIL' | 'SMTP_NOT_CONFIGURED' | 'SEND_FAILED'; message?: string };

/**
 * Sends a payment reminder email for one invoice when SMTP is configured.
 * On success, updates lastReminderSentAt (caller may also set follow-up status).
 */
export async function sendArReminderEmailForInvoice(
  workspaceId: string,
  invoiceId: string,
): Promise<SendArReminderEmailResult> {
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
  if (!profile?.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
    return { ok: false, code: 'SMTP_NOT_CONFIGURED' };
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { baseCurrency: true, countryCode: true },
  });
  const baseCurrency = (workspace?.baseCurrency ?? 'INR').trim() || 'INR';

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: { client: true },
  });
  if (!invoice) return { ok: false, code: 'NOT_FOUND' };

  const to = invoice.client?.email?.trim();
  if (!to) return { ok: false, code: 'NO_CLIENT_EMAIL' };

  const outstanding = resolveOutstandingAmount(invoice);
  const invoiceCurrency = (invoice.currency ?? baseCurrency).trim() || baseCurrency;
  const formatted = formatMoneyForLocale(outstanding, invoiceCurrency, workspace?.countryCode ?? 'IN');
  const reminderEmail = buildPaymentReminderEmail({
    companyName: profile.companyName,
    clientName: invoice.client?.name ?? invoice.clientName,
    invoiceNumber: invoice.invoiceNumber,
    outstandingAmountFormatted: `${invoiceCurrency} ${formatted}`,
  });

  try {
    await sendEmail({
      route: 'user',
      profile,
      to,
      subject: reminderEmail.subject,
      html: reminderEmail.html,
      text: reminderEmail.text,
    });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { lastReminderSentAt: new Date() },
    });
    await prisma.invoiceEvent
      .create({ data: { workspaceId, invoiceId: invoice.id, type: 'REMINDER_SENT', message: `Reminder emailed to ${to}` } })
      .catch(() => {});

    await logActivity({
      workspaceId,
      action: 'ar_collections.reminder_email_sent',
      status: 'SUCCESS',
      entity: { type: 'invoice', id: invoice.id },
      metadata: { invoiceNumber: invoice.invoiceNumber, to },
    }).catch(() => {});

    return { ok: true };
  } catch (e) {
    console.error('[ar-collections] sendArReminderEmailForInvoice', e);
    return { ok: false, code: 'SEND_FAILED', message: e instanceof Error ? e.message : String(e) };
  }
}
