import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { canonicalReportRecipients, reportOccurrenceKey } from '@/lib/jobs/report-routing';

type DueReport = {
  id: string; workspaceId: string; reportId: string; name: string;
  createdByUserId: string | null; paramsJson: unknown;
  scheduleFrequency: string | null; scheduleRecipients: string | null;
  scheduleEnabled: boolean; scheduleFormat: string; scheduleNextAt: Date | null;
  scheduleHour: number; scheduleTz: string; updatedAt: Date;
};

export function reportSourceFingerprint(view: Pick<DueReport,
  'reportId' | 'name' | 'createdByUserId' | 'paramsJson' |
  'scheduleFrequency' | 'scheduleRecipients' | 'scheduleFormat' |
  'scheduleHour' | 'scheduleTz'>): string {
  const recipients = canonicalReportRecipients(view.scheduleRecipients) ?? [];
  return createHash('sha256').update(JSON.stringify([
    view.reportId, view.name, view.createdByUserId, view.paramsJson,
    view.scheduleFrequency, recipients.slice().sort(),
    view.scheduleFormat, view.scheduleHour, view.scheduleTz,
  ])).digest('hex');
}

export function reportRecipientKey(address: string): string {
  return createHash('sha256').update(
    'erp:delivery:v1:REPORT_EMAIL:' + address.trim().toLowerCase(),
  ).digest('hex');
}

/**
 * One CAS schedule claim and all recipient intents in the same DB commit.
 * Advancing scheduleNextAt reserves the occurrence, NOT provider acceptance.
 * scheduleLastAt remains unchanged until a worker observes accepted delivery.
 * No client secrets, report financial cells or recipient addresses in Redis.
 */
export async function enqueueDueScheduledReport(
  view: DueReport,
  nextScheduledAt: Date,
): Promise<'ENQUEUED' | 'LOST_RACE' | 'INVALID_RECIPIENTS'> {
  const dueAt = view.scheduleNextAt;
  if (!dueAt || !Number.isFinite(dueAt.getTime()) ||
      !Number.isFinite(nextScheduledAt.getTime()) ||
      nextScheduledAt <= dueAt || !view.scheduleEnabled ||
      !['WEEKLY', 'MONTHLY'].includes(view.scheduleFrequency ?? '') ||
      !['PDF', 'CSV', 'BOTH'].includes(view.scheduleFormat)) {
    throw new Error('INVALID_REPORT_SCHEDULE_STATE');
  }
  const recipients = canonicalReportRecipients(view.scheduleRecipients);
  const kind = 'scheduled_report_email_v1';
  const occurrenceKey = reportOccurrenceKey(view.id, dueAt);
  const fingerprint = reportSourceFingerprint(view);
  const candidateId = randomUUID();

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.reportView.updateMany({
      where: {
        id: view.id, workspaceId: view.workspaceId,
        scheduleNextAt: dueAt, scheduleFrequency: view.scheduleFrequency,
        scheduleEnabled: true, updatedAt: view.updatedAt,
      },
      data: {
        scheduleNextAt: nextScheduledAt,
        scheduleLastError: recipients ? null : 'INVALID_REPORT_RECIPIENTS',
      },
    });
    if (claimed.count !== 1) return 'LOST_RACE';
    if (!recipients) return 'INVALID_RECIPIENTS';
    const source = await tx.erpJobOutbox.upsert({
      where: { workspaceId_kind_dedupeKey: {
        workspaceId: view.workspaceId, kind: 'scheduled_report_source_v1',
        dedupeKey: occurrenceKey,
      } },
      update: {},
      create: {
        id: candidateId, workspaceId: view.workspaceId,
        kind: 'scheduled_report_source_v1',
        dedupeKey: occurrenceKey, status: 'DONE', processedAt: new Date(),
        payloadJson: {
          schema: 1, reportViewId: view.id, scheduledAt: dueAt.toISOString(),
          fingerprint, expectedRecipients: recipients.length,
        },
      },
      select: { id: true },
    });
    if (source.id !== candidateId) {
      // This is an invalid inconsistent source/schedule state. A rolled-back
      // claim is safer than silently skipping an occurrence.
      throw new Error('DUPLICATE_REPORT_SOURCE_INCONSISTENCY');
    }
    for (const recipient of recipients) {
      const recipientKey = reportRecipientKey(recipient);
      await tx.erpJobDelivery.upsert({
        where: { workspaceId_eventKind_occurrenceKey_channel_recipientKey: {
          workspaceId: view.workspaceId,
          eventKind: kind, occurrenceKey,
          channel: 'REPORT_EMAIL', recipientKey,
        } },
        update: {},
        create: {
          workspaceId: view.workspaceId,
          eventKind: kind, occurrenceKey,
          channel: 'REPORT_EMAIL', recipientKey,
        },
        select: { id: true },
      });
    }
    return 'ENQUEUED';
  }, { timeout: 15_000 });
}
