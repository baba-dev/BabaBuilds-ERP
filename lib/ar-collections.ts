import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const AGING_BUCKETS = [
  { key: 'current', label: 'Current', min: Number.NEGATIVE_INFINITY, max: -1 },
  { key: 'd1_30', label: '1-30 days', min: 0, max: 30 },
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
};

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return Number(value);
}

function resolveOutstandingAmount(invoice: {
  totalAmount: Prisma.Decimal;
  amountReceived: Prisma.Decimal | null;
}): number {
  const total = decimalToNumber(invoice.totalAmount);
  const received = decimalToNumber(invoice.amountReceived);
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

function normalizeRiskScore(value: number | null | undefined): number {
  if (!value || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computePriorityScore(params: {
  daysOverdue: number;
  outstandingAmount: number;
  riskScore: number;
  followUpStatus: string | null;
}): number {
  const ageWeight = Math.min(100, params.daysOverdue * 1.5);
  const amountWeight = Math.min(100, params.outstandingAmount / 500);
  const riskWeight = params.riskScore;
  const statusBoost = params.followUpStatus === 'PROMISE_BROKEN' ? 20 : params.followUpStatus === 'ESCALATED' ? 15 : 0;
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
}> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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

  return { rows, totals, buckets };
}

export async function runReminderAutomation(workspaceId: string): Promise<{ processed: number }> {
  const now = new Date();
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
    take: 100,
  });

  if (candidates.length === 0) return { processed: 0 };

  await prisma.invoice.updateMany({
    where: { id: { in: candidates.map((row) => row.id) }, workspaceId },
    data: {
      lastReminderSentAt: now,
      followUpStatus: 'REMINDER_SENT',
    },
  });

  return { processed: candidates.length };
}
