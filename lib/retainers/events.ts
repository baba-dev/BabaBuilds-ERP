import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type RetainerEventType =
  | "CREATED" | "EDITED" | "PAUSED" | "RESUMED" | "CANCELLED" | "COMPLETED"
  | "BILLED" | "BILL_FAILED" | "EMAIL_FAILED" | "USAGE_ADDED" | "USAGE_REMOVED"
  | "PRICE_SCHEDULED" | "PRICE_CHANGED" | "RENEWED" | "REMINDER_SENT" | "REMINDER_FAILED";

export async function addRetainerEvent(
  db: Db,
  input: { workspaceId: string; retainerId: string; type: RetainerEventType; message?: string | null; metadata?: Record<string, unknown> | null; actorUserId?: string | null },
) {
  return db.retainerEvent.create({
    data: {
      workspaceId: input.workspaceId,
      retainerId: input.retainerId,
      type: input.type,
      message: input.message ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      actorUserId: input.actorUserId ?? null,
    },
  });
}
