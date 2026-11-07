import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type InvoiceEventType =
  | "CREATED"
  | "SENT"
  | "REMINDER_SENT"
  | "PAYMENT_RECORDED"
  | "PAYMENT_REVERSED"
  | "VOIDED"
  | "STOCK_COMMITTED"
  | "STOCK_RESTORED";

/** Append-only timeline entry. Never throws into the caller's business flow when used outside a transaction. */
export async function addInvoiceEvent(
  db: Db,
  input: {
    workspaceId: string;
    invoiceId: string;
    type: InvoiceEventType;
    message?: string | null;
    metadata?: Record<string, unknown> | null;
    actorUserId?: string | null;
  },
) {
  return db.invoiceEvent.create({
    data: {
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
      type: input.type,
      message: input.message ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      actorUserId: input.actorUserId ?? null,
    },
  });
}
