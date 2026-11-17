import 'server-only';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/** Non-sensitive pilot payload: only a task identifier; title/content are read at execution. */
export const DEADLINE_KIND = 'inapp_task_deadline_v1';
type OutboxClient = Pick<Prisma.TransactionClient, 'erpJobOutbox'>;

export function deadlineOccurrenceKey(taskId: string, dueDate: Date): string {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(taskId) ||
      !(dueDate instanceof Date) || !Number.isFinite(dueDate.getTime())) {
    throw new Error('INVALID_DEADLINE_JOB');
  }
  return 'task-' + taskId + '-due-' + dueDate.toISOString().slice(0, 10);
}

/**
 * Can run inside an existing Prisma $transaction; commit outbox together with
 * business state when used by a future transactional producer.
 * Unique occurrence prevents cron replays from scheduling duplicate notices.
 */
export async function recordDeadlineInAppJob(
  input: { workspaceId: string; taskId: string; dueDate: Date },
  db: OutboxClient = prisma,
): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(input.workspaceId)) {
    throw new Error('INVALID_WORKSPACE');
  }
  const dedupeKey = deadlineOccurrenceKey(input.taskId, input.dueDate);
  await db.erpJobOutbox.upsert({
    where: { workspaceId_kind_dedupeKey: {
      workspaceId: input.workspaceId, kind: DEADLINE_KIND, dedupeKey,
    } },
    update: {},
    create: {
      workspaceId: input.workspaceId, kind: DEADLINE_KIND, dedupeKey,
      payloadJson: { taskId: input.taskId },
    },
    select: { id: true },
  });
}
