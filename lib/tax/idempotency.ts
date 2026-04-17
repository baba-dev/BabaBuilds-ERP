import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function buildTaxRequestHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export type ConsumeTaxIdempotencyResult<T> =
  | { kind: 'replay'; body: T }
  | { kind: 'conflict' }
  | { kind: 'fresh'; body: T };

export async function consumeTaxIdempotency<T>(params: {
  db: Db;
  workspaceId: string;
  operation: string;
  idempotencyKey: string | null | undefined;
  requestHash: string;
  execute: () => Promise<T>;
  ttlMs?: number;
}): Promise<ConsumeTaxIdempotencyResult<T>> {
  const key = params.idempotencyKey?.trim();
  if (!key) {
    const body = await params.execute();
    return { kind: 'fresh', body };
  }

  const expiresAt = new Date(Date.now() + (params.ttlMs ?? DEFAULT_TTL_MS));

  await params.db.taxOperationIdempotency.deleteMany({
    where: {
      workspaceId: params.workspaceId,
      expiresAt: { lt: new Date() },
    },
  });

  const existing = await params.db.taxOperationIdempotency.findUnique({
    where: {
      workspaceId_operation_idempotencyKey: {
        workspaceId: params.workspaceId,
        operation: params.operation,
        idempotencyKey: key,
      },
    },
  });

  if (existing) {
    if (existing.requestHash !== params.requestHash) {
      return { kind: 'conflict' };
    }
    return { kind: 'replay', body: existing.responseBody as T };
  }

  const body = await params.execute();

  await params.db.taxOperationIdempotency.create({
    data: {
      workspaceId: params.workspaceId,
      operation: params.operation,
      idempotencyKey: key,
      requestHash: params.requestHash,
      status: 'CONSUMED',
      expiresAt,
      responseBody: body as Prisma.InputJsonValue,
    },
  });

  return { kind: 'fresh', body };
}
