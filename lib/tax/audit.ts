import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

type Db = PrismaClient | Prisma.TransactionClient;

export function newTaxCorrelationId(): string {
  return `tax_${randomUUID()}`;
}

export async function appendTaxAuditEvent(
  db: Db,
  input: {
    workspaceId: string;
    eventType: string;
    correlationId?: string | null;
    actorUserId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    payload: Record<string, unknown>;
  },
) {
  await db.taxAuditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      correlationId: input.correlationId ?? null,
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payloadJson: input.payload as Prisma.InputJsonValue,
    },
  });
}
